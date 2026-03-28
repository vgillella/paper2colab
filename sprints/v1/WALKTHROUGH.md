# Sprint v1 — Walkthrough: Paper2Colab

## Summary

Built a complete, single-page web application that takes a research paper PDF and an OpenAI API
key as inputs, calls `gpt-4.5-preview` (or any configured model) with a structured prompt, and
returns a production-quality Jupyter notebook (`.ipynb`) implementing the paper's algorithms.
The UI is a dark, research-grade design inspired by arcprize.org/arc-agi, with live Server-Sent
Events (SSE) progress streaming so the user stays engaged during the 60–90 second generation
wait. The generated notebook can be downloaded directly or opened in Google Colab via a GitHub
Gist link.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                         │
│                                                                  │
│  ┌──────────────────┐  ┌───────────────────────────────────┐    │
│  │  ApiKeyInput     │  │  PdfUploadZone                    │    │
│  │  (password input │  │  (drag-and-drop or click-to-     │    │
│  │   + show/hide)   │  │   browse; shows filename on pick) │    │
│  └──────────────────┘  └───────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  ProgressFeed  (SSE live updates while processing)       │    │
│  │  ✓ Starting...                                           │    │
│  │  ✓ Extracting PDF text...                                │    │
│  │  ▶ Generating notebook... ▌   (typewriter animation)    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │  Download .ipynb     │  │  Open in Colab ↗             │     │
│  └──────────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────┬────────────────────────────────────┘
                              │ POST /api/generate
                              │ multipart/form-data: { pdf, apiKey }
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Next.js API Route (Node.js)                    │
│                                                                  │
│  app/api/generate/route.ts — SSE streaming pipeline:            │
│                                                                  │
│  1. Parse multipart form → extract Buffer from PDF File         │
│  2. pdf-parse v2 (PDFParse class) → extract plain text          │
│  3. OpenAI SDK → gpt-4.5-preview → structured JSON response     │
│  4. parseNotebookResponse() → NotebookSpec                      │
│  5. assembleNotebook() → JupyterNotebook (nbformat v4 JSON)     │
│  6. uploadToGist() → GitHub Gist API → Colab URL (non-fatal)    │
│  7. SSE "done" event → { notebookJson, filename, colabUrl }     │
│                                                                  │
│  Each step emits an SSE "progress" event as it starts.          │
└─────────────────────────────┬────────────────────────────────────┘
                              │
              ┌───────────────┴──────────────┐
              ▼                              ▼
  ┌──────────────────────┐     ┌──────────────────────────┐
  │  OpenAI API          │     │  GitHub Gist API         │
  │  gpt-4.5-preview     │     │  api.github.com/gists    │
  │  max_completion_     │     │  (unauthenticated POST)  │
  │  tokens: 16000       │     │  Returns gist ID for     │
  │  response_format:    │     │  Colab URL construction  │
  │    json_object       │     └──────────────────────────┘
  └──────────────────────┘
```

---

## Files Created/Modified

### `app/layout.tsx`
**Purpose**: Root Next.js layout — loads fonts and sets page metadata.

**How it works**:
Loads Inter (body text) and JetBrains Mono (monospace elements) via `next/font/google`, injecting
them as CSS variables `--font-sans` and `--font-mono`. The `globals.css` `@theme inline` block
then maps these to Tailwind's `font-sans` and `font-mono` utilities. This is the only server
component in the project — everything else is `"use client"`.

---

### `app/globals.css`
**Purpose**: Tailwind v4 configuration and global ARC-AGI dark theme CSS variables.

**How it works**:
Uses Tailwind v4's `@import "tailwindcss"` syntax (not the old `@tailwind` directives). The
`@theme inline` block maps CSS custom properties to Tailwind color tokens so that classes like
`bg-primary` and `text-muted-foreground` resolve to the ARC-AGI palette:

```css
@theme inline {
  --color-background: var(--background);  /* oklch(0.039 0 0) — near-black #0a0a0a */
  --color-primary:    var(--primary);     /* oklch(0.81 0.14 206) — teal #00d4ff   */
  --color-foreground: var(--foreground);  /* oklch(0.922 0 0) — off-white #e5e7eb  */
}
```

The `:root` block under `@layer base` defines every design token. `--radius: 0rem` enforces the
sharp-border (no pill/rounded) aesthetic. A `cursor-blink` keyframe animation powers the
typewriter cursor in the progress feed.

---

### `app/page.tsx`
**Purpose**: Main client component — owns the entire app state machine and SSE stream reader.

**Key state**:
- `appState: "idle" | "processing" | "done" | "error"` — drives which UI panels are visible
- `messages: ProgressMessage[]` — the live progress log fed to `ProgressFeed`
- `result: { notebookJson, filename, colabUrl, title } | null` — populated on success

**How it works**:
The form submission calls `fetch("/api/generate", { method: "POST", body: formData })`. Because
SSE requires reading a streaming body (and EventSource only supports GET), the response body is
read manually using `response.body.getReader()`:

```typescript
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n\n");   // SSE delimiter
  buffer = lines.pop() ?? "";           // keep partial chunk
  for (const chunk of lines) {
    // parse "data: {...}" → dispatch to state
  }
}
```

Each SSE event type routes to a different state update: `progress` → appends to message list,
`done` → sets result and transitions to `"done"` state, `error` → throws (caught by the outer
try/catch, transitions to `"error"` state).

The header status dot reflects the current state: pulsing teal (processing), solid green (done),
red (error), dim grey (idle).

---

### `components/api-key-input.tsx`
**Purpose**: Password input for the OpenAI API key with show/hide toggle and blur validation.

**Key behaviour**:
- `type="password"` by default; toggled to `type="text"` via a `SHOW/HIDE` button
- Inline error appears on blur if the key is shorter than 20 characters (an obviously wrong key)
- Error uses `data-testid="api-key-error"` for E2E assertions
- Never transmits the key server-side until the form is submitted; no persistence anywhere

---

### `components/pdf-upload-zone.tsx`
**Purpose**: Drag-and-drop PDF upload zone with a hidden `<input type="file">` for click-to-browse.

**How it works**:
A visible `<div role="button">` handles `onDragOver`, `onDragLeave`, and `onDrop` events. An
`<input type="file" className="sr-only">` (visually hidden but accessible) is triggered
programmatically via `inputRef.current?.click()`. This dual approach is needed because styled
drag-and-drop zones cannot directly be an `<input>`. Only `application/pdf` files are accepted;
non-PDF drops are silently ignored. On file selection, the zone switches from the upload-arrow
state to a file-doc icon showing the filename and size.

---

### `components/progress-feed.tsx`
**Purpose**: Animated live progress log that displays SSE status messages.

**Key components**:
- `useTypewriter(text, active, speed=18)` — reveals the active message character-by-character at
  18ms per char using `setInterval`. Completed messages show the full text instantly.
- `MessageRow` — renders one message with a left glyph: `✓` (done, 40% opacity), `▶` pulsing
  teal (active, with blinking cursor), `·` grey (pending)
- `ProgressFeed` — header row shows a pulsing dot + "PROCESSING" while running, then `✓ Complete`

```typescript
function useTypewriter(text: string, active: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(active ? "" : text);
  useEffect(() => {
    if (!active) { setDisplayed(text); return; }
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, ++i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, active, speed]);
  return displayed;
}
```

---

### `components/result-actions.tsx`
**Purpose**: Download and Open-in-Colab action buttons shown after successful generation.

**How it works**:
Download creates a `Blob` from the notebook JSON string, generates a temporary object URL, and
programmatically clicks a hidden `<a>` to trigger the browser's save dialog — no server round-trip.
The "Open in Colab" button is conditionally rendered only when `colabUrl` is non-null; when absent
(Gist upload failed), a fallback paragraph links to colab.research.google.com with instructions
to upload manually.

---

### `lib/pdf-utils.ts`
**Purpose**: Extract plain text from a PDF buffer using pdf-parse v2.

**How it works**:
pdf-parse is lazy-loaded with `require('pdf-parse')` inside the function body to avoid the
pdfjs-dist DOM initialisation error that occurs when the module is imported at the top level in
Next.js. Version 2.x uses a class-based API — `new PDFParse({ data: Uint8Array })` — unlike the
v1 function call:

```typescript
const { PDFParse } = require('pdf-parse');
const parser = new PDFParse({ data: new Uint8Array(buffer) });
const result = await parser.getText();
return result.text; // concatenated text of all pages
```

`validateGenerateRequest()` checks that both `apiKey` and `pdfBuffer` are present and non-empty,
returning an array of field names that failed (used to build the 400 error response).

---

### `lib/prompt.ts`
**Purpose**: Defines the OpenAI system prompt, user message builder, and response parser.

**Key exports**:
- `buildSystemPrompt()` — returns a ~2KB system prompt instructing the model to output a JSON
  object with `{ title, summary, cells[] }`. The prompt mandates 8 notebook sections
  (Introduction → Background → Algorithm → Implementation → Synthetic Data → Experiments →
  Results → Discussion), prohibits toy examples, and requires publication-quality matplotlib
  plots with LaTeX math.
- `buildUserMessage(pdfText)` — wraps the extracted PDF text between `=== PAPER TEXT START ===`
  delimiters and trims to 80,000 characters (~20k tokens) to stay within context limits.
- `parseNotebookResponse(raw)` — strips optional markdown code fences, parses JSON, validates the
  `cells` array exists, and maps each cell to `{ type, source, section }`. Falls back gracefully
  on missing optional fields.

---

### `lib/openai-client.ts`
**Purpose**: Wraps the OpenAI SDK to call the configured model and return a `NotebookSpec`.

**Key configuration**:
```typescript
export const MODEL_ID = process.env.OPENAI_MODEL ?? 'gpt-4.5-preview';
// Uses max_completion_tokens (not max_tokens — required by gpt-4.5-preview)
// response_format: { type: 'json_object' } — guarantees valid JSON output
// temperature: 0.3 — low for structured, deterministic notebook structure
```

The function emits progress callbacks at two points: before the API call ("Sending paper to AI
model...") and after parsing ("Notebook parsed: N cells generated"), which flow back to the SSE
stream as progress events.

---

### `lib/notebook-assembler.ts`
**Purpose**: Converts a `NotebookSpec` into a valid `nbformat v4` Jupyter notebook JSON object.

**How it works**:
Each `NotebookCell` is mapped to a `MarkdownCell` or `CodeCell` with proper nbformat fields.
Code cells get `execution_count: null` and `outputs: []` (unexecuted state). The notebook
metadata includes Google Colab's `provenance: []` field so Colab recognises it as a Colab
notebook:

```typescript
metadata: {
  kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
  language_info: { name: 'python', version: '3.10.0', ... },
  colab: { provenance: [] },  // required for Colab to show "Open in Colab" UI
}
```

`notebookFilename(title)` slugifies the title (lowercase, alphanumeric + underscores, max 80
chars) and appends `.ipynb`.

---

### `lib/gist-uploader.ts`
**Purpose**: POST the `.ipynb` to GitHub Gist (unauthenticated) and return the Colab URL.

**How it works**:
Sends a public Gist to `api.github.com/gists` — no GitHub token required for public gists. On
success, constructs the Colab deep-link:
```
https://colab.research.google.com/gist/{gistId}/{encodedFilename}
```
The function **never throws** — any failure (network error, rate limit, API error) returns `null`
and logs a warning. This makes Gist upload non-fatal: the user still gets the download button.

---

### `app/api/generate/route.ts`
**Purpose**: The core API route — orchestrates the full pipeline and streams progress via SSE.

**How it works**:
Returns a `ReadableStream` with `Content-Type: text/event-stream`. Each SSE event is a JSON
line in the format `data: {...}\n\n`. The pipeline runs inside the stream's `start()` controller:

```
1. POST received → parse FormData → validate apiKey + pdf
2. If validation fails → return 400 JSON (before stream opens)
3. Open ReadableStream:
   progress("Extracting PDF text...")
   → PDFParse.getText() → pdfText (throws → SSE error event)
   → guard: pdfText.length < 100 → SSE error (image-only PDF)
   progress("Analyzing paper structure...")
   progress("Generating notebook with AI model (60–90 seconds)...")
   → generateNotebook(apiKey, pdfText) → NotebookSpec
   progress("Assembling Jupyter notebook...")
   → assembleNotebook() + notebookToJson()
   progress("Uploading to GitHub Gist...")
   → uploadToGist() → GistResult | null
   → SSE done event: { notebookJson, filename, colabUrl, title }
4. controller.close()
```

OpenAI errors are classified and given user-friendly messages (401 → invalid key, 429 → rate
limit, quota → billing issue).

**Runtime config**:
```typescript
export const runtime = 'nodejs';    // required for pdf-parse (Node.js Buffer API)
export const maxDuration = 180;     // 3-minute timeout for slow OpenAI responses
```

---

### `next.config.mjs`
**Purpose**: Marks `pdf-parse` as a server-external package to bypass webpack bundling.

**Why this is needed**:
pdf-parse depends on `pdfjs-dist`, which uses Node.js-only APIs that webpack fails to bundle for
the Next.js server runtime. `serverComponentsExternalPackages: ['pdf-parse']` tells Next.js to
leave the module as a native `require()` call rather than bundling it, which avoids the
`Object.defineProperty` error from pdfjs-dist.

---

## Data Flow

```
User fills form (API key + PDF file)
  │
  ▼
handleSubmit() → POST /api/generate with FormData
  │
  ▼
API route: parse FormData, validate fields
  │ (400 JSON if invalid — before stream opens)
  ▼
Open ReadableStream → SSE "progress" events begin flowing to browser
  │
  ├─▶ PDFParse({ data: Uint8Array(pdfBuffer) }).getText()
  │     → pdfText string (all pages concatenated)
  │
  ├─▶ OpenAI chat.completions.create({
  │     model: "gpt-4.5-preview",
  │     messages: [systemPrompt, userMessage(pdfText)],
  │     response_format: { type: "json_object" },
  │     max_completion_tokens: 16000
  │   })
  │     → raw JSON string
  │     → parseNotebookResponse() → NotebookSpec { title, summary, cells[] }
  │
  ├─▶ assembleNotebook(spec) → JupyterNotebook (nbformat v4)
  │     → notebookToJson() → JSON string
  │     → notebookFilename(title) → "paper_title.ipynb"
  │
  ├─▶ uploadToGist(json, filename) → GistResult | null
  │     → colabUrl = "colab.research.google.com/gist/{id}/{filename}"
  │
  └─▶ SSE "done" event: { notebookJson, filename, colabUrl, title }
        │
        ▼
      Browser: setResult() → setAppState("done")
        │
        ├─▶ Download button: Blob → object URL → <a>.click()
        └─▶ Colab button: window.open(colabUrl) [if available]
```

---

## Test Coverage

- **Unit (Vitest)**: 31 tests
  - `pdf-extraction.test.ts` (3): `validateGenerateRequest` — missing apiKey, missing pdf, both present
  - `prompt.test.ts` (13): `buildSystemPrompt` structure, `buildUserMessage` trimming,
    `parseNotebookResponse` — valid JSON, markdown-fenced JSON, missing cells, invalid JSON, empty source warnings
  - `notebook-assembler.test.ts` (9): `assembleNotebook` nbformat fields, markdown/code cell shape,
    `notebookToJson` output, `notebookFilename` slugification edge cases
  - `gist-uploader.test.ts` (4): successful upload → colabUrl, non-OK response → null, network error → null, correct Colab URL format

- **E2E (Playwright / Chromium)**: 32 tests
  - `task1-setup.spec.ts` (3): app loads, dark background confirmed, Button + Input components render
  - `task2-main-page.spec.ts` (8): form structure, submit disabled state, key show/hide, drag-drop zone
  - `task3-progress-feed.spec.ts` (5): typewriter animation, done/active/pending states, pulsing indicator
  - `task4-api-route.spec.ts` (4): 400 on missing apiKey, 400 on missing pdf, 200 SSE stream on valid submit, 400 on empty form
  - `task7-sse-flow.spec.ts` (6): full SSE flow with mocked API, progress messages appear, done state triggers result actions
  - `task10-polish.spec.ts` (6): desktop layout, mobile 375px layout, API key validation, 400 error display, font size legibility, header status dot

---

## Security Measures

- **API key never stored**: The OpenAI key is passed directly from the browser form to the
  OpenAI SDK in the same request; it is not logged, cached, or persisted anywhere server-side.
- **PDF buffer only in memory**: The PDF is read into a `Buffer`, processed, and discarded
  within the request lifecycle. No file system writes.
- **No authentication surface**: No login, no sessions, no cookies — nothing to attack.
- **Input validation**: Both `apiKey` and `pdf` are validated before the SSE stream opens;
  invalid requests get a 400 JSON response.
- **OpenAI errors surfaced safely**: Error messages from OpenAI are mapped to user-friendly
  strings before display — raw error details are only logged server-side.
- **Gist is public**: Generated notebooks are uploaded to public GitHub Gists. Users should
  be aware their notebook content (derived from their paper) will be publicly visible via Gist.

---

## Known Limitations

1. **pdf-parse v2 API instability**: The v2.x API (`PDFParse` class) is a significant departure
   from the widely-documented v1.x function API. The `serverExternalPackages` webpack workaround
   is required and fragile — any Next.js upgrade could change this behaviour.

2. **Image-only PDFs fail**: Scanned papers without a text layer return < 100 chars of text and
   are rejected with an error. OCR is not implemented.

3. **No streaming from OpenAI**: The OpenAI call uses a non-streaming `chat.completions.create`
   call. The user sees one progress message for the entire 60-90s wait rather than watching the
   notebook generate token by token.

4. **Public Gist exposes notebook**: GitHub Gist upload creates a public gist. Users working
   with confidential or unpublished research may not want their paper content publicly visible.

5. **No model output validation beyond JSON schema**: The prompt instructs the model to follow
   a specific structure, but there is no runtime check that all 8 required sections are present
   or that code cells are actually executable Python.

6. **npm audit: 4 high severity vulnerabilities** in `next@14` core dependencies (no v14 patch
   available). Upgrade to Next.js 15+ before production deployment.

7. **Single-user, no queueing**: Long concurrent requests all call OpenAI in parallel — there is
   no request queue or per-user rate limiting. At scale this would exhaust OpenAI API quotas rapidly.

---

## What's Next (v2 Priorities)

1. **Streaming OpenAI response** — use `stream: true` with the OpenAI SDK and pipe tokens
   directly to the SSE stream so the user can watch the notebook being written in real time.

2. **OCR fallback for scanned PDFs** — integrate Tesseract.js or a cloud OCR service to handle
   image-based papers.

3. **Private Gist / authenticated upload** — allow users to provide a GitHub token so the Gist
   is private, or upload directly to Google Drive via the Drive API.

4. **In-browser notebook preview** — render the generated `.ipynb` as read-only cells before
   the user downloads, using a lightweight notebook viewer component.

5. **Next.js upgrade to 15+** — eliminate the 4 high severity npm audit findings in Next.js 14
   core before deploying to production.

6. **Model output validation** — parse the generated code cells and warn if obvious syntax errors
   or placeholder comments are detected.

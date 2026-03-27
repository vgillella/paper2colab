# Sprint v2 — Walkthrough

## Summary

Sprint v2 hardened Paper2Colab for public deployment and made generation feel
noticeably faster. Eight security fixes were shipped (Next.js upgrade, HTTP
headers, input validation, text sanitization, error scrubbing, rate limiting,
secret Gists) and the 60-90 second OpenAI wait was replaced with a real-time
token-streaming experience that shows users a live character count as the
notebook is written.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Browser                                   │
│                                                                        │
│  page.tsx (React client)                                               │
│  ├── ApiKeyInput  ← validated: /^sk-[A-Za-z0-9\-_]{20,200}$/          │
│  ├── PdfUploadZone                                                     │
│  ├── ProgressFeed ← progress messages + "Writing notebook… (N chars)"  │
│  └── ResultActions                                                     │
│                │                                                       │
│                │  POST /api/generate (multipart form)                  │
└────────────────┼───────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  middleware.ts  (Next.js Edge)                                         │
│  └── Sliding-window rate limiter: 3 POST/10 min per IP                │
│      (loopback IPs bypassed for dev/test)                              │
└────────────────┬───────────────────────────────────────────────────────┘
                 │  (allowed)
                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│  app/api/generate/route.ts  (Node.js runtime)                         │
│                                                                        │
│  1. validateGenerateRequest()                                          │
│     ├── PDF > 20 MB  → 413                                             │
│     └── bad API key  → 400   (both BEFORE SSE stream opens)           │
│                                                                        │
│  2. Open ReadableStream (SSE)                                          │
│     ├── extractTextFromPdf()  → sanitizePdfText()                     │
│     ├── generateNotebook()    → stream: true                           │
│     │   └── for each chunk → { type:"token", delta } SSE event        │
│     ├── assembleNotebook()                                             │
│     ├── uploadToGist()        → public: false (secret/unlisted)        │
│     └── { type:"done" } SSE event                                     │
└────────────────┬───────────────────────────────────────────────────────┘
                 │
          ┌──────┴──────┐
          ▼             ▼
    OpenAI API    GitHub Gist API
    (stream:true) (public:false)
```

## Files Created / Modified

---

### `paper2colab/middleware.ts` *(new)*

**Purpose**: Next.js Edge middleware that rate-limits POST requests to
`/api/generate` to 3 requests per 10 minutes per client IP.

**Key exports**:
- `middleware(req)` — checks the sliding window and returns 429 or passes through
- `config.matcher` — scopes the middleware to `/api/generate` only

**How it works**:

The middleware maintains an in-memory `Map<IP, number[]>` of request timestamps,
attached to `globalThis` so it survives hot-reload in development:

```typescript
const timestamps = (store.get(ip) ?? [])
  .filter((t) => now - t < WINDOW_MS); // drop timestamps outside the 10-min window
timestamps.push(now);
store.set(ip, timestamps);

if (timestamps.length > MAX_REQUESTS) {
  const retryAfter = Math.ceil((WINDOW_MS - (now - timestamps[0])) / 1000);
  return NextResponse.json(
    { error: 'Too many requests.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
```

This is a **sliding window** (not fixed window) so the limit is fair even when
requests arrive at window boundaries. The `retryAfter` value tells the client
exactly how many seconds until their oldest request ages out.

IP extraction prefers `x-forwarded-for` (set by proxies/CDNs) and falls back to
`x-real-ip`. Loopback addresses (`127.0.0.1`, `::1`) are always bypassed so
local development and E2E tests never hit the limiter.

**Limitation**: The in-memory store is not shared across multiple server
instances. A distributed deployment (multiple pods) would need Redis or a similar
shared store.

---

### `paper2colab/next.config.mjs` *(modified)*

**Purpose**: Next.js build configuration — upgraded to v15 API and adds HTTP
security headers to every route.

**Key change**: Added an `async headers()` function that returns 5 headers for
the `(.*)` source pattern:

| Header | Value | Why |
|--------|-------|-----|
| `X-Frame-Options` | `DENY` | Clickjacking prevention |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type confusion attacks |
| `Referrer-Policy` | `no-referrer` | Stops the API key leaking in Referer on redirects |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restricts browser feature access |
| `Content-Security-Policy` | `default-src 'self'; connect-src 'self' https://api.openai.com https://api.github.com; …` | Allowlists only the origins the app actually needs |

The CSP `connect-src` directive is the most important for this app: it ensures
the browser can only make XHR/fetch calls to the app itself, OpenAI, and GitHub —
blocking any exfiltration to attacker-controlled domains.

---

### `paper2colab/lib/pdf-utils.ts` *(modified)*

**Purpose**: PDF parsing utilities — now also owns input validation and text
sanitization.

**Key exports**:
- `PDF_MAX_BYTES` — constant: `20 * 1024 * 1024` (20 MB)
- `sanitizePdfText(text)` — strips dangerous characters from extracted text
- `validateGenerateRequest(apiKey, pdfBuffer)` — returns `ValidationError[]`
- `extractTextFromPdf(buffer)` — unchanged from v1

**`sanitizePdfText` — how it works**:

Three threats are addressed in two passes:

```typescript
return text
  // Pass 1: control chars + Unicode overrides (single regex for performance)
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u202E\uFFFE\uFFFF]/g, '')
  // Pass 2: strip the prompt boundary markers from user content
  .replace(/=== PAPER TEXT START ===/g, '')
  .replace(/=== PAPER TEXT END ===/g, '');
```

- **C0 control characters** (`\x00–\x08`, `\x0B`, `\x0C`, `\x0E–\x1F`): These
  include null bytes and device-control codes that have no place in text and can
  confuse downstream parsers. Safe whitespace (`\t`, `\n`, `\r`) is preserved.
- **Unicode direction overrides** (`\u202E` RIGHT-TO-LEFT OVERRIDE, `\uFFFE`,
  `\uFFFF`): These can make text visually appear different from what it contains,
  enabling social-engineering attacks.
- **Prompt injection delimiters**: The API route wraps the PDF text between
  `=== PAPER TEXT START ===` and `=== PAPER TEXT END ===` markers. If a malicious
  PDF contained one of these strings, it could escape the user-content section
  and inject instructions into the system prompt context.

**`validateGenerateRequest` — return type change**:

v1 returned `string[]` (field names). v2 returns `ValidationError[]`:

```typescript
interface ValidationError {
  field: string;   // 'apiKey' | 'pdf'
  code: string;    // 'MISSING' | 'INVALID_FORMAT' | 'TOO_LARGE'
  message: string; // human-readable, sent directly to the client
}
```

The route uses the `code` to set the HTTP status: `TOO_LARGE` → 413, anything
else → 400. The `message` is sent as `{ error: "..." }` JSON.

API key validation uses the regex `/^sk-[A-Za-z0-9\-_]{20,200}$/` — this matches
the real OpenAI key format (both legacy `sk-...` and project keys `sk-proj-...`)
while rejecting obvious garbage before any network call is made.

---

### `paper2colab/app/api/generate/route.ts` *(modified)*

**Purpose**: The main API route — orchestrates the entire PDF-to-notebook
pipeline as a Server-Sent Events stream.

**Changes in v2**:

1. **Pre-stream validation** (Tasks 3 & 5): `validateGenerateRequest()` is called
   before the SSE `ReadableStream` is opened. This means 413/400 responses are
   plain JSON — not SSE — making them easy for the client to catch:

   ```typescript
   const errors = validateGenerateRequest(apiKey, pdfBuffer);
   if (errors.length > 0) {
     const first = errors[0];
     const status = first.code === 'TOO_LARGE' ? 413 : 400;
     return new Response(JSON.stringify({ error: first.message }), { status, ... });
   }
   // Only now open the SSE stream
   ```

2. **Token streaming** (Task 8): `generateNotebook()` now receives an `onToken`
   callback that fires for every delta from the OpenAI stream:

   ```typescript
   spec = await generateNotebook(
     apiKey, pdfText, progress,
     (delta) => send({ type: 'token', delta })
   );
   ```

3. **Error scrubbing** (Task 5): All OpenAI errors are routed through
   `classifyOpenAiError()`. The catch-all block no longer forwards raw error
   messages to the client:

   ```typescript
   } catch (err: unknown) {
     console.error('[generate] Unexpected error:', err);
     send({ type: 'error', message: 'An unexpected error occurred. Please try again.' });
   }
   ```

The SSE event type union now includes `{ type: 'token'; delta: string }` between
`progress` and `done`.

---

### `paper2colab/lib/openai-client.ts` *(modified)*

**Purpose**: OpenAI API wrapper — now streams token deltas and sanitizes errors.

**Key exports**:
- `classifyOpenAiError(err)` — maps SDK errors to safe user messages
- `generateNotebook(apiKey, pdfText, onProgress?, onToken?, _client?)` — streams

**`classifyOpenAiError` — how it works**:

Errors are classified by message substring matching into three known categories.
Anything that doesn't match gets a generic fallback and is logged server-side:

```typescript
if (msg.includes('401') || msg.includes('Unauthorized'))
  return 'Invalid OpenAI API key. Please check your key and try again.';
if (msg.includes('429') || msg.includes('rate limit'))
  return 'OpenAI rate limit reached. Please wait a moment and try again.';
if (msg.includes('quota') || msg.includes('billing'))
  return 'OpenAI quota exceeded. Please check your usage limits.';

console.error('[generate] Unclassified OpenAI error:', err);
return 'An unexpected error occurred. Please try again.';
```

This ensures raw SDK error strings (which can contain internal details, request
IDs, or partial key material) never reach the browser.

**`generateNotebook` — streaming**:

The function now uses `stream: true` and iterates the `AsyncIterable` returned by
the OpenAI SDK:

```typescript
const stream = await client.chat.completions.create({ ..., stream: true });

let rawJson = '';
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta != null) {
    rawJson += delta;    // accumulate for JSON parsing at the end
    onToken?.(delta);    // forward to SSE immediately
  }
}
```

The full response is accumulated in `rawJson` and parsed into a `NotebookSpec`
only after the stream closes. This means the client sees tokens as they arrive
(via SSE), but the server waits for the complete response before assembling
the notebook.

A `_client` dependency-injection parameter allows unit tests to pass a mock
OpenAI client directly, avoiding the need to mock the `openai` npm module.

---

### `paper2colab/lib/prompt.ts` *(modified)*

**Purpose**: Builds the system and user prompts sent to OpenAI.

**Change**: `buildUserMessage()` now calls `sanitizePdfText()` before embedding
the PDF text between the delimiter markers:

```typescript
import { sanitizePdfText } from '@/lib/pdf-utils';

export function buildUserMessage(pdfText: string): string {
  const trimmed = sanitizePdfText(pdfText).slice(0, MAX_TEXT_CHARS);
  return [
    'Here is the full text of the research paper...',
    '=== PAPER TEXT START ===',
    trimmed,
    '=== PAPER TEXT END ===',
  ].filter(Boolean).join('\n');
}
```

Sanitization happens here (not in the route) so the protection is guaranteed
regardless of how `buildUserMessage` is called.

---

### `paper2colab/lib/gist-uploader.ts` *(modified)*

**Purpose**: Uploads the generated `.ipynb` to GitHub Gist.

**Change**: One-line fix — `public: true` → `public: false`. GitHub Gist
"secret" gists are unlisted: they're not indexed by search engines and won't
appear on the user's public Gist profile, but anyone with the URL can still
access them (necessary for the Colab link to work). This is a meaningful privacy
improvement for researchers uploading confidential work.

---

### `paper2colab/app/page.tsx` *(modified)*

**Purpose**: Root client component — form, SSE reader, and state machine.

**Changes in v2**:

1. **Gist disclosure** (Task 7): A one-line paragraph with
   `data-testid="gist-disclosure"` is rendered below the submit button when in
   idle state:
   > "Your notebook will be uploaded as an unlisted GitHub Gist to enable the
   > Open in Colab link."

2. **Token event handling** (Task 9): A new `tokenCharCount` state variable
   accumulates the total character count from `{ type: "token" }` SSE events:

   ```typescript
   } else if (event.type === "token") {
     setTokenCharCount((n) => n + event.delta.length);
   }
   ```

   This count is passed to `ProgressFeed` as a prop. The `SseTokenEvent`
   interface was added to the discriminated union of SSE event types.

3. **Reset**: `tokenCharCount` is reset to 0 alongside other state when the user
   starts a new generation.

---

### `paper2colab/components/progress-feed.tsx` *(modified)*

**Purpose**: Renders the live generation log with typewriter animations.

**Change**: Accepts an optional `tokenCharCount?: number` prop. When the count
is greater than zero, a bordered section appears below the message list:

```tsx
{tokenCharCount > 0 && (
  <div
    data-testid="token-char-count"
    className="mt-3 pt-3 border-t border-border overflow-y-auto max-h-20"
  >
    <p className="font-mono text-xs text-primary animate-pulse">
      Writing notebook... ({tokenCharCount.toLocaleString()} chars)
    </p>
  </div>
)}
```

The `toLocaleString()` adds thousand separators so "12345" renders as "12,345
chars". The container has `max-h-20 overflow-y-auto` so if the component were
extended to show actual token text in the future, it would scroll rather than
push content off screen.

---

## Data Flow

### Happy path (v2)

```
1. User fills form (API key + PDF upload)
   └── Client-side: key format validated in real time (regex in ApiKeyInput)

2. User clicks "Generate Notebook →"
   └── POST /api/generate (multipart/form-data)

3. middleware.ts (Edge)
   └── Extract IP from x-forwarded-for
   └── Check sliding window: < 3 requests in last 10 min? Pass through.
       Otherwise → 429 { error, retryAfter }

4. route.ts — pre-stream validation
   ├── PDF > 20 MB?  → 413 JSON (stream never opens)
   └── API key format invalid? → 400 JSON (stream never opens)

5. route.ts — SSE stream opens (200 text/event-stream)
   ├── { type:"progress", message:"Extracting PDF text..." }
   ├── extractTextFromPdf(buffer) → raw text
   ├── sanitizePdfText(raw) → cleaned text (control chars, delimiters stripped)
   ├── { type:"progress", message:"Analyzing paper..." }
   ├── { type:"progress", message:"Generating notebook... (streaming tokens)" }
   │
   ├── generateNotebook() — OpenAI API call with stream:true
   │   └── for each chunk from OpenAI:
   │       ├── accumulate delta into rawJson (server-side)
   │       └── { type:"token", delta:"..." } → SSE event → browser
   │
   ├── Parse rawJson → NotebookSpec
   ├── assembleNotebook() → .ipynb object
   ├── { type:"progress", message:"Uploading to GitHub Gist..." }
   ├── uploadToGist(nbJson, filename) → { id, html_url } (public:false)
   └── { type:"done", notebookJson, filename, colabUrl, title }

6. Browser SSE reader (page.tsx)
   ├── progress events → pushMessage() → ProgressFeed typewriter animation
   ├── token events    → setTokenCharCount(n + delta.length)
   │                     → ProgressFeed shows "Writing notebook… (N chars)"
   └── done event      → setResult() → ResultActions rendered
```

### Error paths

| Condition | Where caught | Response |
|-----------|-------------|----------|
| > 3 req/10 min | middleware.ts | 429 JSON `{ error, retryAfter }` |
| PDF > 20 MB | route.ts pre-stream | 413 JSON `{ error: "PDF must be under 20 MB" }` |
| Bad API key format | route.ts pre-stream | 400 JSON `{ error: "Invalid API key format" }` |
| Corrupt/scanned PDF | Inside SSE stream | `{ type:"error", message:"Failed to parse PDF…" }` |
| OpenAI 401 | `classifyOpenAiError` | `{ type:"error", message:"Invalid OpenAI API key…" }` |
| OpenAI 429 | `classifyOpenAiError` | `{ type:"error", message:"OpenAI rate limit…" }` |
| Any other error | catch-all | `{ type:"error", message:"An unexpected error occurred…" }` + `console.error` |

---

## Test Coverage

### Unit tests — 77 total (8 test files)

| File | Tests | What they verify |
|------|-------|-----------------|
| `input-validation.test.ts` | 14 | PDF size limit (exact boundary, over limit); API key regex (valid/invalid patterns); combined validation |
| `pdf-sanitization.test.ts` | 16 | Each control char range stripped; each Unicode override stripped; both prompt delimiters removed; normal text preserved; `buildUserMessage()` sanitizes before embedding |
| `error-sanitization.test.ts` | 11 | 401/429/quota errors return specific messages; unclassified errors return generic; `console.error` called for unclassified; NOT called for classified |
| `openai-streaming.test.ts` | 6 | `stream:true` passed to OpenAI; token events emitted in order; null deltas skipped; full rawJson parses to `NotebookSpec`; progress events fire before/after; empty stream throws |
| `gist-uploader.test.ts` | 4 | POST body has `public:false`; correct URLs constructed; null on non-OK status; null on network error |
| `pdf-extraction.test.ts` | 5 | `validateGenerateRequest` MISSING/INVALID codes; empty/whitespace key; valid inputs return `[]` |
| `prompt.test.ts` | 10 | System prompt structure; user message truncation; `parseNotebookResponse` JSON parsing |
| `notebook-assembler.test.ts` | 11 | `.ipynb` format; cell assembly; filename sanitization |

### E2E tests — 46 total (Playwright, Chromium)

| Spec file | Tests | What they verify |
|-----------|-------|-----------------|
| `task2v2-security-headers.spec.ts` | 7 | All 5 security headers present on GET /; CSP `default-src 'self'`; `X-Frame-Options: DENY` |
| `task6v2-rate-limiting.spec.ts` | 3 | First 3 requests not 429; 4th request → 429 with `retryAfter`; GET / not rate-limited |
| `task7v2-gist-disclosure.spec.ts` | 2 | Disclosure text visible on idle page; positioned below submit button |
| `task9v2-streaming-ui.spec.ts` | 2 | Token char count appears in UI after SSE token events (Playwright route mock); progress feed visible |
| `task1-setup.spec.ts` | 3 | Page loads, dark background, Tailwind applied |
| `task2-main-ui.spec.ts` | 6 | Header, form elements, submit button states |
| `task3-progress-feed.spec.ts` | 5 | Progress feed lifecycle (active/done/checkmark) |
| `task4-api-route.spec.ts` | 4 | 400 missing apiKey; 400 missing PDF; 200 SSE stream; 400 empty form |
| `task7-sse-flow.spec.ts` | 6 | Full SSE flow with mocked responses |
| `task10-polish.spec.ts` | 6 | Desktop/mobile layout; API key inline error; error display; font legibility; status indicator |

---

## Security Measures

All measures added in v2 (v1 had none):

1. **HTTP security headers** — 5 headers on every response, including a tight
   CSP that allowlists only OpenAI and GitHub as external connect targets.

2. **PDF file size cap (20 MB)** — prevents memory exhaustion from oversized
   uploads; checked before any parsing begins.

3. **API key format validation** — regex `/^sk-[A-Za-z0-9\-_]{20,200}$/` rejects
   malformed keys before any OpenAI API call, saving quota and reducing attack surface.

4. **PDF text sanitization** — strips C0 control characters, Unicode direction
   overrides, and the prompt boundary markers from extracted text before it is
   embedded in the OpenAI prompt. Prevents prompt injection via malicious PDF content.

5. **Error message scrubbing** — raw SDK error strings never reach the browser.
   Only three classified messages are surfaced; everything else returns the generic
   fallback while the full error is logged server-side.

6. **Rate limiting** — 3 POST requests per 10 minutes per IP using an in-memory
   sliding window. Returns `Retry-After` header for client-side backoff.

7. **Secret GitHub Gists** — `public: false` means uploaded notebooks are
   unlisted (not indexed, not on the user's profile). UI discloses this to users
   before they submit.

---

## Known Limitations

- **Rate limiter is single-instance** — in-memory state is lost on process
  restart and not shared across multiple server instances. Horizontal scaling
  (e.g. multiple Vercel edge functions) would split the budget per instance,
  making the limit much weaker. v3 should use Redis or Vercel KV.

- **Rate limiter has no persistence** — restarting the dev server resets all
  counts. An attacker who knows this can restart the server to reset their limit
  (though they would need server access to do so).

- **API key regex is necessary but not sufficient** — the format check confirms
  the key looks like an OpenAI key, but it does not verify the key is valid or
  belongs to the submitting user. A key could be stolen from someone else and
  still pass validation.

- **CSP uses `unsafe-inline` and `unsafe-eval`** — required by Next.js's
  runtime scripts. A stricter CSP with nonces would be better but requires more
  integration work.

- **Prompt injection is partially mitigated** — the delimiter-stripping defence
  removes known markers, but an adversarial PDF could contain other instruction
  patterns that the model might follow. Full mitigation would require a separate
  classification pass.

- **Gist visibility** — "secret" Gists are not truly private. Anyone with the
  URL can access them. For genuinely private research, GitHub OAuth + private
  repositories would be required (v3 scope).

- **Token streaming requires a long-lived HTTP connection** — on serverless
  platforms with request timeouts shorter than 180 seconds (`maxDuration`), very
  long notebooks could be cut off mid-stream.

---

## What's Next (v3 Priorities)

Based on the remaining limitations and the PRD's out-of-scope list:

1. **Distributed rate limiting** — replace the in-memory store with Vercel KV
   (Redis-compatible) so the limit is enforced consistently across all instances.

2. **GitHub OAuth for private Gists** — let users authenticate with GitHub so
   notebooks can be uploaded to truly private Gists tied to their account.

3. **Stronger CSP** — add nonce-based script allowlisting to remove
   `unsafe-inline` / `unsafe-eval`.

4. **OCR for scanned PDFs** — the current pipeline fails silently for
   image-only PDFs. Integrating a cloud OCR step (e.g. AWS Textract) would
   unlock scanned papers.

5. **In-browser cell preview** — render the generated notebook cells in the
   browser before the user downloads, so they can spot obvious problems without
   opening Colab.

6. **Refresh token on 401** — today the user must re-enter their API key manually
   after a 401. A retry prompt that guides them without losing their PDF would
   improve UX.

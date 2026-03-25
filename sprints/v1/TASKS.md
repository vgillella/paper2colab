# Sprint v1 — Tasks: Paper2Colab

## Status: In Progress

---

- [x] Task 1: Initialize Next.js 14 project with Tailwind CSS and shadcn/ui (P0)
  - Acceptance: `npm run dev` runs without errors; Tailwind works; shadcn/ui Button and Input components render; dark background (`#0a0a0a`) set as default body color in globals.css
  - Files: `paper2colab/package.json`, `paper2colab/app/globals.css`, `paper2colab/app/layout.tsx`, `paper2colab/components.json`, `paper2colab/playwright.config.ts`
  - Completed: 2026-03-25 — Scaffolded Next.js 14 app in `paper2colab/` subdir; upgraded to Tailwind v4 + @tailwindcss/postcss; shadcn/ui v4 init with Button + Input; ARC-AGI dark theme (oklch near-black bg, teal accent, off-white text, 0rem radius); Inter + JetBrains Mono fonts; Playwright E2E tests (3/3 pass); npm audit shows 4 high vulns in next@14 core (no v14 patch available — defer upgrade to pre-deploy task)

- [x] Task 2: Build the main page UI — API key input + PDF upload zone (P0)
  - Acceptance: Page renders with ARC-AGI-inspired dark theme; API key input field (password type) with label; PDF drag-and-drop upload zone with click-to-browse fallback; "Generate Notebook" submit button (disabled until both fields filled); all styled with sharp borders, teal accent, Inter/monospace fonts
  - Files: `paper2colab/app/page.tsx`, `paper2colab/components/api-key-input.tsx`, `paper2colab/components/pdf-upload-zone.tsx`
  - Completed: 2026-03-25 — Full ARC-AGI layout: header with grid logo + pulsing status dot, API key input with show/hide toggle, drag-and-drop PDF upload zone showing filename on selection, submit controlled by both fields; 8/8 E2E tests pass

- [x] Task 3: Build the live progress display component (P0)
  - Acceptance: Component accepts a list of status strings and renders them as a stacked feed with typewriter animation on the latest line; completed lines are dimmed; component is shown only after submission; includes a pulsing indicator while processing; messages like "Extracting PDF text...", "Analyzing paper structure...", "Generating algorithm cells...", "Assembling notebook...", "Done."
  - Files: `paper2colab/components/progress-feed.tsx`, `paper2colab/app/test-progress/page.tsx`
  - Completed: 2026-03-25 — Typewriter animation via useTypewriter hook; done=dimmed+teal-checkmark, active=teal-arrow+blinking-cursor+full-opacity, pending=greyed; pulsing indicator in header; done state shows checkmark; 5/5 E2E pass

- [x] Task 4: Create the PDF text extraction API route (P0)
  - Acceptance: `POST /api/generate` accepts `multipart/form-data` with `pdf` (file) and `apiKey` (string); extracts full text from the PDF using `pdf-parse`; returns 400 if either field is missing; logs extracted character count
  - Files: `paper2colab/app/api/generate/route.ts`, `paper2colab/lib/pdf-utils.ts`, `paper2colab/next.config.mjs`
  - Completed: 2026-03-25 — pdf-parse marked as serverExternalPackage (CJS/webpack conflict); validateGenerateRequest helper; 400 on missing fields, 422 on empty/corrupt PDF; 4 unit tests + 4 integration tests all passing

- [x] Task 5: Write the OpenAI system prompt and call the model (P0)
  - Acceptance: API route calls OpenAI using the user-provided key with model `gpt-4.5-preview`; system prompt instructs the model to return a strict JSON object `{ title, summary, cells[] }` where each cell has `{ type, source, section }`; prompt requires: paper summary, algorithm pseudocode walkthrough, full Python implementation, realistic synthetic data generation, matplotlib experiments, and results discussion; prompt explicitly forbids trivial toy examples; response is parsed and validated
  - Files: `paper2colab/lib/prompt.ts`, `paper2colab/lib/openai-client.ts`
  - Completed: 2026-03-25 — Detailed system prompt (8 required sections, realistic synthetic data mandate, no-toy prohibition, matplotlib+LaTeX requirements); buildUserMessage trims to 80k chars; parseNotebookResponse handles JSON+markdown-fenced responses; generateNotebook() wraps OpenAI SDK with json_object response format; 13/13 unit tests pass

- [x] Task 6: Assemble the OpenAI response into a valid `.ipynb` file (P0)
  - Acceptance: Function takes the parsed `{ title, cells[] }` and produces a valid `nbformat v4` JSON object with correct `metadata` (kernelspec: python3, language_info), `nbformat: 4`, `nbformat_minor: 5`; markdown cells have `cell_type: "markdown"`; code cells have `cell_type: "code"`, `execution_count: null`, `outputs: []`; result is a valid `.ipynb` that Colab/Jupyter can open without errors
  - Files: `paper2colab/lib/notebook-assembler.ts`
  - Completed: 2026-03-25 — assembleNotebook() produces valid nbformat v4; notebookToJson() serialiser; notebookFilename() safe slug generator; colab provenance metadata included; 9/9 unit tests pass

- [x] Task 7: Implement Server-Sent Events (SSE) streaming for progress updates (P1)
  - Acceptance: `/api/generate` streams SSE events for each stage; frontend reads stream via fetch ReadableStream; progress feed updates live; closes cleanly
  - Files: `paper2colab/app/api/generate/route.ts` (full SSE pipeline), `paper2colab/app/page.tsx`
  - Completed: 2026-03-25 — ReadableStream SSE pipeline: pdf_extract → openai_call → notebook_assemble → gist_upload → done/error; fetch-based streaming on frontend (POST + ReadableStream, not EventSource); 6/6 E2E tests pass

- [x] Task 8: Create GitHub Gist and construct Open in Colab URL (P1)
  - Acceptance: Gist upload non-fatal; Colab URL in done event; graceful fallback
  - Files: `paper2colab/lib/gist-uploader.ts`
  - Completed: 2026-03-25 — uploadToGist() posts to api.github.com/gists; returns null on failure (non-fatal); Colab URL: colab.research.google.com/gist/{id}/{filename}; 4/4 unit tests pass

- [x] Task 9: Wire up result state — download button + Open in Colab button (P0)
  - Acceptance: Download triggers blob download; Colab button opens URL in new tab; both styled with teal; progress completes with checkmark
  - Files: `paper2colab/app/page.tsx`, `paper2colab/components/result-actions.tsx`
  - Completed: 2026-03-25 — ResultActions component with Download + conditional Colab button; fallback message when Colab unavailable; "generate another" reset button; 6/6 E2E tests pass

- [x] Task 10: Polish — loading states, error handling, responsive layout, header/footer (P2)
  - Acceptance: Error display with retry; API key inline validation; mobile responsive (375px); fade-in animation; all text legible
  - Files: `paper2colab/app/page.tsx`, `paper2colab/app/globals.css`, `paper2colab/components/api-key-input.tsx`
  - Completed: 2026-03-25 — API key inline error for <20 char keys on blur; overflow-x: hidden for mobile; header status dot changes color by state (ready/processing/done/error); error display with retry button; fade-in animation; 6/6 E2E pass

## Status: COMPLETE ✓

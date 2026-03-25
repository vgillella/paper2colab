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

- [ ] Task 5: Write the OpenAI system prompt and call the model (P0)
  - Acceptance: API route calls OpenAI using the user-provided key with model `gpt-4.5-preview`; system prompt instructs the model to return a strict JSON object `{ title, summary, cells[] }` where each cell has `{ type, source, section }`; prompt requires: paper summary, algorithm pseudocode walkthrough, full Python implementation, realistic synthetic data generation, matplotlib experiments, and results discussion; prompt explicitly forbids trivial toy examples; response is parsed and validated
  - Files: `app/api/generate/route.ts` (continued), `lib/prompt.ts`

- [ ] Task 6: Assemble the OpenAI response into a valid `.ipynb` file (P0)
  - Acceptance: Function takes the parsed `{ title, cells[] }` and produces a valid `nbformat v4` JSON object with correct `metadata` (kernelspec: python3, language_info), `nbformat: 4`, `nbformat_minor: 5`; markdown cells have `cell_type: "markdown"`; code cells have `cell_type: "code"`, `execution_count: null`, `outputs: []`; result is a valid `.ipynb` that Colab/Jupyter can open without errors
  - Files: `lib/notebook-assembler.ts`

- [ ] Task 7: Implement Server-Sent Events (SSE) streaming for progress updates (P1)
  - Acceptance: `/api/generate` streams SSE events (`data: <json>\n\n`) for each processing stage: `pdf_extracted`, `prompt_sent`, `response_received`, `notebook_assembled`, `gist_created`, `done`; frontend `EventSource` connects and updates the `ProgressFeed` component in real-time; connection closes cleanly on completion or error
  - Files: `app/api/generate/route.ts` (refactor to streaming), `app/page.tsx` (EventSource integration)

- [ ] Task 8: Create GitHub Gist and construct Open in Colab URL (P1)
  - Acceptance: After notebook assembly, server POSTs the `.ipynb` JSON to `https://api.github.com/gists` as a public gist (no auth); extracts `gist_id` from response; constructs Colab URL: `https://colab.research.google.com/gist/{gist_id}/notebook.ipynb`; if Gist creation fails, gracefully falls back (no Colab button shown, only download); Colab URL is included in the final SSE `done` event payload
  - Files: `lib/gist-uploader.ts`, `app/api/generate/route.ts`

- [ ] Task 9: Wire up result state — download button + Open in Colab button (P0)
  - Acceptance: On `done` SSE event, frontend stores `notebookJson` and `gistUrl`; "Download .ipynb" button triggers a client-side blob download of the JSON as `{paper-title}.ipynb`; "Open in Colab" button (if gistUrl exists) opens the Colab URL in a new tab; both buttons are styled to match the dark theme with teal accent; progress feed transitions to a "Complete" state with a subtle checkmark
  - Files: `app/page.tsx`, `components/result-actions.tsx`

- [ ] Task 10: Polish — loading states, error handling, responsive layout, header/footer (P2)
  - Acceptance: Full-page error state shown if API call fails (with error message); API key validation shows inline error if key is clearly invalid format; layout is centered and readable on mobile (min 375px); page has a minimal header with app name "Paper2Colab" and a one-line tagline; subtle page-load fade-in animation; no layout shifts during processing; all text is legible at 16px base size on dark background
  - Files: `app/page.tsx`, `app/layout.tsx`, `components/error-display.tsx`

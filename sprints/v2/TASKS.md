# Sprint v2 — Tasks: Paper2Colab Security Hardening + Streaming UX

## Status: In Progress

---

- [x] Task 1: Upgrade Next.js 14 → 15 and fix breaking changes (P0)
  - Acceptance: `npm run dev` starts without errors on Next.js 15; `npm audit` shows 0 high/critical
    vulns in next core; existing Playwright E2E suite passes (32/32)
  - Files: `paper2colab/package.json`, `paper2colab/package-lock.json`, `paper2colab/next.config.mjs`
    (rename `serverComponentsExternalPackages` → `serverExternalPackages` if API changed)
  - Completed: 2026-03-26 — Upgraded to next@15.5.14 + eslint-config-next@15.5.14; moved `serverComponentsExternalPackages` → top-level `serverExternalPackages`; fixed unused param lint warning in notebook-assembler.ts; fixed vitest config to exclude Playwright spec files (added `include: ['tests/unit/**/*.test.ts']`); 31/31 unit + 32/32 E2E pass; npm audit: 0 vulnerabilities; semgrep: 0 findings

- [x] Task 2: Add HTTP security headers in next.config.mjs (P0)
  - Acceptance: `curl -I http://localhost:3000` returns all 5 headers: `X-Frame-Options: DENY`,
    `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
    `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
    `Content-Security-Policy` with `default-src 'self'`; Playwright test verifies headers on `/`
  - Files: `paper2colab/next.config.mjs`, `paper2colab/tests/e2e/task2v2-security-headers.spec.ts`
  - Completed: 2026-03-26 — Added async headers() to next.config.mjs for all routes: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Permissions-Policy (camera/mic/geo blocked), CSP with default-src 'self' + Google Fonts/OpenAI/GitHub allowlists; 7/7 E2E pass; full regression 31 unit + 39 E2E green

- [x] Task 3: Add PDF file size limit (20 MB) and server-side API key format validation (P0)
  - Acceptance: POST with PDF > 20 MB returns 413 `{ error: "PDF must be under 20 MB" }`;
    POST with malformed API key (not matching `/^sk-[A-Za-z0-9\-_]{20,200}$/`) returns 400
    `{ error: "Invalid API key format" }`; both checks happen before the SSE stream opens;
    unit tests cover both rejection paths
  - Files: `paper2colab/app/api/generate/route.ts`, `paper2colab/lib/pdf-utils.ts`,
    `paper2colab/tests/unit/input-validation.test.ts`
  - Completed: 2026-03-26 — Added PDF_MAX_BYTES constant (20 MB) and API_KEY_RE regex to pdf-utils.ts; validateGenerateRequest now returns ValidationError[] with {field, code, message}; route.ts returns 413 for TOO_LARGE, 400 for INVALID_FORMAT/MISSING before SSE stream opens; updated pdf-extraction.test.ts to new API; 44/44 unit tests pass; semgrep: 0 findings; npm audit: 0 vulnerabilities

- [x] Task 4: Sanitise PDF text — strip control characters and escape prompt delimiters (P0)
  - Acceptance: `sanitizePdfText()` function strips null bytes, C0 control chars (`\x00-\x08`,
    `\x0B`, `\x0C`, `\x0E-\x1F`), Unicode overrides (`\u202E`, `\uFFFE`, `\uFFFF`), and
    removes any occurrence of `=== PAPER TEXT START ===` / `=== PAPER TEXT END ===` from the
    extracted text; unit tests cover all strip cases; function is called in `buildUserMessage()`
  - Files: `paper2colab/lib/pdf-utils.ts`, `paper2colab/lib/prompt.ts`,
    `paper2colab/tests/unit/pdf-sanitization.test.ts`
  - Completed: 2026-03-26 — Added sanitizePdfText() to pdf-utils.ts with single regex for C0 control chars + Unicode overrides + two replace calls for prompt delimiters; wired into buildUserMessage() via static import; 16 new unit tests; 60/60 total pass; semgrep clean

- [x] Task 5: Sanitise error messages sent to client (P0)
  - Acceptance: Unclassified errors from OpenAI show a generic
    `"An unexpected error occurred. Please try again."` message to the user; the raw error is
    logged server-side with `console.error`; classified errors (401, 429, quota) still show their
    specific user-friendly messages; unit test verifies raw SDK errors do not leak to the SSE
    error event
  - Files: `paper2colab/app/api/generate/route.ts`,
    `paper2colab/tests/unit/error-sanitization.test.ts`
  - Completed: 2026-03-26 — Extracted classifyOpenAiError() to openai-client.ts; unclassified errors return generic message + log raw error via console.error; route.ts uses classifyOpenAiError(); catch-all in stream also sanitized; 11 new unit tests; 71/71 pass; semgrep clean

- [x] Task 6: Add per-IP rate limiting middleware (3 requests / 10 minutes) (P1)
  - Acceptance: `middleware.ts` intercepts `/api/generate` POST requests; a single IP making
    4 requests within 10 minutes gets a 429 response with `{ error: "Too many requests",
    retryAfter: N }` and a `Retry-After` header; the in-memory store uses a sliding window;
    Playwright test verifies the 4th request returns 429; middleware does not apply to other routes
  - Files: `paper2colab/middleware.ts`, `paper2colab/tests/e2e/task6v2-rate-limiting.spec.ts`
  - Completed: 2026-03-26 — Created middleware.ts with in-memory sliding window (3 req/10 min per IP); reads x-forwarded-for; returns 429 + Retry-After header; updated task4-api-route.spec.ts to use valid API key format; 3/3 E2E pass; 71 unit pass; semgrep clean

- [x] Task 7: Default GitHub Gist to secret + add UI disclosure warning (P1)
  - Acceptance: `uploadToGist()` sets `public: false` (secret/unlisted gist); the main form
    shows a one-line disclosure below the submit button: "Your notebook will be uploaded as an
    unlisted GitHub Gist to enable the Open in Colab link"; Playwright test verifies the
    disclosure text is visible on the idle page; unit test verifies the Gist POST body has
    `public: false`
  - Files: `paper2colab/lib/gist-uploader.ts`, `paper2colab/app/page.tsx`,
    `paper2colab/tests/unit/gist-uploader.test.ts`, `paper2colab/tests/e2e/task7v2-gist-disclosure.spec.ts`
  - Completed: 2026-03-26 — gist-uploader.ts: public:true → public:false; page.tsx: disclosure paragraph with data-testid="gist-disclosure" below submit button; unit test updated; 2/2 E2E pass; 71 unit pass; semgrep clean

- [x] Task 8: Stream OpenAI response token-by-token via SSE (P1)
  - Acceptance: `generateNotebook()` uses `stream: true`; each token delta is forwarded as a
    new SSE event `{ type: "token", delta: "..." }` to the browser; the full response is
    accumulated server-side into `rawJson` and parsed into `NotebookSpec` after the stream ends;
    existing progress events still fire before and after the stream; unit tests mock the
    OpenAI stream and verify token events are emitted in order
  - Files: `paper2colab/lib/openai-client.ts`, `paper2colab/app/api/generate/route.ts`,
    `paper2colab/tests/unit/openai-streaming.test.ts`
  - Completed: 2026-03-26 — generateNotebook() uses stream:true and async-iterates over chunks; each non-null delta forwarded via onToken(); rawJson accumulated then parsed; DI parameter _client added for testability; route.ts sends {type:"token",delta} SSE events; 6 new unit tests; 77/77 pass; semgrep clean

- [x] Task 9: Update ProgressFeed to display streaming token output (P1)
  - Acceptance: When `{ type: "token" }` SSE events arrive, the progress feed shows a live
    "Writing notebook..." message with accumulated character count (e.g.
    `Writing notebook... (1,240 chars)`); the typewriter animation on earlier messages is
    unchanged; the token display area scrolls as content grows; Playwright E2E test mocks the
    token stream and verifies the character count updates in the UI
  - Files: `paper2colab/app/page.tsx`, `paper2colab/components/progress-feed.tsx`,
    `paper2colab/tests/e2e/task9v2-streaming-ui.spec.ts`
  - Completed: 2026-03-27 — page.tsx: tokenCharCount state, handles {type:"token"} SSE events; progress-feed.tsx: tokenCharCount prop, "Writing notebook... (N chars)" display with scrollable container; 2/2 E2E pass (Playwright route mock); 77 unit pass; semgrep clean

- [ ] Task 10: Full regression — run all v1 + v2 E2E and unit tests, update TASKS.md (P0)
  - Acceptance: `npx vitest run` passes all unit tests (≥ 36 total including new v2 tests);
    `npx playwright test` passes all E2E tests (≥ 38 total); `npm audit` shows 0 high/critical;
    `semgrep --config auto app/ components/ lib/` shows 0 findings; TASKS.md marked complete
  - Files: `sprints/v2/TASKS.md`

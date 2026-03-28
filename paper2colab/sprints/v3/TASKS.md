# Sprint v3 — Tasks: Production Ready (Testing + CI/CD + Docker + AWS)

## Status: COMPLETE ✓ (2026-03-28)

---

## Area 0 — Security Baseline (DO THIS FIRST)

- [x] Task 1: Add `.gitignore` entries and security baseline files (P0)
  - Acceptance: `paper2colab/.gitignore` includes `aws_cred.md`, `*.pem`, `.env*`, `*_key*`,
    `*secret*`, `*_cred*`, `.next/`, `node_modules/`, `tests/screenshots/`.
    Root `.gitignore` also ignores `aws_cred.md` at repo level.
    `git status` shows `aws_cred.md` as untracked (never staged).
    `SECURITY.md` documents: (1) no credentials in files, (2) use GitHub Secrets for CI,
    (3) rotate any keys previously committed, (4) OIDC preferred over static keys.
  - Files: `paper2colab/.gitignore`, `.gitignore` (repo root), `SECURITY.md`
  - Completed: 2026-03-27 — aws_cred.md ignored via *_cred* pattern (verified with git check-ignore); paper2colab/.gitignore + msd-prd/.gitignore updated with credential patterns + terraform state patterns; SECURITY.md documents all 4 requirements + CI branch protection setup; npm audit --audit-level=high exits 0 (13 moderate only, eslint toolchain)

---

## Area 1 — New Feature: arXiv URL Support

- [x] Task 2: Add `lib/arxiv-fetcher.ts` and `/api/generate-arxiv` route (P0)
  - Acceptance:
    `lib/arxiv-fetcher.ts` exports:
    - `extractArxivId(input: string): string` — parses bare IDs (`2301.00001`,
      `1706.03762v7`) and URLs (`arxiv.org/abs/...`, `arxiv.org/pdf/...`);
      strips version suffix; throws `ValidationError` (400) on invalid input
    - `fetchArxivPdf(arxivId: string): Promise<Buffer>` — fetches
      `https://arxiv.org/pdf/{id}.pdf`; throws on non-PDF response
    `app/api/generate-arxiv/route.ts` accepts `POST { arxivUrl, apiKey }`,
    validates both fields, runs the same SSE pipeline as `/api/generate`,
    returns identical SSE event shape. `curl -X POST http://localhost:3000/api/generate-arxiv
    -H 'Content-Type: application/json' -d '{"arxivUrl":"bad","apiKey":"sk-x..."}' -i`
    returns 400.
    Frontend `app/page.tsx` has a tab or toggle to switch between "PDF Upload" and
    "arXiv URL" modes. Entering an arXiv URL and clicking Generate calls the new route.
  - Files: `lib/arxiv-fetcher.ts`, `app/api/generate-arxiv/route.ts`,
    `app/page.tsx` (updated), `components/arxiv-url-input.tsx` (new)

---

## Area 2 — Testing Pyramid: Unit Tests

- [x] Task 3: Expand unit tests for `lib/pdf-utils.ts` (P0)
  - Acceptance: `npx vitest run tests/unit/pdf-extraction.test.ts` passes with ≥ 10 tests
    total (was 5). New tests cover: (1) scanned/image PDF returns empty string and
    triggers 422-style error; (2) PDF with only whitespace text treated as empty;
    (3) references section `\nReferences\n` is stripped from end of extracted text;
    (4) text > 320,000 chars is truncated with `[Paper truncated]` suffix; (5) non-PDF
    bytes (e.g. PNG header) throws extractable error.
    `pdf-parse` is mocked — no real PDFs parsed.
  - Files: `tests/unit/pdf-extraction.test.ts`

- [x] Task 4: Expand unit tests for `lib/openai-client.ts` (P0)
  - Acceptance: `npx vitest run tests/unit/openai-streaming.test.ts` passes with ≥ 10 tests
    total (was 6). New tests cover: (1) partial/truncated JSON from stream throws parse
    error; (2) stream with only whitespace deltas produces empty rawJson;
    (3) `onToken` callback NOT called when delta is `null` or `undefined`;
    (4) `classifyOpenAiError` returns generic message for unrecognized error strings.
    OpenAI client is dependency-injected via `_client` parameter — no real API calls.
  - Files: `tests/unit/openai-streaming.test.ts`

- [x] Task 5: New unit tests for `lib/arxiv-fetcher.ts` (P0)
  - Acceptance: `npx vitest run tests/unit/arxiv-fetcher.test.ts` passes with ≥ 8 tests:
    (1) bare ID `2301.00001` → `2301.00001`; (2) versioned `1706.03762v7` → `1706.03762`;
    (3) `https://arxiv.org/abs/2301.00001` → `2301.00001`;
    (4) `https://arxiv.org/pdf/1706.03762v7` → `1706.03762`;
    (5) old-style `hep-th/9901001` → `hep-th/9901001`;
    (6) invalid string `"not-an-arxiv"` → throws ValidationError;
    (7) URL with query params `?utm_source=test` → stripped, ID extracted;
    (8) empty string → throws ValidationError.
    `extractArxivId` is pure regex — zero network calls, no mocking needed.
  - Files: `tests/unit/arxiv-fetcher.test.ts`

- [x] Task 6: Expand unit tests for `lib/gist-uploader.ts` (P0)
  - Acceptance: `npx vitest run tests/unit/gist-uploader.test.ts` passes with ≥ 8 tests
    total (was 4). New tests cover: (1) GitHub API returning 403 (rate limit) returns `null`
    and does not throw; (2) GitHub API returning 422 (unprocessable) returns `null`;
    (3) network timeout / `fetch` rejection returns `null` and logs error;
    (4) filename with special characters is sanitized (no `..`, no `/`, max 100 chars).
    `fetch` is mocked via `vi.stubGlobal`.
  - Files: `tests/unit/gist-uploader.test.ts`

---

## Area 3 — Testing Pyramid: Integration Tests

- [x] Task 7: Integration tests for `POST /api/generate` (P0)
  - Acceptance: `npx vitest run tests/integration/api-generate.test.ts` passes with ≥ 4 tests.
    Pattern: import `{ POST }` from `@/app/api/generate/route`, construct real `Request` objects
    with `FormData`, call `POST(req)`, assert on the returned `Response`.
    Tests: (1) valid PDF + valid API key → 200, SSE stream contains `data: {"type":"done",...}`;
    (2) missing `apiKey` field → 400 JSON `{ error: "..." }` (no SSE stream opened);
    (3) PDF > 20 MB → 413 JSON (no SSE stream opened);
    (4) `generateNotebook` throws 401-like error → SSE `{ type:"error" }` event returned.
    `generateNotebook` is mocked via `vi.mock('@/lib/openai-client')`. Real
    `extractTextFromPdf` runs against a minimal PDF fixture.
  - Files: `tests/integration/api-generate.test.ts`,
    `tests/fixtures/minimal.pdf` (tiny valid PDF for testing)

- [x] Task 8: Integration tests for `POST /api/generate-arxiv` (P0)
  - Acceptance: `npx vitest run tests/integration/api-generate-arxiv.test.ts` passes with ≥ 4 tests.
    Tests: (1) valid arXiv URL + valid API key → 200 SSE with `done` event;
    (2) invalid arXiv input (bare text `"not-an-id"`) → 400 JSON before SSE;
    (3) `fetchArxivPdf` network failure → SSE `{ type:"error" }`;
    (4) `generateNotebook` quota error (429-like) → SSE `{ type:"error", message:"quota..." }`.
    Both `fetchArxivPdf` and `generateNotebook` are mocked via `vi.mock`. No network calls made.
  - Files: `tests/integration/api-generate-arxiv.test.ts`

---

## Area 4 — Testing Pyramid: E2E Tests

- [x] Task 9: E2E Playwright test — full PDF upload user flow with screenshots (P1)
  - Acceptance: `npx playwright test tests/e2e/task-v3-pdf-flow.spec.ts` passes.
    Test uses `page.route()` to mock `POST /api/generate` at the browser level (no real
    OpenAI call). Flow: (1) navigate to `/`; (2) enter a fake API key;
    (3) upload `tests/fixtures/minimal.pdf`; (4) click "Generate Notebook";
    (5) assert loading spinner or progress feed appears; (6) assert download card appears;
    (7) click download button; (8) assert download event fires.
    Screenshots saved to `tests/screenshots/` at: page-load, after-upload, after-generate,
    download-complete. Test passes on Chromium.
  - Files: `tests/e2e/task-v3-pdf-flow.spec.ts`

- [x] Task 10: E2E Playwright test — arXiv URL flow with screenshots (P1)
  - Acceptance: `npx playwright test tests/e2e/task-v3-arxiv-flow.spec.ts` passes.
    Uses `page.route()` to mock `POST /api/generate-arxiv`. Flow: (1) navigate to `/`;
    (2) enter fake API key; (3) switch to arXiv URL mode;
    (4) enter `https://arxiv.org/abs/1706.03762`; (5) click Generate;
    (6) assert progress feed visible; (7) assert download card appears; (8) click download.
    Screenshots at: arxiv-tab-selected, url-entered, after-generate, download-complete.
  - Files: `tests/e2e/task-v3-arxiv-flow.spec.ts`

- [x] Task 11: Real quality gate — headed browser, real OpenAI key, Attention paper (P1)
  - Acceptance: Running `OPENAI_API_KEY=<key> npx playwright test tests/e2e/quality-gate.spec.ts`
    opens a **visible (headed) Chromium browser**, navigates to the running app,
    pauses for the user to type their real API key into the input field
    (using `page.pause()` or a dialog prompt — NO hardcoded key),
    uploads `attention_1706.03762v7.pdf` from:
    `/Users/vishnugillella/Documents/AI/AI_ML_Vizuara/modern_software_dev/msd-prd/attention_1706.03762v7.pdf`,
    clicks Generate, waits up to 120 seconds, downloads the `.ipynb`, then asserts:
    (a) downloaded content parses as valid JSON;
    (b) `cells` array exists with ≥ 8 entries;
    (c) at least 3 cells have non-empty `source`;
    (d) `"attention"` appears in the notebook text (case-insensitive);
    (e) one cell contains a word from: `["disclaimer", "safety", "caution", "note"]`.
    Screenshots at: before-generate, post-generate, download-complete.
    Test is **skipped automatically** if `OPENAI_API_KEY` env var is not set.
    This test is NOT run in CI — only locally with a real key.
  - Files: `tests/e2e/quality-gate.spec.ts`

---

## Area 5 — CI/CD Pipeline

- [x] Task 12: GitHub Actions CI workflow — tests + security scans (P0)
  - Acceptance: `.github/workflows/ci.yml` runs on every `push` and `pull_request` to any
    branch. Three jobs, all must pass — any failure blocks merge to `main`:
    (1) `test`: `npm ci`, `npx playwright install chromium`,
    `npx vitest run` (unit + integration), then
    `npx playwright test` (all specs EXCEPT `quality-gate.spec.ts`);
    screenshots uploaded as artifact on failure;
    `OPENAI_API_KEY` injected from GitHub Secret for integration tests that need it;
    (2) `semgrep`: `pip install semgrep`, `semgrep --config auto lib/ app/api/ --error`
    (exits non-zero if any finding);
    (3) `npm-audit`: `npm audit --audit-level=high` (exits non-zero on high/critical vuln).
    Branch protection rules documented in `SECURITY.md`: require all 3 jobs to pass before merge.
  - Files: `.github/workflows/ci.yml`

---

## Area 6 — Docker

- [x] Task 13: Dockerfile for Next.js app (P0)
  - Acceptance: `docker build -t paper2colab .` from `paper2colab/` succeeds.
    `docker run -p 3000:3000 -e OPENAI_API_KEY=dummy paper2colab` starts Next.js and
    `curl http://localhost:3000/` returns 200. Requirements:
    - Multi-stage build: `node:20-slim` deps stage → `node:20-slim` builder stage →
      `node:20-slim` runner stage
    - `next.config.mjs` sets `output: 'standalone'` for optimized Docker output
    - Runner stage copies `.next/standalone/` + `.next/static/` + `public/`
    - Non-root user `nextjs` (UID 1001) runs the server
    - `EXPOSE 3000`, `CMD ["node", "server.js"]`
    - `.dockerignore` excludes `node_modules/`, `.next/`, `tests/`, `aws_cred.md`,
      `*.md` (credentials)
    - Image size < 500 MB
  - Files: `paper2colab/Dockerfile`, `paper2colab/.dockerignore`,
    `paper2colab/next.config.mjs` (add `output: 'standalone'`)

- [x] Task 14: `docker-compose.yml` for local development (P0)
  - Acceptance: `docker compose up` from `paper2colab/` builds and starts the app.
    `curl http://localhost:3000/` returns 200. `docker compose down` stops cleanly.
    Compose file defines: service `frontend` (build: `.`, ports: `3000:3000`,
    env_file: `.env.local` — not committed, reads `OPENAI_API_KEY`).
    Includes a healthcheck (`/` endpoint, 30s interval, 3 retries).
    `.env.local.example` shows required env vars without values.
  - Files: `paper2colab/docker-compose.yml`, `paper2colab/.env.local.example`

---

## Area 7 — AWS Cloud Deployment

- [x] Task 15: Terraform for AWS ECS Fargate infrastructure (P0)
  - Acceptance: `terraform init && terraform plan` runs without errors (credentials from
    environment, NOT from files). Terraform creates:
    (1) ECR repository `paper2colab-frontend`;
    (2) ECS cluster `paper2colab-cluster`;
    (3) ECS task definition (Fargate, 512 CPU / 1024 MB, port 3000, reads `OPENAI_API_KEY`
    from AWS SSM Parameter Store as a secret — never plaintext);
    (4) ECS service (desired count = 1, `awsvpc` networking);
    (5) Application Load Balancer, target group (port 3000), HTTP listener (port 80);
    (6) VPC with 2 public subnets + internet gateway + route table;
    (7) Security groups: ALB (port 80 inbound), ECS task (port 3000 from ALB only);
    (8) IAM: `ecs_execution_role` (ECR pull, CloudWatch logs),
    `ecs_task_role` (SSM GetParameter for `OPENAI_API_KEY`).
    `terraform output alb_dns_name` prints the public URL.
    State is local for v3 (remote S3 state is v4 scope).
  - Files: `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf`,
    `terraform/.gitignore` (ignores `*.tfstate`, `*.tfstate.backup`, `.terraform/`)

- [x] Task 16: GitHub Actions CD workflow — build, push ECR, deploy ECS (P0)
  - Acceptance: `.github/workflows/cd.yml` triggers on push to `main` only.
    Uses **OIDC** — no `AWS_SECRET_ACCESS_KEY` stored anywhere:
    ```yaml
    - uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-deploy
        aws-region: ${{ secrets.AWS_REGION }}
    ```
    Steps: OIDC → ECR login → `docker build` + push (`:latest` and `:<sha>`) →
    `aws ecs update-service --force-new-deployment` →
    `aws ecs wait services-stable`.
    GitHub Secrets required (documented in `SECURITY.md`):
    `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO_NAME`.
    `OPENAI_API_KEY` is stored in AWS SSM (not GitHub Secrets) and injected at runtime.
  - Files: `.github/workflows/cd.yml`

---

## Area 8 — Final Regression

- [x] Task 17: Full regression — all tests pass, pipeline runs clean (P0)
  - Acceptance:
    `npx vitest run` passes (≥ 107 total: 77 existing + ~22 new unit + 8 integration).
    `npx playwright test` (excluding `quality-gate.spec.ts`) passes (≥ 49 tests: 46 existing + 3 new E2E).
    `semgrep --config auto lib/ app/api/ --error` exits 0.
    `npm audit --audit-level=high` exits 0.
    `docker compose up` starts the app, `curl http://localhost:3000/` returns 200.
    `terraform plan` shows no errors.
    `TASKS.md` marked complete.
    `sprints/v3/WALKTHROUGH.md` written.
  - Files: `paper2colab/sprints/v3/TASKS.md`, `paper2colab/sprints/v3/WALKTHROUGH.md`

# Sprint v3 — Tasks: Production Ready (Testing + CI/CD + Docker + AWS)

## Status: Not Started

---

## Area 1 — Refactor for Testability

- [ ] Task 1: Split `main.py` monolith into `lib/` modules (P0)
  - Acceptance: `lib/pdf_extractor.py` exports `extract_pdf_text()`; `lib/arxiv_fetcher.py`
    exports `extract_arxiv_id()` and `fetch_paper_via_mcp()`; `lib/gemini_client.py` exports
    `call_gemini()`, `SYSTEM_INSTRUCTION`, `PROMPT_TEMPLATE`; `lib/notebook_builder.py` exports
    `build_notebook()` and `_strip_code_fences()`; `main.py` imports from `lib/` and all
    endpoints behave identically; `uvicorn main:app` starts without errors;
    `pip install -e .` or equivalent resolves all imports
  - Files: `lib/__init__.py`, `lib/pdf_extractor.py`, `lib/arxiv_fetcher.py`,
    `lib/gemini_client.py`, `lib/notebook_builder.py`, `main.py`

---

## Area 2 — Testing Pyramid

- [ ] Task 2: Unit tests for `pdf_extractor` (P0)
  - Acceptance: `pytest tests/unit/test_pdf_extractor.py` passes with ≥ 6 tests covering:
    (1) valid PDF bytes returns non-empty string; (2) password-protected PDF raises 400;
    (3) text shorter than 100 chars raises 422; (4) references section is stripped at the
    heading; (5) text exceeding 320,000 chars is truncated with "[Paper truncated]" suffix;
    (6) corrupt non-PDF bytes raises 422. `pypdf.PdfReader` is mocked — no real PDFs read.
  - Files: `tests/__init__.py`, `tests/unit/__init__.py`,
    `tests/unit/test_pdf_extractor.py`, `conftest.py` (pytest fixtures)

- [ ] Task 3: Unit tests for `arxiv_fetcher` — ID parsing (P0)
  - Acceptance: `pytest tests/unit/test_arxiv_fetcher.py` passes with ≥ 8 tests covering
    `extract_arxiv_id()`: (1) bare ID `2301.00001` returns `2301.00001`; (2) bare ID with
    version `1706.03762v7` strips version → `1706.03762`; (3) `https://arxiv.org/abs/2301.00001`
    extracts ID; (4) `https://arxiv.org/pdf/1706.03762v7` extracts + strips version;
    (5) old-style `hep-th/9901001` parses correctly; (6) invalid string raises 400 HTTPException;
    (7) arXiv URL with query params works; (8) empty string raises 400.
    No network calls — `extract_arxiv_id` is pure regex.
  - Files: `tests/unit/test_arxiv_fetcher.py`

- [ ] Task 4: Unit tests for `notebook_builder` (P0)
  - Acceptance: `pytest tests/unit/test_notebook_builder.py` passes with ≥ 6 tests covering:
    (1) `build_notebook()` returns valid nbformat v4 (passes `nbformat.validate()`); (2) title
    cell is first cell with `data['title']` in source; (3) code cells have `execution_count=None`
    and empty `outputs`; (4) markdown cells have correct type; (5) `_strip_code_fences()` removes
    triple-backtick python fences; (6) `_strip_code_fences()` is idempotent on plain code.
    No mocking needed — all pure functions.
  - Files: `tests/unit/test_notebook_builder.py`

- [ ] Task 5: Unit tests for `gemini_client` (P0)
  - Acceptance: `pytest tests/unit/test_gemini_client.py` passes with ≥ 6 tests covering
    `call_gemini()`: (1) valid JSON response is parsed and returned; (2) API key error
    (message contains "api key") raises 401 HTTPException; (3) quota error (message contains
    "quota") raises 429; (4) response missing `cells` field raises 500; (5) empty `cells`
    list raises 500; (6) JSON wrapped in ```json fences is cleaned and parsed.
    `genai.Client` is fully mocked — no real API calls.
  - Files: `tests/unit/test_gemini_client.py`

- [ ] Task 6: Integration tests for `POST /api/generate` (P0)
  - Acceptance: `pytest tests/integration/test_api_generate.py` passes with ≥ 4 tests using
    `httpx.AsyncClient(app=app)` (FastAPI TestClient): (1) valid PDF + valid API key returns
    200 with `Content-Disposition: attachment; filename=*.ipynb` and valid JSON body;
    (2) non-PDF file returns 400; (3) PDF > 30 MB returns 400; (4) Gemini returning 401
    propagates as 401 to the client. `call_gemini` is monkeypatched — no Gemini calls made.
    Real `extract_pdf_text()` is called with a minimal valid PDF fixture.
  - Files: `tests/integration/__init__.py`, `tests/integration/test_api_generate.py`,
    `tests/fixtures/minimal.pdf` (tiny valid PDF for testing)

- [ ] Task 7: Integration tests for `POST /api/generate-arxiv` (P0)
  - Acceptance: `pytest tests/integration/test_api_generate_arxiv.py` passes with ≥ 4 tests:
    (1) valid arXiv ID + valid API key returns 200 `.ipynb` download; (2) invalid arXiv input
    returns 400 with descriptive error; (3) MCP fetch failure returns 422; (4) Gemini quota
    error propagates as 429. Both `fetch_paper_via_mcp` and `call_gemini` are monkeypatched.
    MCP subprocess is never spawned in tests.
  - Files: `tests/integration/test_api_generate_arxiv.py`

- [ ] Task 8: E2E Playwright tests — mocked backend user flow (P1)
  - Acceptance: `pytest tests/e2e/test_e2e_flow.py` passes with ≥ 3 tests using Playwright
    and a live `uvicorn` test server started by the fixture: (1) user can upload a PDF, enter a
    fake API key, click Generate, and the browser downloads a `.ipynb` file (backend mocked);
    (2) entering an arXiv URL and clicking Generate downloads a `.ipynb` (backend mocked);
    (3) an invalid API key (Gemini 401) shows an error message in the UI. Screenshots taken
    at each step saved to `tests/screenshots/`. Test uses `page.route()` to mock Gemini.
  - Files: `tests/e2e/__init__.py`, `tests/e2e/test_e2e_flow.py`,
    `tests/screenshots/` (created by tests), `playwright.config.py` or inline config

- [ ] Task 9: Real quality gate test — headed browser, real Gemini key, Attention paper (P1)
  - Acceptance: Running `GEMINI_API_KEY=<key> pytest tests/e2e/test_quality_gate.py -s`
    opens a **visible (headed) browser**, navigates to the running app, uploads
    `/Users/vishnugillella/Documents/AI/AI_ML_Vizuara/modern_software_dev/msd-prd/attention_1706.03762v7.pdf`,
    enters the real API key from the `GEMINI_API_KEY` env var, clicks Generate, waits up to
    120 seconds, downloads the notebook, and then asserts:
    (a) downloaded file is valid JSON; (b) `nbformat.validate()` passes;
    (c) notebook has ≥ 8 cells total; (d) all code cells pass `ast.parse()` (valid Python 3);
    (e) at least one cell contains the word "attention" (case-insensitive).
    Screenshots saved at: upload, post-generate, download-complete.
    Test is skipped automatically if `GEMINI_API_KEY` is not set.
  - Files: `tests/e2e/test_quality_gate.py`

---

## Area 3 — Security Hygiene

- [ ] Task 10: Add `.gitignore` and security baseline files (P0)
  - Acceptance: `software_dev_2.0/.gitignore` includes `*.md` credentials patterns,
    `*.env`, `.env*`, `*_cred*`, `*_key*`, `*secret*`, `__pycache__/`, `.pytest_cache/`,
    `tests/screenshots/`. Root `.gitignore` also ignores `aws_cred.md` and any `*.pem` files.
    `git status` shows `aws_cred.md` as untracked (not staged). A `SECURITY.md` in the
    project root documents: (1) no credentials in files, (2) use GitHub Secrets for CI,
    (3) rotate any keys that were previously committed, (4) OIDC preferred over static keys.
  - Files: `software_dev_2.0/.gitignore`, `.gitignore` (root), `SECURITY.md`

---

## Area 4 — CI/CD Pipeline

- [ ] Task 11: GitHub Actions CI workflow — tests + security scans (P0)
  - Acceptance: `.github/workflows/ci.yml` runs on every `push` and `pull_request` to any
    branch. Jobs (all must pass; any failure blocks merge to `main`):
    (1) `test`: `pip install -r requirements.txt pytest pytest-asyncio httpx playwright`,
    `playwright install chromium`, `pytest tests/unit/ tests/integration/ -v`,
    then `pytest tests/e2e/test_e2e_flow.py` (NOT the quality gate — no real API key in CI);
    (2) `semgrep`: `semgrep --config auto lib/ main.py --error` (non-zero exit on findings);
    (3) `pip-audit`: `pip-audit -r requirements.txt` (non-zero exit on high/critical vulns).
    The `GEMINI_API_KEY` GitHub Secret is available to the `test` job for integration tests
    that need a real key (marked with `@pytest.mark.requires_api_key`).
  - Files: `.github/workflows/ci.yml`

---

## Area 5 — Docker

- [ ] Task 12: Dockerfile for the FastAPI backend (P0)
  - Acceptance: `docker build -t paper2colab-backend .` from `software_dev_2.0/` succeeds.
    `docker run -p 8000:8000 -e GEMINI_API_KEY=dummy paper2colab-backend` starts uvicorn and
    `curl http://localhost:8000/` returns 200. Image uses `python:3.11-slim`, copies
    `requirements.txt` first (layer caching), runs as non-root user `appuser`, exposes port
    8000. Multi-stage build not required for v3. Image size < 800 MB.
  - Files: `software_dev_2.0/Dockerfile`, `software_dev_2.0/.dockerignore`

- [ ] Task 13: `docker-compose.yml` for local development (P0)
  - Acceptance: `docker compose up` from `software_dev_2.0/` builds and starts the backend.
    `curl http://localhost:8000/` returns 200. `docker compose down` stops cleanly.
    The compose file defines: service `backend` (build: `.`, ports: `8000:8000`,
    env_file: `.env.local` — not committed), optional `environment` block for
    `GEMINI_API_KEY` override. Includes a healthcheck (`/` endpoint, 30s interval).
    A `.env.local.example` file shows the required env vars without values.
  - Files: `software_dev_2.0/docker-compose.yml`, `software_dev_2.0/.env.local.example`

---

## Area 6 — AWS Cloud Deployment

- [ ] Task 14: Terraform for AWS ECS Fargate infrastructure (P0)
  - Acceptance: `terraform init && terraform plan` runs without errors (credentials from
    environment, NOT from files). Terraform creates: (1) ECR repository `paper2colab`;
    (2) ECS cluster `paper2colab-cluster`; (3) ECS task definition (Fargate, 512 CPU /
    1024 MB memory, port 8000, reads `GEMINI_API_KEY` from AWS SSM Parameter Store);
    (4) ECS service (desired count = 1); (5) Application Load Balancer with target group
    pointing to port 8000; (6) VPC with 2 public subnets + internet gateway; (7) IAM roles
    (task execution role, task role). `terraform output alb_dns_name` prints the public URL.
    State is local for v3 (remote state is v4 scope).
  - Files: `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf`,
    `terraform/.gitignore` (ignores `*.tfstate`, `*.tfstate.backup`, `.terraform/`)

- [ ] Task 15: GitHub Actions CD workflow — build, push to ECR, deploy to ECS (P0)
  - Acceptance: `.github/workflows/cd.yml` triggers on push to `main` **only after CI
    passes** (using `needs: ci` or workflow dependency). Steps:
    (1) Configure AWS credentials using **OIDC** (`aws-actions/configure-aws-credentials`
    with `role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/github-actions-deploy`);
    (2) Login to ECR (`aws-actions/amazon-ecr-login`);
    (3) Build Docker image and push to ECR with tag `latest` and `${{ github.sha }}`;
    (4) Update ECS service (`aws ecs update-service --force-new-deployment`);
    (5) Wait for deployment to stabilize (`aws ecs wait services-stable`).
    GitHub Secrets required: `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO_NAME`.
    The `GEMINI_API_KEY` is stored in AWS SSM (not GitHub Secrets) and injected at runtime.
  - Files: `.github/workflows/cd.yml`

---

## Area 7 — Final Regression

- [ ] Task 16: Full regression — all tests pass, pipeline runs clean (P0)
  - Acceptance: `pytest tests/unit/ tests/integration/ tests/e2e/test_e2e_flow.py -v`
    passes (≥ 31 total tests: 20+ unit, 8+ integration, 3 E2E). `semgrep --config auto
    lib/ main.py --error` exits 0. `pip-audit -r requirements.txt` shows 0 high/critical.
    `docker compose up` starts the app. `terraform plan` shows no errors. TASKS.md marked
    complete. `sprints/v3/WALKTHROUGH.md` written.
  - Files: `sprints/v3/TASKS.md`, `sprints/v3/WALKTHROUGH.md`

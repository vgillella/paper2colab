# Sprint v3 — Production Ready: Walkthrough

## What was built

Sprint v3 hardened paper2colab into a production-ready application across three areas:
testing pyramid, CI/CD pipeline, and Docker + AWS cloud deployment.

---

## 1. New Feature — arXiv URL Support

`lib/arxiv-fetcher.ts` exports two functions:

- `extractArxivId(input)` — parses bare IDs (`2301.00001`), versioned IDs (`1706.03762v7`),
  abs URLs, pdf URLs, and old-style category IDs (`hep-th/9901001`). Throws `ArxivValidationError`
  on invalid input.
- `fetchArxivPdf(arxivId)` — fetches `https://arxiv.org/pdf/{id}.pdf` and returns a `Buffer`.

The new route `app/api/generate-arxiv/route.ts` accepts `POST { arxivUrl, apiKey }`, validates
both, downloads the PDF via `fetchArxivPdf`, then runs the same SSE streaming pipeline as
`/api/generate`.

The UI (`app/page.tsx`) has a PDF/arXiv tab switcher (`data-testid="mode-pdf"` and
`data-testid="mode-arxiv"`) so users can switch between uploading a local PDF and entering an
arXiv URL.

---

## 2. Testing Pyramid

### Unit tests — 113 passing

| File | Tests | What's covered |
|------|-------|----------------|
| `tests/unit/pdf-extraction.test.ts` | 13 | validateGenerateRequest, extractTextFromPdf (DI), stripReferences |
| `tests/unit/openai-streaming.test.ts` | 13 | generateNotebook streaming, null deltas, classifyOpenAiError |
| `tests/unit/gist-uploader.test.ts` | 7 | uploadToGist HTTP responses, notebookFilename sanitisation |
| `tests/unit/arxiv-fetcher.test.ts` | 8 | extractArxivId — all ID formats, edge cases |
| `tests/unit/notebook-assembler.test.ts` | 10 | cell assembly, metadata, filename |
| ... and 6 other unit test files | 62 | remaining lib coverage |

Run: `npx vitest run`

### Integration tests — included in above 113

| File | Tests | What's covered |
|------|-------|----------------|
| `tests/integration/api-generate.test.ts` | 4 | POST /api/generate with mocked OpenAI |
| `tests/integration/api-generate-arxiv.test.ts` | 4 | POST /api/generate-arxiv with mocked deps |

Pattern: real `Request` objects → real route handler → assert `Response` shape and SSE events.

### E2E tests — 6 passing (Playwright, Chromium)

| File | Tests | What's covered |
|------|-------|----------------|
| `tests/e2e/task-v3-pdf-flow.spec.ts` | 3 | Page load, full PDF upload + download, PDF tab default |
| `tests/e2e/task-v3-arxiv-flow.spec.ts` | 3 | arXiv tab switch, full arXiv flow, submit disabled without key |

Both specs use `page.route()` to mock the API — no real OpenAI calls needed.

Screenshots are saved to `tests/screenshots/` at each major step.

Run: `npx playwright test tests/e2e/task-v3-pdf-flow.spec.ts tests/e2e/task-v3-arxiv-flow.spec.ts`

### Quality gate (local only, real API key)

`tests/e2e/quality-gate.spec.ts` runs only when `OPENAI_API_KEY` is set in the environment.
It uploads the Attention Is All You Need paper (`attention_1706.03762v7.pdf`), waits up to
200 seconds for generation, downloads the `.ipynb`, and asserts:

- Valid JSON
- ≥ 8 cells
- ≥ 3 non-empty cells
- "attention" appears in the text
- A disclaimer/safety note is present

Run: `OPENAI_API_KEY=sk-... npx playwright test tests/e2e/quality-gate.spec.ts`

---

## 3. CI/CD Pipeline

### CI — `.github/workflows/ci.yml`

Triggers on every push and pull request. Three parallel jobs that must all pass:

1. **test** — `npm ci` → `npx vitest run` → `npx playwright install chromium` →
   `npx playwright test` (all E2E except quality gate). Screenshots uploaded as artifacts on failure.
2. **semgrep** — `semgrep --config auto lib/ app/api/ --error` (0 findings confirmed locally)
3. **npm-audit** — `npm audit --audit-level=high` (exits 0; 0 vulnerabilities after `npm audit fix`)

Set branch protection in GitHub: **Settings → Branches → Require status checks → select all 3**.

### CD — `.github/workflows/cd.yml`

Triggers on push to `main` only. Uses **OIDC** (no static AWS credentials in GitHub Secrets).

Steps:
1. `aws-actions/configure-aws-credentials@v4` with `role-to-assume` (OIDC)
2. `aws-actions/amazon-ecr-login@v2`
3. `docker build` + push `:latest` and `:<sha>` tags
4. `aws ecs update-service --force-new-deployment`
5. `aws ecs wait services-stable`

Required GitHub Secrets: `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO_NAME`.
`OPENAI_API_KEY` lives in AWS SSM Parameter Store — never in GitHub Secrets.

---

## 4. Docker

### Build

```bash
# From paper2colab/
docker build -t paper2colab .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... paper2colab
```

The `Dockerfile` uses a 3-stage multi-stage build:
- **deps** — installs only production dependencies
- **builder** — runs `npm run build` (generates `.next/standalone/`)
- **runner** — copies standalone output, runs as non-root `nextjs` user (UID 1001)

`next.config.mjs` sets `output: 'standalone'` to produce the optimised Docker output.

### docker-compose

```bash
# Copy the example env file and fill in your key
cp .env.local.example .env.local
# edit .env.local with OPENAI_API_KEY=sk-...

docker compose up
# curl http://localhost:3000/ → 200
docker compose down
```

---

## 5. AWS ECS Fargate (Terraform)

```bash
cd terraform/
terraform init
terraform plan   # review what will be created
terraform apply  # provision everything
terraform output alb_dns_name  # → http://<alb-dns>
```

Resources created:
- VPC with 2 public subnets + internet gateway + route table
- Security groups: ALB (port 80 public), ECS task (port 3000 from ALB only)
- ECR repository `paper2colab-frontend`
- ECS cluster `paper2colab-cluster`
- ECS task definition (Fargate, 512 CPU / 1024 MB, reads `OPENAI_API_KEY` from SSM)
- ECS service (desired count = 1, `awsvpc` networking)
- Application Load Balancer → target group → HTTP listener (port 80)
- IAM execution role (ECR pull, CloudWatch logs)
- IAM task role (SSM GetParameter for `OPENAI_API_KEY`)

Before `terraform apply`:
1. Store your key: `aws ssm put-parameter --name /paper2colab/OPENAI_API_KEY --value sk-... --type SecureString`
2. Create the OIDC trust role `github-actions-deploy` in IAM with permissions for ECR push
   and ECS update-service.

---

## Security notes

- `aws_cred.md` and all credential patterns are gitignored (see `.gitignore`).
- `OPENAI_API_KEY` is never in any committed file — it comes from SSM at runtime.
- CD pipeline uses OIDC — no `AWS_SECRET_ACCESS_KEY` stored anywhere.
- All security rules documented in `SECURITY.md`.

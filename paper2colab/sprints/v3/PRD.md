# Sprint v3 — PRD: Paper2Colab Frontend — Production Ready

## Overview

Make the paper2colab Next.js app production-ready by adding a full testing pyramid
(expanded Vitest unit tests, API route integration tests with mocked OpenAI, Playwright E2E tests
with screenshots, and a real headed-browser quality gate), a GitHub Actions CI/CD pipeline that
blocks merges on any failure, and Docker + AWS ECS Fargate deployment driven by Terraform.
A new arXiv URL input and `/api/generate-arxiv` route is added to match the testing scope.

## Goals

- **Testing pyramid**: unit tests ≥ 70% of new v3 tests; 8+ integration tests; 3+ new E2E tests
- **Real quality gate**: headed Chromium browser, user types their own API key, uploads Attention Is
  All You Need PDF, validates: valid JSON, ≥ 8 cells, all code cells parse as valid JS/Python,
  safety disclaimer present
- **CI blocks merges**: every push/PR runs `vitest` + Playwright + Semgrep + `npm audit`; a
  failing check prevents merge to `main`
- **One-command local stack**: `docker compose up` starts the full Next.js app
- **Cloud deployment**: `terraform apply` provisions AWS ECS Fargate + ALB; CD pipeline
  auto-deploys after tests pass on `main`

## User Stories

- As a developer, I want to run `npm test` and see every lib module tested in isolation, so I can
  trust individual functions before integrating them
- As a developer, I want CI to block a bad PR automatically, so broken code never reaches `main`
- As a researcher, I want to paste an arXiv URL and get a notebook without downloading a PDF first,
  so the workflow is faster
- As a researcher, I want to generate a real notebook from "Attention Is All You Need" and see it
  validated, so I know the full pipeline works end-to-end
- As an operator, I want `docker compose up` to start the app, so I can reproduce production
  locally without installing Node
- As a deployer, I want `terraform apply` to create the full AWS infrastructure, so cloud setup is
  reproducible and version-controlled

## New Feature: arXiv URL Support

Sprint v3 adds an arXiv URL input to the frontend and a corresponding API route. This is required
for the integration tests and E2E tests the user described.

### lib/arxiv-fetcher.ts (new)

```typescript
export function extractArxivId(input: string): string
// Parses bare IDs (2301.00001, 1706.03762v7) and URLs (arxiv.org/abs/..., arxiv.org/pdf/...)
// Strips version suffix. Throws 400 ValidationError on invalid input.

export async function fetchArxivPdf(arxivId: string): Promise<Buffer>
// Fetches https://arxiv.org/pdf/{id}.pdf and returns the raw bytes.
// Throws 422 if the response is not a PDF (Content-Type check).
```

### /api/generate-arxiv route (new)

Same pipeline as `/api/generate` but reads arXiv ID from JSON body instead of multipart form:

```
POST /api/generate-arxiv
Body: { arxivUrl: string, apiKey: string }

1. validateArxivRequest(arxivUrl, apiKey)  → 400 / 413 before SSE opens
2. extractArxivId(arxivUrl)               → paper ID
3. fetchArxivPdf(paperId)                 → PDF buffer
4. extractTextFromPdf(buffer)             → text
5. generateNotebook(apiKey, text, ...)    → SSE token stream
6. assembleNotebook() → uploadToGist()
7. { type:"done", ... } SSE event
```

## Technical Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                             Browser                                  │
│                                                                      │
│  page.tsx                                                            │
│  ├── ApiKeyInput (existing)                                          │
│  ├── PdfUploadZone (existing)          ┐ new: tab/toggle            │
│  ├── ArxivUrlInput (new)              ┘                              │
│  ├── ProgressFeed (existing)                                         │
│  └── ResultActions (existing)                                        │
│         │                │                                           │
│         │ POST /api/generate    POST /api/generate-arxiv (new)      │
└─────────┼────────────────┼─────────────────────────────────────────┘
          │                │
          ▼                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  middleware.ts (rate limiter — unchanged)                            │
└─────────────────────────┬────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────────┐
          ▼                                   ▼
┌─────────────────────┐             ┌─────────────────────────────┐
│  /api/generate      │             │  /api/generate-arxiv (new)  │
│  (PDF upload path)  │             │  (arXiv URL path)           │
│  • validateRequest  │             │  • validateArxivRequest     │
│  • extractPdfText   │             │  • extractArxivId           │
│  • sanitizePdfText  │             │  • fetchArxivPdf → buffer   │
│  • generateNotebook │             │  • extractPdfText           │
│  • assembleNotebook │             │  • generateNotebook         │
│  • uploadToGist     │             │  • assembleNotebook         │
└─────────┬───────────┘             │  • uploadToGist             │
          │                         └──────────┬──────────────────┘
          └─────────────┬───────────────────────┘
                        ▼
               OpenAI API (stream:true)
               GitHub Gist API (public:false)
               arxiv.org/pdf/* (new, fetch)
```

### Testing Pyramid

```
           ┌───────────────────────────────┐
           │     E2E (Playwright)          │  ~10%  ·  3 new tests
           │  full browser flow            │          + 1 quality gate
           ├───────────────────────────────┤
           │     Integration               │  ~20%  ·  8 new tests
           │  Next.js route handlers       │
           │  mocked OpenAI + arXiv fetch  │
           ├───────────────────────────────┤
           │     Unit (Vitest)             │  ~70%  ·  22+ new tests
           │  pure functions, no I/O       │
           │  mocked clients              │
           └───────────────────────────────┘
```

**Existing baseline (v1 + v2):** 77 unit tests + 46 E2E tests = 123 total

**v3 adds:** ~22+ unit + 8 integration + 3 E2E + 1 quality gate = ~34+ new tests

### CI/CD Flow

```
push/PR ──▶ ci.yml:
              test job ──────────────▶ vitest (unit + integration)
                                        playwright (E2E, not quality gate)
                                        (upload screenshots on failure)
              semgrep job ─────────▶ semgrep --config auto lib/ app/api/ --error
              npm-audit job ───────▶ npm audit --audit-level=high

push to main ──▶ cd.yml:
              OIDC auth ──▶ ECR push ──▶ ECS force-redeploy ──▶ wait stable
```

### AWS Runtime

```
Internet ──▶ ALB (port 80) ──▶ ECS Fargate task (port 3000)
                                    │
                                    └── Next.js standalone server
                                         ├── GET  / (frontend)
                                         ├── POST /api/generate
                                         └── POST /api/generate-arxiv
```

## Real Quality Gate

```
test: test_quality_gate.spec.ts
  └── skipped if OPENAI_API_KEY env var not set

Flow:
  1. Launch headed Chromium (visible browser)
  2. Navigate to http://localhost:3000
  3. User MANUALLY types their API key into the input
     (test pauses with page.pause() or prompt)
  4. Upload attention_1706.03762v7.pdf
  5. Click "Generate Notebook"
  6. Wait up to 120 seconds for done event
  7. Download the .ipynb file
  8. Assert:
     a. Downloaded file is valid JSON
     b. nbformat-like structure present (cells array)
     c. ≥ 8 cells total
     d. At least 3 code cells with syntactically non-empty content
     e. "attention" appears in notebook text (case-insensitive)
     f. Screenshot saved at: upload, post-generate, download-complete
```

## Security Notes

> **CRITICAL**: `aws_cred.md` MUST be in `.gitignore` before any `git push` or CI setup.
> Task 1 is non-negotiable — do this first. Rotate any credentials that may already be
> committed. The CD pipeline uses OIDC — no static AWS credentials stored anywhere.

## Out of Scope (v4+)

- Distributed Redis rate limiting (replacing in-memory middleware)
- GitHub OAuth for private Gists
- OCR for scanned/image PDFs
- In-browser notebook cell preview
- HTTPS + custom domain on ALB (ACM certificate)
- Blue/green ECS deployments
- Nonce-based CSP (removing `unsafe-inline`)

## Dependencies

- v2 complete (all tasks ✓)
- GitHub repository exists with the project code
- AWS account with ECR, ECS, ALB, IAM, VPC permissions
- GitHub Actions OIDC configured with AWS account (Task 15)
- Docker Desktop (or equivalent) installed locally
- `OPENAI_API_KEY` available as GitHub Secret for CI integration tests
- Attention Is All You Need PDF at:
  `/Users/vishnugillella/Documents/AI/AI_ML_Vizuara/modern_software_dev/msd-prd/attention_1706.03762v7.pdf`

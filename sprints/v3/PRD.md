# Sprint v3 — PRD: Paper2Colab Python Backend — Production Ready

## Overview

Make the `software_dev_2.0` FastAPI backend production-ready by adding a full
testing suite (unit → integration → E2E following the 70/20/10 pyramid), a
GitHub Actions CI/CD pipeline that blocks merges on any failure, and Docker +
AWS ECS Fargate deployment driven by Terraform. After this sprint the app can
be deployed to the cloud and trusted — every commit is automatically tested,
scanned, and shipped.

## Goals

- **Testing pyramid**: ≥ 20 unit tests, ≥ 8 integration tests, ≥ 3 E2E tests;
  unit tests ≥ 70% of total test count
- **Real quality gate**: a headed-browser test generates a notebook from the
  Attention Is All You Need PDF, validates valid JSON, ≥ 8 cells, valid Python
  in code cells, and a safety disclaimer
- **CI blocks merges**: every push/PR runs pytest + Playwright + semgrep +
  pip-audit; a failing check prevents merge to `main`
- **One-command local stack**: `docker compose up` starts the full app
- **Cloud deployment**: `terraform apply` provisions AWS ECS Fargate + ALB;
  CD pipeline auto-deploys after tests pass on `main`

## User Stories

- As a developer, I want to run `pytest` and see every module tested in isolation,
  so I can trust that individual functions work before I integrate them
- As a developer, I want CI to block a bad PR automatically, so broken code never
  reaches `main`
- As a researcher, I want to generate a real notebook from "Attention Is All You
  Need" and validate it passes quality checks, so I know the full pipeline works
  end-to-end with a real API key
- As an operator, I want `docker compose up` to start the app, so I can reproduce
  the production environment locally without installing Python
- As a deployer, I want `terraform apply` to create the full AWS infrastructure,
  so cloud setup is reproducible and version-controlled

## Target Codebase

`software_dev_2.0/` — Python FastAPI backend:

| Module (current) | Functions |
|-----------------|-----------|
| `main.py` (monolith) | `extract_pdf_text()`, `call_gemini()`, `build_notebook()`, `extract_arxiv_id()`, `fetch_paper_via_mcp()`, FastAPI app + endpoints |

### Refactoring plan (Task 1)

The monolith must be split into testable modules before tests can be written:

```
software_dev_2.0/
├── main.py               ← FastAPI app + endpoints only (thin layer)
├── lib/
│   ├── pdf_extractor.py  ← extract_pdf_text()
│   ├── arxiv_fetcher.py  ← extract_arxiv_id(), fetch_paper_via_mcp()
│   ├── gemini_client.py  ← call_gemini(), SYSTEM_INSTRUCTION, PROMPT_TEMPLATE
│   └── notebook_builder.py ← build_notebook(), _strip_code_fences(), _make_id()
├── tests/
│   ├── unit/
│   │   ├── test_pdf_extractor.py
│   │   ├── test_arxiv_fetcher.py
│   │   ├── test_gemini_client.py
│   │   └── test_notebook_builder.py
│   ├── integration/
│   │   ├── test_api_generate.py
│   │   └── test_api_generate_arxiv.py
│   └── e2e/
│       ├── test_upload_flow.spec.ts   ← Playwright (or test_upload_flow.py)
│       └── test_quality_gate.py       ← real API key, real paper
├── Dockerfile
├── docker-compose.yml
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
└── terraform/
    ├── main.tf
    ├── variables.tf
    └── outputs.tf
```

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CI/CD (GitHub Actions)                       │
│                                                                     │
│  On every push/PR:                                                  │
│  pytest unit + integration ──┐                                      │
│  playwright e2e ─────────────┼── ALL PASS? → merge allowed          │
│  semgrep (SAST) ─────────────┤           → deploy to ECS (main)    │
│  pip-audit (SCA) ────────────┘                                      │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ on push to main: build + push
                                     ▼
                              ┌─────────────────┐
                              │  AWS ECR         │
                              │  (Docker image)  │
                              └───────┬──────────┘
                                      │ ECS pulls image
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AWS ECS Fargate (Terraform-managed)             │
│                                                                     │
│  Internet ──▶ ALB (port 80/443) ──▶ ECS Task (port 8000)           │
│                                         │                           │
│                                  FastAPI container                  │
│                                  ├── POST /api/generate             │
│                                  ├── POST /api/generate-arxiv       │
│                                  └── GET  /static/* (frontend)      │
│                                         │                           │
│                                  ┌──────┴──────────────┐            │
│                                  ▼                     ▼            │
│                         Google Gemini 2.5     arxiv-mcp-server      │
│                         Flash API             (subprocess)          │
└─────────────────────────────────────────────────────────────────────┘
```

### Testing Pyramid

```
        ┌─────────────────────┐
        │    E2E (Playwright) │  ~10%  ·  3 tests
        │  full browser flow  │
        ├─────────────────────┤
        │    Integration      │  ~20%  ·  8+ tests
        │  FastAPI TestClient │
        │  mocked Gemini/MCP  │
        ├─────────────────────┤
        │       Unit          │  ~70%  ·  20+ tests
        │  pure functions,    │
        │  no I/O, mocked     │
        └─────────────────────┘
```

### Real Quality Test (Task 8)

Runs in headed browser mode (visible). Requires `GEMINI_API_KEY` env var set
locally (NOT committed to the repo). Validates the generated notebook:

```python
# Acceptance criteria for the quality gate
assert json_valid(notebook_json)
assert cell_count >= 8
assert all code cells contain syntactically valid Python (ast.parse)
assert "safety" or "disclaimer" in notebook_text (case-insensitive)
assert "Attention" in notebook_title
```

### AWS Deployment (Terraform + ECS)

```
terraform/
├── main.tf         ECR repo, ECS cluster, task definition, service, ALB
├── variables.tf    aws_region, app_name, container_port, desired_count
└── outputs.tf      alb_dns_name, ecr_repo_url
```

GitHub Actions CD uses **OIDC** (not long-lived keys) to authenticate with AWS.
No AWS credentials are stored in files or GitHub Secrets — a trust policy on
the IAM role allows GitHub Actions to assume it.

## Security Notes

> **CRITICAL**: `aws_cred.md` must NEVER be committed to git. Add it to
> `.gitignore` immediately. Rotate any keys that may already have been
> committed. The CI/CD pipeline uses OIDC — no static credentials required.

## Out of Scope (v4+)

- Redis-backed rate limiting for the Python backend
- GitHub OAuth for the Next.js frontend (different project)
- OCR for scanned PDFs
- Multi-paper batch processing
- Custom domain + HTTPS certificate (ALB + ACM)
- Blue/green deployments
- Database for usage history

## Dependencies

- `software_dev_2.0/` working locally (`uvicorn main:app` starts without errors)
- GitHub repository exists with the project code
- AWS account with sufficient permissions to create ECR, ECS, ALB, IAM, VPC
- GitHub Actions OIDC configured with the AWS account (Task 13)
- `GEMINI_API_KEY` available as a GitHub Secret for CI integration tests
- Docker Desktop (or equivalent) installed locally

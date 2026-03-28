# Security Policy

## 1. No Credentials in Files

**Never** commit credentials, API keys, or secrets to this repository.

Files that must **never** be committed:
- `aws_cred.md` — AWS access key ID and secret
- `.env.local` — local environment variables (OpenAI key, etc.)
- `*.pem`, `*.p12`, `*.pfx` — TLS/SSH certificates and private keys
- Any file matching `*_key*`, `*_cred*`, `*secret*`

All of the above patterns are covered by `.gitignore`. Run `git status` before
every push to confirm none of these files are staged.

**If you accidentally commit credentials:**
1. Rotate the key immediately — treat it as compromised
2. Remove the file from git history: `git filter-branch` or `git-filter-repo`
3. Force-push the cleaned history (coordinate with teammates first)

## 2. Use GitHub Secrets for CI

The CI pipeline (`ci.yml`) injects secrets from GitHub repository settings:

| Secret | Purpose |
|--------|---------|
| `OPENAI_API_KEY` | Integration tests that call the OpenAI API |

To add a secret: GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret.

Never put API keys in workflow YAML files — use `${{ secrets.SECRET_NAME }}`.

## 3. Rotate Compromised Keys

If any key has been (or may have been) exposed:
1. **OpenAI**: platform.openai.com → API keys → revoke the key → create a new one
2. **AWS**: IAM console → Users → Security credentials → Deactivate + delete access key → create new
3. **GitHub token**: github.com → Settings → Developer settings → Personal access tokens → Revoke

Update GitHub Secrets with the new values immediately after rotation.

## 4. OIDC Preferred Over Static AWS Credentials

The CD pipeline (`cd.yml`) authenticates to AWS using **OpenID Connect (OIDC)**, not static
access keys. OIDC tokens are short-lived and scoped to the specific workflow run.

Required GitHub Secrets for CD (values, not credentials):
| Secret | Example value |
|--------|--------------|
| `AWS_ACCOUNT_ID` | `123456789012` |
| `AWS_REGION` | `us-east-1` |
| `ECR_REPO_NAME` | `paper2colab-frontend` |

The `OPENAI_API_KEY` used by the running container is stored in **AWS SSM Parameter Store**
as a `SecureString` — never as a plaintext environment variable in the task definition.

## 5. CI Branch Protection

All three CI jobs must pass before merging to `main`:
- `test` — vitest (unit + integration) + Playwright E2E
- `semgrep` — static analysis on `lib/` and `app/api/`
- `npm-audit` — dependency vulnerability check (`--audit-level=high`)

Configure branch protection in GitHub → Repository → Settings → Branches → Add rule for `main`:
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- Status checks: `test`, `semgrep`, `npm-audit`

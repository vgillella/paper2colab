# Sprint v2 — PRD: Paper2Colab — Security Hardening + Streaming UX

## Overview
Fix all Critical and High security findings from the v1 audit, upgrade Next.js to eliminate
known CVEs, and replace the single 60–90 second OpenAI wait with a real-time token streaming
experience. v2 makes the app safe to deploy publicly and noticeably better to use.

## Goals
- All Critical and High security findings from the v1 audit are resolved
- Next.js upgraded from 14 → 15 (eliminates 4 high npm audit CVEs)
- Users watch the notebook generate token-by-token instead of staring at one progress message
- PDF size is capped; API key format is validated server-side before hitting OpenAI
- GitHub Gist defaults to secret (unlisted); users see a clear disclosure before submitting

## User Stories
- As a researcher, I want to watch the notebook cells being written in real time, so I know the
  model is making progress and I understand the structure before it finishes
- As a researcher uploading confidential work, I want the Gist to be secret (unlisted) by
  default, so my paper content is not indexed publicly on GitHub
- As a security-conscious user, I want the app to enforce reasonable input limits, so I know
  it won't be abused to spend my API quota
- As a deployer, I want the app to pass a basic security header check, so I can put it behind
  a CDN without adding custom header rules

## Technical Architecture

### Stack (changes from v1)
- **Runtime**: Next.js **15** (App Router) — upgraded from 14
- **Streaming**: OpenAI SDK `stream: true` → `AsyncIterable<ChatCompletionChunk>` → SSE
- **Rate limiting**: In-memory sliding window (no Redis dependency for v2)
- **Security headers**: `next.config.mjs` `headers()` async function
- Everything else unchanged from v1

### Streaming Architecture (new in v2)

```
Browser                          API Route                        OpenAI
  │                                  │                               │
  │── POST /api/generate ──────────▶ │                               │
  │                                  │── chat.completions.create ──▶ │
  │                                  │   stream: true                │
  │◀─ SSE: progress events ──────── │◀─ AsyncIterable<chunk> ─────  │
  │                                  │                               │
  │   [for each JSON chunk           │   accumulate delta.content    │
  │    from OpenAI stream]           │   → emit SSE "token" event    │
  │◀─ SSE: { type:"token",           │                               │
  │          delta: "..." } ──────── │                               │
  │                                  │                               │
  │   [frontend accumulates          │   [when stream ends]          │
  │    tokens into rawJson]          │   parse JSON → NotebookSpec   │
  │                                  │   assemble → upload Gist      │
  │◀─ SSE: { type:"done", ... } ─── │                               │
```

### Rate Limiting (new in v2)

```
Request
  │
  ▼
middleware.ts (Next.js edge middleware)
  │
  ├── extract IP from x-forwarded-for / remoteAddress
  ├── check in-memory sliding window: max 3 requests / 10 minutes per IP
  │
  ├── ALLOW → forward to /api/generate
  └── DENY  → 429 { error: "Too many requests. Try again in N minutes." }
```

### Security Headers (new in v2)

Added via `next.config.mjs` `headers()` for all routes:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...`

### Input Validation Changes (new in v2)

```
POST /api/generate
  │
  ├── [NEW] Check PDF file size: > 20 MB → 413
  ├── [NEW] Validate apiKey format: /^sk-[A-Za-z0-9\-_]{20,200}$/ → 400
  ├── [NEW] Sanitise pdfText: strip \x00-\x08, \x0B, \x0E-\x1F, \u202E → clean text
  ├── [NEW] Escape prompt delimiter: strip "=== PAPER TEXT" from pdf content
  └── existing validation (missing fields → 400)
```

## Out of Scope (v3+)
- OCR for scanned/image-based PDFs
- In-browser notebook cell preview
- Google Drive / direct Colab API integration
- User accounts, saved history
- Redis-backed distributed rate limiting
- GitHub OAuth for private Gist upload
- Multi-paper batch processing

## Dependencies
- v1 complete (all 10 tasks ✓)
- Node.js 18+ (required by Next.js 15)
- OpenAI SDK ≥ 4.x (already installed — streaming API supported)

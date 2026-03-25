# Sprint v1 — PRD: Paper2Colab

## Overview
Build a web application where researchers upload a research paper PDF, enter their OpenAI API key, and receive a production-quality, fully-structured Google Colab tutorial notebook (`.ipynb`) that implements the paper's core algorithms and methodology with realistic synthetic data. The UI is dark, technical, and research-grade — inspired by arcprize.org/arc-agi.

## Goals
- User can enter their OpenAI API key and upload a PDF in a beautiful, research-grade dark UI
- App extracts full text from the PDF and sends it to GPT (model: `gpt-4.5-preview` or configured model string) with a structured system prompt
- Generated `.ipynb` notebook includes: paper summary, algorithm walkthroughs in markdown, full Python implementations, and realistic synthetic data experiments
- User sees live progress updates on-screen while notebook is being generated (so they stay engaged)
- User can download the `.ipynb` file directly and optionally open it in Google Colab via a GitHub Gist-based link

## User Stories
- As a researcher, I want to upload a PDF and get a runnable Colab notebook, so I can replicate the paper's methodology without writing boilerplate from scratch
- As a researcher, I want realistic synthetic data in the notebook, so I can validate my understanding of the algorithm without needing the paper's private dataset
- As a researcher, I want to see progress while the notebook generates, so I'm not left staring at a blank screen during a 60-90 second wait
- As a researcher, I want to open the result directly in Colab with one click, so I can start running cells immediately
- As a researcher, I want to enter my own API key, so I control my usage and costs directly

## Technical Architecture

### Stack
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **Backend**: Next.js API routes (Node.js)
- **PDF Parsing**: `pdf-parse` (server-side, in API route)
- **LLM**: OpenAI SDK (`gpt-4.5-preview` — configurable model string, user-provided key)
- **Notebook Generation**: Server-side JSON assembly into `.ipynb` format (nbformat v4)
- **Open in Colab**: GitHub Gist API (anonymous/unauthenticated POST) → Colab Gist URL
- **Streaming Progress**: Server-Sent Events (SSE) from API route → frontend status display

### Component Diagram
```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  API Key     │    │       PDF Upload             │   │
│  │  Input Field │    │   (drag & drop or click)     │   │
│  └──────────────┘    └──────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Live Progress Feed (SSE)               │    │
│  │  "Extracting text..." → "Analyzing paper..."    │    │
│  │  "Generating notebook cells..." → "Done!"       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌───────────────┐  ┌──────────────────────────────┐    │
│  │ Download .ipynb│  │   Open in Colab (Gist URL)  │    │
│  └───────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
           │ FormData (PDF + API key)                │
           ▼                                         │
┌─────────────────────────────────────────────────────────┐
│                  Next.js API Routes                     │
│                                                         │
│  POST /api/generate                                     │
│    1. Parse PDF → extract full text (pdf-parse)        │
│    2. Call OpenAI (user's key) with system prompt      │
│    3. Stream progress events back via SSE              │
│    4. Assemble .ipynb JSON (nbformat v4)               │
│    5. POST gist to GitHub API (anonymous)              │
│    6. Return { notebookJson, gistUrl }                 │
└─────────────────────────────────────────────────────────┘
           │ OpenAI API call (user's key)
           ▼
┌──────────────────────────────────┐
│   OpenAI API (gpt-4.5-preview)  │
│   System prompt: structured      │
│   notebook generation            │
└──────────────────────────────────┘
```

### OpenAI Prompt Strategy
The system prompt instructs the model to return a **structured JSON** object with:
- `title`: notebook title derived from paper
- `summary`: 2-3 paragraph overview of the paper
- `cells`: array of notebook cells, each with:
  - `type`: `"markdown"` or `"code"`
  - `source`: the cell content (explanatory markdown or Python code)
  - `section`: e.g. `"Introduction"`, `"Algorithm"`, `"Experiments"`, `"Conclusion"`

Cells must include:
1. Paper summary & motivation (markdown)
2. Algorithm pseudocode walkthrough (markdown)
3. Full Python implementation from scratch (code)
4. Realistic synthetic data generation (code) — not trivial toy data
5. Experiments & results visualization with matplotlib (code)
6. Discussion of results vs. paper expectations (markdown)

### .ipynb Assembly
The server assembles the returned JSON into a valid `nbformat v4` Jupyter notebook structure with proper metadata, kernelspec (`python3`), and cell outputs arrays.

### Open in Colab Flow
1. Server POSTs the `.ipynb` JSON to GitHub Gist API (no auth required for public gists via `api.github.com/gists`)
2. Gist URL returned: `https://gist.github.com/{gist_id}`
3. Colab URL constructed: `https://colab.research.google.com/gist/{gist_id}/{filename}`

### Design System (ARC-AGI inspired)
- **Background**: near-black (`#0a0a0a` / `#111111`)
- **Accent**: bright blue or teal (`#00d4ff` / `#0ea5e9`)
- **Text**: off-white (`#e5e7eb`)
- **Font**: monospace for code references, clean sans-serif (Inter or similar) for body
- **Borders**: subtle `#222` or `#333` with slight glow on focus/active states
- **Animations**: subtle fade-in, typewriter-style progress text
- **No rounded-pill buttons** — sharp/square with subtle border

## Out of Scope (v2+)
- User authentication / accounts
- Usage tracking / billing / rate limiting
- Storing generated notebooks server-side
- Google Drive / direct Colab API integration
- Notebook preview in the browser before download
- Multi-paper batch processing
- Custom notebook templates
- Sharing / collaboration features

## Dependencies
- None (greenfield project)
- User must supply their own OpenAI API key
- GitHub Gist API (unauthenticated) for "Open in Colab" — if this is unavailable, falls back to download-only

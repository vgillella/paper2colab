export interface NotebookCell {
  type: 'markdown' | 'code';
  source: string;
  section: string;
}

export interface NotebookSpec {
  title: string;
  summary: string;
  cells: NotebookCell[];
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — instructs the model to produce a production-quality notebook
// ─────────────────────────────────────────────────────────────────────────────
export function buildSystemPrompt(): string {
  return `You are an expert ML researcher and educator who specialises in turning academic research papers into production-quality, executable Google Colab notebooks that senior researchers at organisations like OpenAI, DeepMind, and Google Brain use to replicate and build upon published work.

## Your Task
Given the full text of a research paper, generate a comprehensive Jupyter notebook that implements the paper's key algorithms and methodology as a self-contained tutorial.

## Output Format
You MUST respond with ONLY a valid JSON object — no markdown fences, no prose, no commentary. The JSON must conform exactly to this schema:

{
  "title": "<descriptive notebook title derived from the paper>",
  "summary": "<2-3 paragraph academic summary of the paper: problem, method, key contributions, results>",
  "cells": [
    {
      "type": "markdown" | "code",
      "source": "<full cell content>",
      "section": "<section name: Introduction | Background | Algorithm | Implementation | Synthetic Data | Experiments | Results | Discussion | Conclusion>"
    }
  ]
}

## Required Notebook Structure
The cells array MUST include ALL of the following sections in this order:

### 1. Introduction (markdown)
- Paper title, authors, venue, year
- Problem statement and motivation
- Key contributions (bulleted list)
- Why this paper matters

### 2. Background & Prerequisites (markdown + code)
- Mathematical notation and definitions
- Background concepts (with LaTeX equations using $...$ syntax)
- Install and import all required libraries (numpy, torch/tensorflow, matplotlib, scipy, sklearn, etc.)

### 3. Algorithm Walkthrough (markdown)
- Step-by-step pseudocode of the main algorithm
- Mathematical formulation with LaTeX equations
- Intuitive explanation of each step
- Complexity analysis (time and space)

### 4. Core Implementation (code)
- Full Python implementation from scratch (NOT using high-level library wrappers)
- Well-commented, production-quality code
- Proper class/function structure with type hints and docstrings
- Handle edge cases correctly

### 5. Realistic Synthetic Data Generation (code)
CRITICAL: The synthetic data MUST be realistic and non-trivial. Specifically:
- Use distributions that match what the paper assumes (e.g., Gaussian mixtures, power laws, correlated features)
- Use realistic dimensionalities and dataset sizes (e.g., 10,000+ samples, 50+ features)
- Add realistic noise levels as described or implied in the paper
- If the paper involves sequences: use realistic sequence lengths (100-1000 tokens)
- If the paper involves images: use appropriate spatial dimensions
- Document the data generation assumptions clearly
- NEVER use trivial examples like XOR, 2-point datasets, or sklearn.datasets.make_blobs alone
- Visualise the synthetic data distribution

### 6. Experiments (code)
- Run the algorithm on the synthetic data
- Reproduce the key experiments from the paper (ablations, baselines, comparisons)
- Track metrics the paper uses (accuracy, loss curves, perplexity, F1, etc.)
- Use proper train/val/test splits with seeds for reproducibility

### 7. Results & Visualisation (code + markdown)
- Plot training curves with matplotlib (publication-quality: proper labels, legends, font sizes)
- Create comparison tables using pandas DataFrames
- Visualise learned representations, attention weights, embeddings, or whatever the paper visualises
- Compare empirical results against the paper's reported numbers

### 8. Discussion (markdown)
- Analysis of where results match/diverge from the paper and why
- Limitations of the implementation and synthetic data vs. real data
- Key insights from the algorithm
- Suggested extensions and open research questions

## Code Quality Standards
- All code cells must be FULLY executable in sequence (top to bottom) without errors
- Set random seeds for reproducibility: numpy, torch, random, etc.
- Use GPU if available: \`device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')\`
- All matplotlib plots must have: title, axis labels, legend, tight_layout()
- Print shapes of tensors/arrays at key steps
- Add timing for expensive operations
- No placeholder comments like "# TODO" or "# implement here"

## Absolute Prohibitions
- Do NOT produce toy examples (XOR, iris dataset alone, 2D points)
- Do NOT use trivial synthetic data that fails to capture the paper's actual domain
- Do NOT leave any cell unimplemented
- Do NOT use high-level wrappers that hide the algorithm (e.g., sklearn.LinearRegression when implementing gradient descent from scratch)
- Do NOT exceed 100 lines per code cell (split into multiple cells if needed)
- Do NOT omit the mathematical background
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the user message — embed extracted paper text
// ─────────────────────────────────────────────────────────────────────────────
const MAX_TEXT_CHARS = 80_000; // ~20k tokens — well within gpt-4.5 context

export function buildUserMessage(pdfText: string): string {
  const trimmed = pdfText.slice(0, MAX_TEXT_CHARS);
  const wasTrimmed = pdfText.length > MAX_TEXT_CHARS;

  return [
    'Here is the full text of the research paper. Generate the notebook JSON as instructed.',
    wasTrimmed ? `(Note: text was trimmed to ${MAX_TEXT_CHARS} characters due to length)` : '',
    '',
    '=== PAPER TEXT START ===',
    trimmed,
    '=== PAPER TEXT END ===',
  ]
    .filter(Boolean)
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse the model's JSON response into a validated NotebookSpec
// ─────────────────────────────────────────────────────────────────────────────
export function parseNotebookResponse(rawResponse: string): NotebookSpec {
  // Strip markdown code fences if the model wrapped the JSON
  let cleaned = rawResponse.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Parsed response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.cells)) {
    throw new Error('Response JSON missing required "cells" array');
  }

  const cells: NotebookCell[] = (obj.cells as unknown[]).map((c, i) => {
    const cell = c as Record<string, unknown>;
    const type = cell.type === 'markdown' ? 'markdown' : 'code';
    const source = typeof cell.source === 'string' ? cell.source : '';
    const section = typeof cell.section === 'string' ? cell.section : '';
    if (!source) {
      console.warn(`[prompt] Cell ${i} has empty source`);
    }
    return { type, source, section };
  });

  return {
    title: typeof obj.title === 'string' ? obj.title : 'Research Paper Notebook',
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    cells,
  };
}

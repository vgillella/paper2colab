// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock arxiv-fetcher before importing the route
vi.mock('@/lib/arxiv-fetcher', () => ({
  extractArxivId: vi.fn(),
  fetchArxivPdf: vi.fn(),
  ArxivValidationError: class ArxivValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ArxivValidationError';
    }
  },
}));

// Mock pdf-utils extractTextFromPdf
vi.mock('@/lib/pdf-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-utils')>();
  return {
    ...actual,
    extractTextFromPdf: vi.fn().mockResolvedValue(
      'This is a long mock paper text that has more than enough characters for testing purposes in the automated test suite for paper2colab integration.'
    ),
  };
});

// Mock openai-client
vi.mock('@/lib/openai-client', () => ({
  generateNotebook: vi.fn(),
  classifyOpenAiError: vi.fn((err: unknown) => (err as Error).message),
}));

// Mock gist-uploader
vi.mock('@/lib/gist-uploader', () => ({
  uploadToGist: vi.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/generate-arxiv/route';
import { extractArxivId, fetchArxivPdf, ArxivValidationError } from '@/lib/arxiv-fetcher';
import { generateNotebook } from '@/lib/openai-client';

const VALID_KEY = 'sk-abcdefghij1234567890';
const VALID_ARXIV_URL = 'https://arxiv.org/abs/2301.00001';
const VALID_SPEC = {
  title: 'Test ArXiv Notebook',
  summary: 'Test summary from arxiv',
  cells: [{ type: 'code' as const, source: 'print("hello")', section: 'Introduction' }],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function makeJsonRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/api/generate-arxiv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readSseStream(res: Response): Promise<object[]> {
  const text = await res.text();
  return text.split('\n\n')
    .filter(chunk => chunk.startsWith('data:'))
    .map(chunk => {
      try {
        return JSON.parse(chunk.slice(5).trim());
      } catch {
        return null;
      }
    })
    .filter(Boolean) as object[];
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/generate-arxiv', () => {
  beforeEach(() => {
    vi.mocked(extractArxivId).mockReset();
    vi.mocked(fetchArxivPdf).mockReset();
    vi.mocked(generateNotebook).mockReset();

    // Default happy path mocks
    vi.mocked(extractArxivId).mockReturnValue('2301.00001');
    vi.mocked(fetchArxivPdf).mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf content'));
    vi.mocked(generateNotebook).mockResolvedValue(VALID_SPEC);
  });

  it('returns 200 SSE stream with done event for valid arXiv URL + API key', async () => {
    const req = makeJsonRequest({ arxivUrl: VALID_ARXIV_URL, apiKey: VALID_KEY });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseStream(res);
    const types = events.map((e: unknown) => (e as { type: string }).type);
    expect(types).toContain('done');
  });

  it('returns 400 JSON when arXiv input is invalid (before SSE)', async () => {
    vi.mocked(extractArxivId).mockImplementation(() => {
      throw new ArxivValidationError('"not-an-id" is not a valid arXiv ID or URL');
    });

    const req = makeJsonRequest({ arxivUrl: 'not-an-id', apiKey: VALID_KEY });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('sends SSE error event when fetchArxivPdf throws network error', async () => {
    vi.mocked(fetchArxivPdf).mockRejectedValue(new Error('Network error'));

    const req = makeJsonRequest({ arxivUrl: VALID_ARXIV_URL, apiKey: VALID_KEY });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const events = await readSseStream(res);
    const errorEvent = events.find((e: unknown) => (e as { type: string }).type === 'error');
    expect(errorEvent).toBeTruthy();
  });

  it('sends SSE error event when generateNotebook throws quota error', async () => {
    vi.mocked(generateNotebook).mockRejectedValue(new Error('quota exceeded'));

    const req = makeJsonRequest({ arxivUrl: VALID_ARXIV_URL, apiKey: VALID_KEY });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const events = await readSseStream(res);
    const errorEvent = events.find((e: unknown) => (e as { type: string }).type === 'error');
    expect(errorEvent).toBeTruthy();
    const errorMsg = (errorEvent as { message: string }).message;
    expect(errorMsg.toLowerCase()).toContain('quota');
  });
});

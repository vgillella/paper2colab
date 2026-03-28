// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Mock the openai-client module before importing the route
vi.mock('@/lib/openai-client', () => ({
  generateNotebook: vi.fn(),
  classifyOpenAiError: vi.fn((err: unknown) => (err as Error).message),
}));

// Mock gist-uploader (non-fatal, always null in tests)
vi.mock('@/lib/gist-uploader', () => ({
  uploadToGist: vi.fn().mockResolvedValue(null),
}));

import { POST } from '@/app/api/generate/route';
import { generateNotebook } from '@/lib/openai-client';

const VALID_KEY = 'sk-abcdefghij1234567890';
const VALID_SPEC = {
  title: 'Test Notebook',
  summary: 'Test summary',
  cells: [{ type: 'code' as const, source: 'print("hello")', section: 'Introduction' }],
};

const minimalPdfPath = path.resolve(__dirname, '../fixtures/minimal.pdf');

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(fields: Record<string, string | File | Blob>): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request('http://localhost/api/generate', { method: 'POST', body: form });
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

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.mocked(generateNotebook).mockReset();
    vi.mocked(generateNotebook).mockResolvedValue(VALID_SPEC);
  });

  it('returns 200 SSE stream with done event for valid PDF + API key', async () => {
    const pdfBytes = fs.readFileSync(minimalPdfPath);
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'test.pdf', { type: 'application/pdf' });

    const req = makeRequest({ apiKey: VALID_KEY, pdf: pdfFile });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSseStream(res);
    const types = events.map((e: unknown) => (e as { type: string }).type);
    expect(types).toContain('done');
  });

  it('returns 400 JSON when apiKey is missing', async () => {
    const pdfBytes = fs.readFileSync(minimalPdfPath);
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'test.pdf', { type: 'application/pdf' });

    const req = makeRequest({ pdf: pdfFile });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 413 JSON when PDF exceeds 20 MB', async () => {
    // Create a 21 MB buffer
    const largeBuffer = Buffer.alloc(21 * 1024 * 1024, 0);
    const pdfBlob = new Blob([largeBuffer], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'large.pdf', { type: 'application/pdf' });

    const req = makeRequest({ apiKey: VALID_KEY, pdf: pdfFile });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(413);
  });

  it('sends SSE error event when generateNotebook throws 401-like error', async () => {
    vi.mocked(generateNotebook).mockRejectedValue(new Error('401 Unauthorized'));

    const pdfBytes = fs.readFileSync(minimalPdfPath);
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'test.pdf', { type: 'application/pdf' });

    const req = makeRequest({ apiKey: VALID_KEY, pdf: pdfFile });
    const res = await POST(req as unknown as import('next/server').NextRequest);

    expect(res.status).toBe(200);
    const events = await readSseStream(res);
    const errorEvent = events.find((e: unknown) => (e as { type: string }).type === 'error');
    expect(errorEvent).toBeTruthy();
  });
});

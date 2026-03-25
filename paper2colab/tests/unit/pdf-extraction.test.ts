import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-parse before importing the route
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: 'This is extracted text from the PDF. It contains algorithm descriptions and methodology.',
    numpages: 12,
    info: { Title: 'Attention Is All You Need' },
  }),
}));

// Mock next/server (only what we need)
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return actual;
});

// We test the helper functions extracted from the route
import { extractTextFromPdf, validateGenerateRequest } from '@/lib/pdf-utils';

describe('PDF extraction utilities', () => {
  it('extractTextFromPdf returns text from a PDF buffer', async () => {
    const fakeBuffer = Buffer.from('%PDF-1.4 fake');
    const result = await extractTextFromPdf(fakeBuffer);
    expect(result).toBe(
      'This is extracted text from the PDF. It contains algorithm descriptions and methodology.'
    );
  });

  it('extractTextFromPdf throws on empty buffer', async () => {
    const pdf = await import('pdf-parse');
    (pdf.default as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Invalid PDF')
    );
    const emptyBuffer = Buffer.from('');
    await expect(extractTextFromPdf(emptyBuffer)).rejects.toThrow('Invalid PDF');
  });

  it('validateGenerateRequest returns errors for missing fields', () => {
    expect(validateGenerateRequest('', null)).toContain('apiKey');
    expect(validateGenerateRequest('sk-test', null)).toContain('pdf');
    expect(validateGenerateRequest('', Buffer.from('x'))).toContain('apiKey');
  });

  it('validateGenerateRequest returns empty array when all fields present', () => {
    const errors = validateGenerateRequest('sk-test-key', Buffer.from('%PDF'));
    expect(errors).toHaveLength(0);
  });
});

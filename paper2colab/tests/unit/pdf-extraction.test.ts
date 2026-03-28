import { describe, it, expect, vi } from 'vitest';
// extractTextFromPdf now accepts an optional _PDFParse DI parameter for testing.
import { validateGenerateRequest, extractTextFromPdf, stripReferences, MAX_PDF_CHARS } from '@/lib/pdf-utils';

const VALID_KEY = 'sk-abcdefghij1234567890'; // 20 chars after sk-

// ── Helpers ───────────────────────────────────────────────────────────────

type PDFParseConstructor = new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text: string }> };

function makeMockPDFParse(text: string): PDFParseConstructor {
  const getTextFn = vi.fn().mockResolvedValue({ text });
  // Use a real class to ensure `new MockPDF(...)` works correctly
  class MockPDFParseClass {
    getText = getTextFn;
  }
  return MockPDFParseClass as unknown as PDFParseConstructor;
}

function makeMockPDFParseThrows(errorMsg: string): PDFParseConstructor {
  class MockPDFParseThrows {
    constructor() {
      throw new Error(errorMsg);
    }
    getText = vi.fn();
  }
  return MockPDFParseThrows as unknown as PDFParseConstructor;
}

// ── validateGenerateRequest() ─────────────────────────────────────────────

describe('validateGenerateRequest()', () => {
  it('returns apiKey MISSING error when apiKey is empty string', () => {
    const errors = validateGenerateRequest('', null);
    expect(errors.map((e) => e.field)).toContain('apiKey');
    expect(errors.find((e) => e.field === 'apiKey')?.code).toBe('MISSING');
  });

  it('returns pdf MISSING error when pdf buffer is null but apiKey is valid', () => {
    const errors = validateGenerateRequest(VALID_KEY, null);
    expect(errors.map((e) => e.field)).toContain('pdf');
    expect(errors.find((e) => e.field === 'pdf')?.code).toBe('MISSING');
  });

  it('returns both errors when both fields are missing', () => {
    const errors = validateGenerateRequest('', null);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('apiKey');
    expect(fields).toContain('pdf');
  });

  it('returns apiKey MISSING error when apiKey is whitespace only', () => {
    const errors = validateGenerateRequest('   ', Buffer.from('%PDF'));
    expect(errors.map((e) => e.field)).toContain('apiKey');
    expect(errors.find((e) => e.field === 'apiKey')?.code).toBe('MISSING');
  });

  it('returns [] when both fields are valid', () => {
    expect(validateGenerateRequest(VALID_KEY, Buffer.from('%PDF'))).toHaveLength(0);
  });
});

// ── extractTextFromPdf() tests (DI approach) ─────────────────────────────

describe('extractTextFromPdf()', () => {
  it('throws with "scanned" or "image-only" message when text is too short (< 100 chars)', async () => {
    const MockPDF = makeMockPDFParse('Too short');

    await expect(extractTextFromPdf(Buffer.from('%PDF'), MockPDF)).rejects.toThrow(
      /scanned|image.only/i
    );
  });

  it('throws when text is whitespace-only', async () => {
    const MockPDF = makeMockPDFParse('   \n\n\t  ');

    await expect(extractTextFromPdf(Buffer.from('%PDF'), MockPDF)).rejects.toThrow(
      /scanned|image.only/i
    );
  });

  it('strips text after \\nReferences\\n', async () => {
    const longText = 'A'.repeat(200) + '\nReferences\nSome citation here that should not appear';
    const MockPDF = makeMockPDFParse(longText);

    const result = await extractTextFromPdf(Buffer.from('%PDF'), MockPDF);
    expect(result).not.toContain('Some citation');
    expect(result).not.toContain('References');
  });

  it('truncates and appends [Paper truncated] when text exceeds MAX_PDF_CHARS', async () => {
    const longText = 'B'.repeat(MAX_PDF_CHARS + 10_000);
    const MockPDF = makeMockPDFParse(longText);

    const result = await extractTextFromPdf(Buffer.from('%PDF'), MockPDF);
    expect(result.endsWith('[Paper truncated]')).toBe(true);
    expect(result.length).toBe(MAX_PDF_CHARS + '\n[Paper truncated]'.length);
  });

  it('propagates error when PDFParse constructor throws', async () => {
    const MockPDF = makeMockPDFParseThrows('Corrupt PDF');

    await expect(extractTextFromPdf(Buffer.from('not a pdf'), MockPDF)).rejects.toThrow('Corrupt PDF');
  });
});

// ── stripReferences() unit tests ─────────────────────────────────────────

describe('stripReferences()', () => {
  it('strips everything after \\nReferences\\n', () => {
    const text = 'Main content\nReferences\n[1] Author et al.';
    expect(stripReferences(text)).toBe('Main content');
  });

  it('strips everything after \\nREFERENCES\\n', () => {
    const text = 'Main content\nREFERENCES\n[1] Author et al.';
    expect(stripReferences(text)).toBe('Main content');
  });

  it('returns text unchanged if no References section found', () => {
    const text = 'Main content without references section';
    expect(stripReferences(text)).toBe(text);
  });
});

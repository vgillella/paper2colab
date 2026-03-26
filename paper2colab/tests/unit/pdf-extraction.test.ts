import { describe, it, expect } from 'vitest';
// Note: extractTextFromPdf uses require('pdf-parse') which loads pdfjs-dist
// with DOM APIs unavailable in jsdom. It is tested via Playwright integration tests.
// Here we test only the pure validateGenerateRequest function.
import { validateGenerateRequest } from '@/lib/pdf-utils';

const VALID_KEY = 'sk-abcdefghij1234567890'; // 20 chars after sk-

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

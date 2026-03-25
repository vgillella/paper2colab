import { describe, it, expect } from 'vitest';
// Note: extractTextFromPdf uses require('pdf-parse') which loads pdfjs-dist
// with DOM APIs unavailable in jsdom. It is tested via Playwright integration tests.
// Here we test only the pure validateGenerateRequest function.
import { validateGenerateRequest } from '@/lib/pdf-utils';

describe('validateGenerateRequest()', () => {
  it('returns ["apiKey"] when apiKey is empty string', () => {
    expect(validateGenerateRequest('', null)).toContain('apiKey');
  });

  it('returns ["pdf"] when pdf buffer is null but apiKey is present', () => {
    expect(validateGenerateRequest('sk-test', null)).toContain('pdf');
  });

  it('returns both errors when both fields are missing', () => {
    const errors = validateGenerateRequest('', null);
    expect(errors).toContain('apiKey');
    expect(errors).toContain('pdf');
  });

  it('returns ["apiKey"] when apiKey is whitespace only', () => {
    expect(validateGenerateRequest('   ', Buffer.from('%PDF'))).toContain('apiKey');
  });

  it('returns [] when both fields are valid', () => {
    expect(validateGenerateRequest('sk-test-key', Buffer.from('%PDF'))).toHaveLength(0);
  });
});

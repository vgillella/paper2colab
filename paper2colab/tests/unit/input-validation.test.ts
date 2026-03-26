import { describe, it, expect } from 'vitest';
import { validateGenerateRequest, PDF_MAX_BYTES } from '@/lib/pdf-utils';

// ── PDF size limit ────────────────────────────────────────────────────────────

describe('PDF file size validation', () => {
  it('accepts a PDF under 20 MB', () => {
    const buf = Buffer.alloc(1); // 1 byte
    const errors = validateGenerateRequest('sk-abcdefghij1234567890', buf);
    expect(errors).not.toContainEqual(
      expect.objectContaining({ field: 'pdf', code: 'TOO_LARGE' })
    );
  });

  it('accepts a PDF exactly at the 20 MB limit', () => {
    const buf = Buffer.alloc(PDF_MAX_BYTES);
    const errors = validateGenerateRequest('sk-abcdefghij1234567890', buf);
    expect(errors).not.toContainEqual(
      expect.objectContaining({ field: 'pdf', code: 'TOO_LARGE' })
    );
  });

  it('rejects a PDF over 20 MB with TOO_LARGE', () => {
    const buf = Buffer.alloc(PDF_MAX_BYTES + 1);
    const errors = validateGenerateRequest('sk-abcdefghij1234567890', buf);
    expect(errors).toContainEqual(
      expect.objectContaining({ field: 'pdf', code: 'TOO_LARGE' })
    );
  });
});

// ── API key format validation ─────────────────────────────────────────────────

describe('API key format validation', () => {
  const validKeys = [
    'sk-abcdefghij1234567890',          // minimal 20 chars after sk-
    'sk-proj-abc123_DEF-xyz1234567890', // project key with dashes/underscores
    'sk-' + 'a'.repeat(200),            // max length (200 chars after sk-)
  ];

  for (const key of validKeys) {
    it(`accepts valid key: ${key.slice(0, 20)}...`, () => {
      const buf = Buffer.alloc(1);
      const errors = validateGenerateRequest(key, buf);
      expect(errors).not.toContainEqual(
        expect.objectContaining({ field: 'apiKey', code: 'INVALID_FORMAT' })
      );
    });
  }

  const invalidKeys = [
    'not-starting-with-sk',          // wrong prefix
    'sk-tooshort',                   // fewer than 20 chars after sk-
    'sk-' + 'a'.repeat(201),         // too long (201 chars after sk-)
    'sk-contains spaces here!!!',    // invalid characters
    'sk-has$pecial#chars',           // special chars not in [A-Za-z0-9\-_]
  ];

  for (const key of invalidKeys) {
    it(`rejects invalid key: "${key.slice(0, 30)}..."`, () => {
      const buf = Buffer.alloc(1);
      const errors = validateGenerateRequest(key, buf);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'apiKey', code: 'INVALID_FORMAT' })
      );
    });
  }
});

// ── Combined validation ────────────────────────────────────────────────────────

describe('combined validation', () => {
  it('returns both errors when both fields are invalid', () => {
    const errors = validateGenerateRequest('bad-key', null);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('apiKey');
    expect(fields).toContain('pdf');
  });

  it('returns no errors for valid inputs', () => {
    const buf = Buffer.alloc(1024);
    const errors = validateGenerateRequest('sk-abcdefghij1234567890', buf);
    expect(errors).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { extractArxivId, ArxivValidationError } from '@/lib/arxiv-fetcher';

describe('extractArxivId()', () => {
  it('handles bare new-style IDs', () => {
    expect(extractArxivId('2301.00001')).toBe('2301.00001');
  });

  it('strips version suffix from bare IDs', () => {
    expect(extractArxivId('1706.03762v7')).toBe('1706.03762');
  });

  it('handles abs URL', () => {
    expect(extractArxivId('https://arxiv.org/abs/2301.00001')).toBe('2301.00001');
  });

  it('handles pdf URL with version suffix', () => {
    expect(extractArxivId('https://arxiv.org/pdf/1706.03762v7')).toBe('1706.03762');
  });

  it('handles old-style IDs', () => {
    expect(extractArxivId('hep-th/9901001')).toBe('hep-th/9901001');
  });

  it('throws ArxivValidationError for invalid input', () => {
    expect(() => extractArxivId('not-an-arxiv')).toThrow(ArxivValidationError);
  });

  it('strips query params from URLs', () => {
    expect(extractArxivId('https://arxiv.org/abs/2301.00001?utm_source=test')).toBe('2301.00001');
  });

  it('throws ArxivValidationError for empty string', () => {
    expect(() => extractArxivId('')).toThrow(ArxivValidationError);
  });
});

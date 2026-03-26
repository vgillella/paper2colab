import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyOpenAiError } from '@/lib/openai-client';

// ── classifyOpenAiError() ─────────────────────────────────────────────────────

describe('classifyOpenAiError()', () => {
  it('returns 401 message for Unauthorized errors', () => {
    expect(classifyOpenAiError(new Error('401 Unauthorized'))).toBe(
      'Invalid OpenAI API key. Please check your key and try again.'
    );
  });

  it('returns 401 message when message contains "Unauthorized"', () => {
    expect(classifyOpenAiError(new Error('Request failed: Unauthorized'))).toBe(
      'Invalid OpenAI API key. Please check your key and try again.'
    );
  });

  it('returns rate limit message for 429 errors', () => {
    expect(classifyOpenAiError(new Error('429 Too Many Requests'))).toBe(
      'OpenAI rate limit reached. Please wait a moment and try again.'
    );
  });

  it('returns rate limit message when message contains "rate limit"', () => {
    expect(classifyOpenAiError(new Error('You exceeded your rate limit'))).toBe(
      'OpenAI rate limit reached. Please wait a moment and try again.'
    );
  });

  it('returns quota message for quota errors', () => {
    expect(classifyOpenAiError(new Error('You exceeded your current quota'))).toBe(
      'OpenAI quota exceeded. Please check your usage limits.'
    );
  });

  it('returns quota message for billing errors', () => {
    expect(classifyOpenAiError(new Error('billing hard limit reached'))).toBe(
      'OpenAI quota exceeded. Please check your usage limits.'
    );
  });

  it('returns GENERIC message for unclassified errors (does not leak raw message)', () => {
    const result = classifyOpenAiError(new Error('some internal SDK error with secrets'));
    expect(result).toBe('An unexpected error occurred. Please try again.');
    expect(result).not.toContain('secrets');
    expect(result).not.toContain('internal SDK error');
  });

  it('returns GENERIC message for non-Error objects', () => {
    expect(classifyOpenAiError('string error')).toBe(
      'An unexpected error occurred. Please try again.'
    );
  });

  it('returns GENERIC message for network errors', () => {
    expect(classifyOpenAiError(new Error('ECONNREFUSED ::1:443'))).toBe(
      'An unexpected error occurred. Please try again.'
    );
  });
});

// ── console.error is called for unclassified errors ───────────────────────────

describe('classifyOpenAiError() logs raw errors server-side', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls console.error with the raw error for unclassified errors', () => {
    const err = new Error('raw internal error');
    classifyOpenAiError(err);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[generate]'),
      err
    );
  });

  it('does NOT call console.error for classified errors (already handled upstream)', () => {
    classifyOpenAiError(new Error('401 Unauthorized'));
    expect(console.error).not.toHaveBeenCalled();
  });
});

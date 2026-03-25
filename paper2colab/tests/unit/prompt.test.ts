import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage, parseNotebookResponse, NotebookCell } from '@/lib/prompt';

describe('lib/prompt', () => {
  describe('buildSystemPrompt()', () => {
    it('returns a non-empty string', () => {
      const prompt = buildSystemPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(200);
    });

    it('instructs the model to return JSON', () => {
      const prompt = buildSystemPrompt();
      expect(prompt.toLowerCase()).toMatch(/json/);
    });

    it('requires title, summary, and cells fields', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toMatch(/title/);
      expect(prompt).toMatch(/summary/);
      expect(prompt).toMatch(/cells/);
    });

    it('requires realistic synthetic data (not toy examples)', () => {
      const prompt = buildSystemPrompt();
      expect(prompt.toLowerCase()).toMatch(/synthetic|realistic/);
      expect(prompt.toLowerCase()).toMatch(/toy|trivial/);
    });

    it('requires matplotlib visualization', () => {
      const prompt = buildSystemPrompt();
      expect(prompt.toLowerCase()).toMatch(/matplotlib/);
    });

    it('requires Python implementation', () => {
      const prompt = buildSystemPrompt();
      expect(prompt.toLowerCase()).toMatch(/python/);
    });
  });

  describe('buildUserMessage()', () => {
    it('embeds the paper text in the message', () => {
      const text = 'This paper proposes a novel attention mechanism called Transformer.';
      const msg = buildUserMessage(text);
      expect(msg).toContain(text);
    });

    it('trims text to max 80000 chars to avoid token limits', () => {
      const longText = 'a'.repeat(120_000);
      const msg = buildUserMessage(longText);
      expect(msg.length).toBeLessThanOrEqual(80_200); // some overhead for wrapper text
    });
  });

  describe('parseNotebookResponse()', () => {
    it('parses valid JSON with title, summary, cells', () => {
      const validResponse = JSON.stringify({
        title: 'Attention Is All You Need — Tutorial',
        summary: 'This paper introduces the Transformer architecture...',
        cells: [
          { type: 'markdown', source: '# Introduction\n\nThe Transformer...', section: 'Introduction' },
          { type: 'code', source: 'import numpy as np\nimport torch', section: 'Setup' },
        ],
      });
      const result = parseNotebookResponse(validResponse);
      expect(result.title).toBe('Attention Is All You Need — Tutorial');
      expect(result.cells).toHaveLength(2);
      expect(result.cells[0].type).toBe('markdown');
      expect(result.cells[1].type).toBe('code');
    });

    it('extracts JSON from markdown code block if model wraps it', () => {
      const wrapped = '```json\n{"title":"T","summary":"S","cells":[]}\n```';
      const result = parseNotebookResponse(wrapped);
      expect(result.title).toBe('T');
    });

    it('throws on invalid JSON', () => {
      expect(() => parseNotebookResponse('not json at all')).toThrow();
    });

    it('throws if cells is not an array', () => {
      const bad = JSON.stringify({ title: 'T', summary: 'S', cells: 'not-array' });
      expect(() => parseNotebookResponse(bad)).toThrow();
    });

    it('handles cells with missing section gracefully', () => {
      const noSection = JSON.stringify({
        title: 'T',
        summary: 'S',
        cells: [{ type: 'code', source: 'print("hi")' }],
      });
      const result = parseNotebookResponse(noSection);
      expect(result.cells[0].section).toBe('');
    });
  });
});

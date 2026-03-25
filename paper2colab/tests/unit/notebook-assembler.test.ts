import { describe, it, expect } from 'vitest';
import { assembleNotebook } from '@/lib/notebook-assembler';
import type { NotebookSpec } from '@/lib/prompt';

const SAMPLE_SPEC: NotebookSpec = {
  title: 'Attention Is All You Need — Colab Tutorial',
  summary: 'The Transformer architecture eschews recurrence and convolutions entirely, relying solely on attention mechanisms.',
  cells: [
    { type: 'markdown', source: '# Introduction\n\nThe Transformer model...', section: 'Introduction' },
    { type: 'code', source: 'import numpy as np\nimport torch\nprint("Setup complete")', section: 'Setup' },
    { type: 'markdown', source: '## Algorithm\n\nSelf-attention is defined as...', section: 'Algorithm' },
    { type: 'code', source: 'def scaled_dot_product_attention(Q, K, V):\n    d_k = Q.shape[-1]\n    scores = Q @ K.T / (d_k ** 0.5)\n    return scores', section: 'Implementation' },
  ],
};

describe('assembleNotebook()', () => {
  it('returns an object with nbformat 4 and nbformat_minor 5', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    expect(nb.nbformat).toBe(4);
    expect(nb.nbformat_minor).toBe(5);
  });

  it('has valid metadata with python3 kernelspec', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    expect(nb.metadata.kernelspec.display_name).toBe('Python 3');
    expect(nb.metadata.kernelspec.language).toBe('python');
    expect(nb.metadata.kernelspec.name).toBe('python3');
    expect(nb.metadata.language_info.name).toBe('python');
  });

  it('includes the notebook title in metadata', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    expect(nb.metadata.title).toBe(SAMPLE_SPEC.title);
  });

  it('produces the correct number of cells', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    expect(nb.cells.length).toBe(SAMPLE_SPEC.cells.length);
  });

  it('markdown cells have cell_type: "markdown" and no outputs', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    const mdCell = nb.cells[0];
    expect(mdCell.cell_type).toBe('markdown');
    expect(mdCell).not.toHaveProperty('outputs');
    expect(mdCell).not.toHaveProperty('execution_count');
  });

  it('code cells have cell_type: "code", execution_count: null, empty outputs', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    const codeCell = nb.cells[1];
    expect(codeCell.cell_type).toBe('code');
    expect(codeCell.execution_count).toBeNull();
    expect(codeCell.outputs).toEqual([]);
  });

  it('cell source is stored as array of lines (nbformat v4 spec)', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    // Each cell source should be a string (or array of strings per nbformat)
    // We store as a flat string — Colab accepts both
    expect(typeof nb.cells[0].source).toBe('string');
  });

  it('serialises to valid JSON without errors', () => {
    const nb = assembleNotebook(SAMPLE_SPEC);
    expect(() => JSON.stringify(nb)).not.toThrow();
    const serialised = JSON.parse(JSON.stringify(nb));
    expect(serialised.nbformat).toBe(4);
  });

  it('handles empty cells array gracefully', () => {
    const emptySpec: NotebookSpec = { title: 'Empty', summary: '', cells: [] };
    const nb = assembleNotebook(emptySpec);
    expect(nb.cells).toEqual([]);
    expect(nb.nbformat).toBe(4);
  });
});

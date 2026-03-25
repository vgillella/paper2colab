import type { NotebookSpec, NotebookCell } from './prompt';

// nbformat v4 type definitions
interface KernelSpec {
  display_name: string;
  language: string;
  name: string;
}

interface LanguageInfo {
  codemirror_mode: { name: string; version: number };
  file_extension: string;
  mimetype: string;
  name: string;
  pygments_lexer: string;
  version: string;
}

interface NotebookMetadata {
  kernelspec: KernelSpec;
  language_info: LanguageInfo;
  title: string;
  colab?: { provenance: unknown[] };
}

interface MarkdownCell {
  cell_type: 'markdown';
  id: string;
  metadata: Record<string, unknown>;
  source: string;
}

interface CodeCell {
  cell_type: 'code';
  id: string;
  execution_count: null;
  metadata: Record<string, unknown>;
  outputs: unknown[];
  source: string;
}

type JupyterCell = MarkdownCell | CodeCell;

export interface JupyterNotebook {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: NotebookMetadata;
  cells: JupyterCell[];
}

let cellIdCounter = 0;
function newCellId(): string {
  cellIdCounter++;
  return `cell-${String(cellIdCounter).padStart(4, '0')}`;
}

function buildCell(cell: NotebookCell, index: number): JupyterCell {
  const id = newCellId();
  const metadata: Record<string, unknown> = cell.section ? { section: cell.section } : {};

  if (cell.type === 'markdown') {
    return {
      cell_type: 'markdown',
      id,
      metadata,
      source: cell.source,
    };
  }

  return {
    cell_type: 'code',
    id,
    execution_count: null,
    metadata: { ...metadata, trusted: true },
    outputs: [],
    source: cell.source,
  };
}

/**
 * Assemble a NotebookSpec into a valid Jupyter Notebook (nbformat v4).
 * The result is JSON-serialisable and opens correctly in Google Colab.
 */
export function assembleNotebook(spec: NotebookSpec): JupyterNotebook {
  // Reset counter for deterministic output in tests
  cellIdCounter = 0;

  const cells = spec.cells.map((cell, i) => buildCell(cell, i));

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        codemirror_mode: { name: 'ipython', version: 3 },
        file_extension: '.py',
        mimetype: 'text/x-python',
        name: 'python',
        pygments_lexer: 'ipython3',
        version: '3.10.0',
      },
      title: spec.title,
      colab: { provenance: [] },
    },
    cells,
  };
}

/**
 * Serialise a JupyterNotebook to a pretty-printed JSON string.
 */
export function notebookToJson(notebook: JupyterNotebook): string {
  return JSON.stringify(notebook, null, 2);
}

/**
 * Generate a safe filename from the notebook title.
 */
export function notebookFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'notebook'
  ) + '.ipynb';
}

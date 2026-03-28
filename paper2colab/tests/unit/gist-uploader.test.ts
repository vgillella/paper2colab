import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadToGist } from '@/lib/gist-uploader';
import { notebookFilename } from '@/lib/notebook-assembler';

const FAKE_NOTEBOOK = '{"nbformat":4,"cells":[]}';
const FAKE_FILENAME = 'test_notebook.ipynb';

describe('uploadToGist()', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns GistResult with correct URLs on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'abc123def456',
        html_url: 'https://gist.github.com/abc123def456',
      }),
    }));

    const result = await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);
    expect(result).not.toBeNull();
    expect(result!.gistId).toBe('abc123def456');
    expect(result!.gistUrl).toBe('https://gist.github.com/abc123def456');
    expect(result!.colabUrl).toContain('colab.research.google.com/gist/abc123def456');
    expect(result!.colabUrl).toContain('test_notebook.ipynb');
  });

  it('returns null when GitHub API returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }));

    const result = await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')));

    const result = await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);
    expect(result).toBeNull();
  });

  it('sends correct request to GitHub Gists API', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'xyz', html_url: 'https://gist.github.com/xyz' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/gists',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.public).toBe(false);
    expect(body.files).toHaveProperty(FAKE_FILENAME);
    expect(body.files[FAKE_FILENAME].content).toBe(FAKE_NOTEBOOK);
  });

  it('returns null when GitHub API returns 422 Unprocessable Entity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
    }));

    const result = await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);
    expect(result).toBeNull();
  });

  it('returns null on network timeout (fetch rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('The operation timed out')));

    const result = await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);
    expect(result).toBeNull();
  });

  it('returns null when GitHub API returns 500 Internal Server Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    const result = await uploadToGist(FAKE_NOTEBOOK, FAKE_FILENAME);
    expect(result).toBeNull();
  });
});

// ── notebookFilename() safety tests ─────────────────────────────────────────

describe('notebookFilename()', () => {
  it('sanitizes title with path traversal characters', () => {
    const filename = notebookFilename('../../../etc/passwd');
    expect(filename).not.toContain('..');
    expect(filename).not.toContain('/');
    expect(filename.endsWith('.ipynb')).toBe(true);
  });

  it('produces a safe filename for normal titles', () => {
    const filename = notebookFilename('Attention Is All You Need');
    expect(filename).toBe('attention_is_all_you_need.ipynb');
  });
});

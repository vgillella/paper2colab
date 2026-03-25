import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadToGist } from '@/lib/gist-uploader';

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
    expect(body.public).toBe(true);
    expect(body.files).toHaveProperty(FAKE_FILENAME);
    expect(body.files[FAKE_FILENAME].content).toBe(FAKE_NOTEBOOK);
  });
});

import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOTS = path.resolve(__dirname, '../screenshots');
const FAKE_KEY = 'sk-testkey1234567890abcdef';
const FAKE_ARXIV_URL = 'https://arxiv.org/abs/2301.00001';

const MOCK_NOTEBOOK = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.10.0', codemirror_mode: { name: 'ipython', version: 3 }, file_extension: '.py', mimetype: 'text/x-python', pygments_lexer: 'ipython3' },
    title: 'ArXiv Test Notebook',
  },
  cells: [
    { cell_type: 'code', id: 'c1', execution_count: null, outputs: [], metadata: {}, source: 'print("arxiv test")' },
  ],
});

test.describe('arXiv URL flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock POST /api/generate-arxiv at browser level
    await page.route('**/api/generate-arxiv', async (route) => {
      const sseBody = [
        'data: {"type":"progress","message":"Fetching PDF from arXiv..."}\n\n',
        'data: {"type":"progress","message":"Extracting PDF text..."}\n\n',
        'data: {"type":"progress","message":"Generating notebook..."}\n\n',
        `data: ${JSON.stringify({ type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'arxiv_test.ipynb', colabUrl: null, title: 'ArXiv Test Notebook' })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody,
      });
    });
  });

  test('arXiv tab is selectable and shows URL input', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-01-initial.png') });

    // Switch to arXiv mode
    await page.getByTestId('mode-arxiv').click();
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-02-tab-selected.png') });

    // ArXiv URL input should be visible
    await expect(page.getByTestId('arxiv-url-input')).toBeVisible();
    // PDF upload zone should be hidden
    await expect(page.getByTestId('pdf-upload-zone')).not.toBeVisible();
  });

  test('full arXiv URL flow: switch tab, enter URL, generate, download', async ({ page }) => {
    await page.goto('/');

    // Switch to arXiv mode
    await page.getByTestId('mode-arxiv').click();
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-03-arxiv-mode.png') });

    // Enter API key
    await page.getByTestId('api-key-input').fill(FAKE_KEY);

    // Enter arXiv URL
    await page.getByTestId('arxiv-url-input').fill(FAKE_ARXIV_URL);
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-04-url-entered.png') });

    // Submit button should be enabled
    await expect(page.getByTestId('submit-button')).not.toBeDisabled();

    // Submit
    await page.getByTestId('submit-button').click();

    // Wait for progress feed
    await page.waitForSelector('[data-testid="progress-feed-wrapper"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-05-processing.png') });

    // Wait for download button (result actions)
    await page.waitForSelector('[data-testid="download-button"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-06-after-generate.png') });

    // Click download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-button').click(),
    ]);
    expect(download.suggestedFilename()).toContain('.ipynb');

    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-07-download-complete.png') });
  });

  test('submit is disabled without API key in arXiv mode', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mode-arxiv').click();
    await page.getByTestId('arxiv-url-input').fill(FAKE_ARXIV_URL);

    // No API key — submit should be disabled
    await expect(page.getByTestId('submit-button')).toBeDisabled();
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-arxiv-08-no-key-disabled.png') });
  });
});

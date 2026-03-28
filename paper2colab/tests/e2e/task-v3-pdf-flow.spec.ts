import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS = path.resolve(__dirname, '../screenshots');
const FAKE_KEY = 'sk-testkey1234567890abcdef';

const MOCK_NOTEBOOK = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.10.0', codemirror_mode: { name: 'ipython', version: 3 }, file_extension: '.py', mimetype: 'text/x-python', pygments_lexer: 'ipython3' },
    title: 'Test Notebook',
  },
  cells: [
    { cell_type: 'code', id: 'c1', execution_count: null, outputs: [], metadata: {}, source: 'print(1)' },
  ],
});

test.describe('PDF upload flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock POST /api/generate at browser level
    await page.route('**/api/generate', async (route) => {
      const sseBody = [
        'data: {"type":"progress","message":"Extracting PDF text..."}\n\n',
        'data: {"type":"progress","message":"Generating notebook..."}\n\n',
        'data: {"type":"token","delta":"{\\"title\\""}\n\n',
        `data: ${JSON.stringify({ type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'test.ipynb', colabUrl: null, title: 'Test Notebook' })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody,
      });
    });
  });

  test('page loads correctly', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-pdf-01-page-load.png') });
    await expect(page.getByTestId('app-title')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
  });

  test('full PDF upload flow: enter key, upload PDF, generate, download', async ({ page }) => {
    await page.goto('/');

    // Enter API key
    await page.getByTestId('api-key-input').fill(FAKE_KEY);

    // Upload PDF fixture using the hidden file input
    const pdfPath = path.resolve(__dirname, '../fixtures/minimal.pdf');
    await page.getByTestId('pdf-file-input').setInputFiles(pdfPath);

    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-pdf-02-after-upload.png') });

    // Submit
    await page.getByTestId('submit-button').click();

    // Wait for progress feed
    await page.waitForSelector('[data-testid="progress-feed-wrapper"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-pdf-03-processing.png') });

    // Wait for download button (result actions)
    await page.waitForSelector('[data-testid="download-button"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-pdf-04-done.png') });

    // Click download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-button').click(),
    ]);
    expect(download.suggestedFilename()).toContain('.ipynb');

    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-pdf-05-downloaded.png') });
  });

  test('mode switcher shows PDF tab by default', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: path.join(SCREENSHOTS, 'v3-pdf-06-mode-switcher.png') });
    // Both mode tabs should be visible
    await expect(page.getByTestId('mode-pdf')).toBeVisible();
    await expect(page.getByTestId('mode-arxiv')).toBeVisible();
    // PDF upload zone should be visible in default mode
    await expect(page.getByTestId('pdf-upload-zone')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SS = (n: string) => path.join('tests/screenshots/task7', n);

// Minimal valid notebook JSON for mock responses
const MOCK_NOTEBOOK = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.10.0', codemirror_mode: { name: 'ipython', version: 3 }, file_extension: '.py', mimetype: 'text/x-python', pygments_lexer: 'ipython3' },
    title: 'Test Notebook',
  },
  cells: [
    { cell_type: 'markdown', id: 'cell-0001', metadata: {}, source: '# Introduction\n\nTest notebook.' },
    { cell_type: 'code', id: 'cell-0002', execution_count: null, metadata: { trusted: true }, outputs: [], source: 'print("Hello World")' },
  ],
}, null, 2);

function buildSseStream(events: object[]): string {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

test.describe('Task 7/8/9 — SSE streaming, Gist, Download + Colab', () => {

  test('01 — form hides and progress feed appears after submission', async ({ page }) => {
    // Intercept /api/generate to return mock SSE
    await page.route('/api/generate', async route => {
      const sseBody = buildSseStream([
        { type: 'progress', message: 'Extracting PDF text...' },
        { type: 'progress', message: 'Analyzing paper structure...' },
        { type: 'progress', message: 'Generating notebook cells...' },
        { type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'test_notebook.ipynb', colabUrl: null, title: 'Test Notebook' },
      ]);
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: sseBody,
      });
    });

    await page.goto('/');
    await page.screenshot({ path: SS('01a-initial.png'), fullPage: true });

    // Fill form
    await page.getByTestId('api-key-input').fill('sk-test-key-12345678901234');
    const fakePdf = path.join('/tmp', 'mock-paper.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock paper content');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();

    // Progress feed should appear
    await expect(page.getByTestId('progress-feed-wrapper')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: SS('01b-progress-feed-visible.png'), fullPage: true });

    // Input form should be hidden
    await expect(page.getByTestId('submit-button')).not.toBeVisible();
  });

  test('02 — progress messages stream in and done state shows result actions', async ({ page }) => {
    await page.route('/api/generate', async route => {
      const sseBody = buildSseStream([
        { type: 'progress', message: 'Extracting PDF text...' },
        { type: 'progress', message: 'Calling OpenAI...' },
        { type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'test_notebook.ipynb', colabUrl: 'https://colab.research.google.com/gist/abc123/test_notebook.ipynb', title: 'Test Notebook' },
      ]);
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-test-12345678901234567890');
    const fakePdf = path.join('/tmp', 'mock-paper.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();

    // Wait for result actions to appear
    await expect(page.getByTestId('result-actions')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: SS('02-result-actions-visible.png'), fullPage: true });

    // Both download and colab buttons present
    await expect(page.getByTestId('download-button')).toBeVisible();
    await expect(page.getByTestId('colab-button')).toBeVisible();
  });

  test('03 — download button triggers file download', async ({ page }) => {
    await page.route('/api/generate', async route => {
      const sseBody = buildSseStream([
        { type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'attention_tutorial.ipynb', colabUrl: null, title: 'Attention Tutorial' },
      ]);
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-test-12345678901234567890');
    const fakePdf = path.join('/tmp', 'mock-paper.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('download-button')).toBeVisible({ timeout: 15000 });

    // Click download and check it triggered a download event
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('attention_tutorial.ipynb');
    await page.screenshot({ path: SS('03-download-triggered.png'), fullPage: true });
  });

  test('04 — colab button has correct href', async ({ page }) => {
    const fakeColabUrl = 'https://colab.research.google.com/gist/deadbeef123/test.ipynb';

    await page.route('/api/generate', async route => {
      const sseBody = buildSseStream([
        { type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'test.ipynb', colabUrl: fakeColabUrl, title: 'Test' },
      ]);
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-test-12345678901234567890');
    const fakePdf = path.join('/tmp', 'mock-paper.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('colab-button')).toBeVisible({ timeout: 15000 });

    const href = await page.getByTestId('colab-button').getAttribute('href');
    expect(href).toBe(fakeColabUrl);
    await page.screenshot({ path: SS('04-colab-button-href.png'), fullPage: true });
  });

  test('05 — error from server shows error display with retry button', async ({ page }) => {
    await page.route('/api/generate', async route => {
      const sseBody = buildSseStream([
        { type: 'progress', message: 'Extracting...' },
        { type: 'error', message: 'Invalid OpenAI API key. Please check your key and try again.' },
      ]);
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-bad-key');
    const fakePdf = path.join('/tmp', 'mock-paper.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();

    await expect(page.getByTestId('error-display')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('error-display')).toContainText('Invalid OpenAI API key');
    await page.screenshot({ path: SS('05-error-state.png'), fullPage: true });

    // Retry button resets form
    await page.getByTestId('retry-button').click();
    await expect(page.getByTestId('submit-button')).toBeVisible();
    await page.screenshot({ path: SS('05b-after-retry.png'), fullPage: true });
  });

  test('06 — "generate another" button resets to idle state', async ({ page }) => {
    await page.route('/api/generate', async route => {
      const sseBody = buildSseStream([
        { type: 'done', notebookJson: MOCK_NOTEBOOK, filename: 'nb.ipynb', colabUrl: null, title: 'NB' },
      ]);
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-test-12345678901234567890');
    const fakePdf = path.join('/tmp', 'mock-paper.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();

    await expect(page.getByTestId('generate-another-button')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('generate-another-button').click();

    // Back to idle
    await expect(page.getByTestId('submit-button')).toBeVisible();
    await page.screenshot({ path: SS('06-reset-to-idle.png'), fullPage: true });
  });
});

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotsDir = path.join(__dirname, '../screenshots');

// Build a synthetic SSE response body with progress + token events + done
function buildSseBody(tokenDeltas: string[]): string {
  const totalChars = tokenDeltas.join('').length;
  const events: string[] = [
    `data: ${JSON.stringify({ type: 'progress', message: 'Extracting PDF text...' })}\n\n`,
    `data: ${JSON.stringify({ type: 'progress', message: 'Generating notebook with AI model (streaming tokens)...' })}\n\n`,
    ...tokenDeltas.map((d) => `data: ${JSON.stringify({ type: 'token', delta: d })}\n\n`),
    `data: ${JSON.stringify({ type: 'progress', message: 'AI response received — parsing notebook structure...' })}\n\n`,
    `data: ${JSON.stringify({
      type: 'done',
      notebookJson: '{"nbformat":4,"cells":[]}',
      filename: 'test_notebook.ipynb',
      colabUrl: null,
      title: 'Test Notebook',
    })}\n\n`,
  ];
  return events.join('');
}

const TOKEN_DELTAS = Array.from({ length: 20 }, (_, i) => `chunk${i}_`);
const TOTAL_CHARS = TOKEN_DELTAS.join('').length;

test.describe('Task 9 v2 — streaming token UI', () => {
  test.beforeAll(() => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  });

  test('01 — char count display updates as token events arrive', async ({ page }) => {
    // Intercept /api/generate and return controlled SSE with token events
    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: buildSseBody(TOKEN_DELTAS),
      });
    });

    await page.goto('/');
    await page.screenshot({ path: path.join(screenshotsDir, 'task9-01-idle.png') });

    // Fill in a valid-looking API key and attach a dummy PDF
    await page.getByTestId('api-key-input').fill('sk-abcdefghij1234567890');

    // Use the hidden file input (data-testid="pdf-file-input")
    await page.getByTestId('pdf-file-input').setInputFiles({
      name: 'paper.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 minimal test'),
    });

    await page.screenshot({ path: path.join(screenshotsDir, 'task9-02-form-filled.png') });

    // Submit
    await page.getByTestId('submit-button').click();

    // Wait for the token char count display to appear
    const tokenDisplay = page.getByTestId('token-char-count');
    await expect(tokenDisplay).toBeVisible({ timeout: 10000 });

    const text = await tokenDisplay.textContent();
    expect(text).toMatch(/writing notebook/i);
    expect(text).toMatch(/\d+\s*chars/i);

    await page.screenshot({ path: path.join(screenshotsDir, 'task9-03-token-count-visible.png') });
  });

  test('02 — progress feed still shows regular progress messages', async ({ page }) => {
    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: buildSseBody(TOKEN_DELTAS),
      });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-abcdefghij1234567890');
    await page.getByTestId('pdf-file-input').setInputFiles({
      name: 'paper.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 minimal'),
    });

    await page.getByTestId('submit-button').click();

    // Progress feed should be visible
    await expect(page.getByTestId('progress-feed')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: path.join(screenshotsDir, 'task9-04-progress-feed.png') });
  });
});

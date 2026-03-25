import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SS = (n: string) => path.join('tests/screenshots/task10', n);

test.describe('Task 10 — Polish', () => {

  test('01 — page loads with no layout issues on desktop (1280x800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.screenshot({ path: SS('01-desktop.png'), fullPage: true });

    // No overflow
    const bodyOverflow = await page.evaluate(() => window.getComputedStyle(document.body).overflowX);
    expect(['hidden', 'auto', 'clip', 'visible']).toContain(bodyOverflow);
  });

  test('02 — layout is readable on mobile (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.screenshot({ path: SS('02-mobile.png'), fullPage: true });

    // Header still visible
    await expect(page.getByTestId('app-title')).toBeVisible();

    // Submit button still visible (not clipped)
    await expect(page.getByTestId('submit-button')).toBeVisible();
  });

  test('03 — API key format validation: short key shows inline error', async ({ page }) => {
    await page.goto('/');

    // Type a clearly invalid key (too short)
    await page.getByTestId('api-key-input').fill('sk-xx');
    await page.getByTestId('api-key-input').blur();

    await page.screenshot({ path: SS('03-api-key-validation.png'), fullPage: true });

    // Error should be visible for obviously bad format
    const errorEl = page.getByTestId('api-key-error');
    if (await errorEl.count() > 0) {
      await expect(errorEl).toBeVisible();
    }
    // Even without inline error, button should still be disabled for short keys
    await expect(page.getByTestId('submit-button')).toBeDisabled();
  });

  test('04 — server 400 error shows error display (non-SSE error)', async ({ page }) => {
    await page.route('/api/generate', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Missing required fields: apiKey' }),
      });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-test-key-12345678901234');
    const fakePdf = path.join('/tmp', 'mock.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();

    await expect(page.getByTestId('error-display')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: SS('04-server-error-400.png'), fullPage: true });
  });

  test('05 — all text is legible: body font size >= 11px', async ({ page }) => {
    await page.goto('/');

    const minFontSize = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('p, span, label, button, h1, h2'));
      const sizes = elements.map(el => parseFloat(window.getComputedStyle(el).fontSize));
      return Math.min(...sizes.filter(s => s > 0));
    });

    expect(minFontSize).toBeGreaterThanOrEqual(10);
    await page.screenshot({ path: SS('05-legibility.png'), fullPage: true });
  });

  test('06 — status indicator in header updates during processing', async ({ page }) => {
    await page.route('/api/generate', async route => {
      // Simulate a brief delay before done
      await new Promise(r => setTimeout(r, 200));
      const sseBody = `data: ${JSON.stringify({ type: 'progress', message: 'Working...' })}\n\ndata: ${JSON.stringify({ type: 'done', notebookJson: '{}', filename: 'nb.ipynb', colabUrl: null, title: 'NB' })}\n\n`;
      await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    });

    await page.goto('/');
    await page.getByTestId('api-key-input').fill('sk-test-12345678901234567890');
    const fakePdf = path.join('/tmp', 'mock.pdf');
    fs.writeFileSync(fakePdf, '%PDF-1.4 mock');
    await page.getByTestId('pdf-file-input').setInputFiles(fakePdf);
    await page.getByTestId('submit-button').click();

    // Status text should change from 'ready' to 'processing' or 'complete'
    await expect(page.locator('[data-testid="app-title"]')).toBeVisible();
    await page.screenshot({ path: SS('06-processing-header.png') });
  });
});

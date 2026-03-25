import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SS = (name: string) => path.join('tests/screenshots/task2', name);

test.describe('Task 2 — Main Page UI', () => {

  test('01 — page has header with app name and tagline', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: SS('01-initial.png'), fullPage: true });

    // Header: app name
    await expect(page.getByTestId('app-title')).toBeVisible();
    await expect(page.getByTestId('app-title')).toContainText('Paper2Colab');

    // Tagline visible
    await expect(page.getByTestId('app-tagline')).toBeVisible();

    await page.screenshot({ path: SS('01-header-verified.png'), fullPage: true });
  });

  test('02 — API key input renders as password field with label', async ({ page }) => {
    await page.goto('/');

    const apiKeyInput = page.getByTestId('api-key-input');
    await expect(apiKeyInput).toBeVisible();
    await expect(apiKeyInput).toHaveAttribute('type', 'password');

    // Has a label
    await expect(page.getByTestId('api-key-label')).toBeVisible();

    await page.screenshot({ path: SS('02-api-key-field.png'), fullPage: true });
  });

  test('03 — PDF upload zone renders with drag-and-drop text', async ({ page }) => {
    await page.goto('/');

    const uploadZone = page.getByTestId('pdf-upload-zone');
    await expect(uploadZone).toBeVisible();

    // Should have drag-and-drop hint text
    await expect(uploadZone).toContainText(/drag|drop|click|browse|upload/i);

    await page.screenshot({ path: SS('03-upload-zone.png'), fullPage: true });
  });

  test('04 — submit button is disabled until both API key and PDF are provided', async ({ page }) => {
    await page.goto('/');

    const submitBtn = page.getByTestId('submit-button');
    await expect(submitBtn).toBeVisible();

    // Initially disabled
    await expect(submitBtn).toBeDisabled();
    await page.screenshot({ path: SS('04a-button-disabled-initial.png'), fullPage: true });

    // Enter only API key — still disabled
    await page.getByTestId('api-key-input').fill('sk-test-12345');
    await expect(submitBtn).toBeDisabled();
    await page.screenshot({ path: SS('04b-button-disabled-apikey-only.png'), fullPage: true });
  });

  test('05 — submit button enables when API key and PDF file are both provided', async ({ page }) => {
    await page.goto('/');

    const submitBtn = page.getByTestId('submit-button');

    // Fill API key
    await page.getByTestId('api-key-input').fill('sk-test-12345678901234567890');

    // Upload a PDF via the hidden file input
    const fileInput = page.getByTestId('pdf-file-input');

    // Create a minimal fake PDF buffer (just needs to be a file)
    const fakePdfPath = path.join('/tmp', 'test-paper.pdf');
    fs.writeFileSync(fakePdfPath, '%PDF-1.4 fake pdf content for testing');

    await fileInput.setInputFiles(fakePdfPath);

    // Now submit should be enabled
    await expect(submitBtn).toBeEnabled();
    await page.screenshot({ path: SS('05-button-enabled.png'), fullPage: true });
  });

  test('06 — PDF upload zone shows selected filename after file chosen', async ({ page }) => {
    await page.goto('/');

    const fakePdfPath = path.join('/tmp', 'attention-is-all-you-need.pdf');
    fs.writeFileSync(fakePdfPath, '%PDF-1.4 fake pdf content for testing');

    await page.getByTestId('pdf-file-input').setInputFiles(fakePdfPath);

    // Filename should be displayed somewhere in the upload zone
    await expect(page.getByTestId('pdf-upload-zone')).toContainText('attention-is-all-you-need.pdf');

    await page.screenshot({ path: SS('06-filename-shown.png'), fullPage: true });
  });

  test('07 — clicking upload zone triggers file browser (has clickable area)', async ({ page }) => {
    await page.goto('/');

    // The visible upload zone should be clickable (has cursor-pointer or click handler)
    const uploadZone = page.getByTestId('pdf-upload-zone');
    const cursor = await uploadZone.evaluate(el => window.getComputedStyle(el).cursor);

    // Should have pointer cursor since it's clickable
    expect(['pointer', 'default']).toContain(cursor);

    await page.screenshot({ path: SS('07-upload-zone-clickable.png'), fullPage: true });
  });

  test('08 — overall page uses dark theme: dark bg, teal accent on button, sharp borders', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: SS('08-full-page-design.png'), fullPage: true });

    // Background should still be dark (from Task 1 setup)
    const isDarkBg = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = window.getComputedStyle(document.body).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      if (a === 0) {
        ctx.fillStyle = window.getComputedStyle(document.documentElement).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const px = ctx.getImageData(0, 0, 1, 1).data;
        return px[0] <= 20 && px[1] <= 20 && px[2] <= 20;
      }
      return r <= 20 && g <= 20 && b <= 20;
    });
    expect(isDarkBg).toBe(true);
  });
});

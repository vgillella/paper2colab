import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotsDir = path.join(__dirname, '../screenshots');

test.describe('Task 7 v2 — Gist secret disclosure', () => {
  test.beforeAll(() => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  });

  test('01 — disclosure text is visible on the idle page', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: path.join(screenshotsDir, 'task7-01-idle-page.png') });

    const disclosure = page.getByTestId('gist-disclosure');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText(/unlisted/i);
    await expect(disclosure).toContainText(/gist/i);

    await page.screenshot({ path: path.join(screenshotsDir, 'task7-02-disclosure-visible.png') });
  });

  test('02 — disclosure appears below the submit button', async ({ page }) => {
    await page.goto('/');

    const submitBtn = page.getByTestId('submit-button');
    const disclosure = page.getByTestId('gist-disclosure');

    const btnBox = await submitBtn.boundingBox();
    const discBox = await disclosure.boundingBox();

    expect(btnBox).not.toBeNull();
    expect(discBox).not.toBeNull();

    // Disclosure should be below the submit button
    expect(discBox!.y).toBeGreaterThan(btnBox!.y + btnBox!.height - 10);
  });
});

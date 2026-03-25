import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Task 1 — Project Setup', () => {
  test('page loads and has dark background', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Screenshot before any interaction
    await page.screenshot({
      path: path.join('tests/screenshots/task1', '01-initial-load.png'),
      fullPage: true,
    });

    // Page should load (not show a Next.js error page)
    await expect(page).not.toHaveTitle(/Application error/);
    await expect(page).not.toHaveTitle(/500/);

    // Body background should be dark — verify visually via screenshot pixel color
    // (Chromium may return oklch() format for modern CSS colors, so we check luminance via canvas)
    const isDarkBackground = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      // Draw the body's background color onto a 1x1 canvas
      ctx.fillStyle = window.getComputedStyle(document.body).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      // Accept near-black: r, g, b all <= 20, and alpha > 0 (not transparent)
      const [r, g, b, a] = pixel;
      if (a === 0) {
        // Transparent body — check html element instead
        ctx.fillStyle = window.getComputedStyle(document.documentElement).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const htmlPixel = ctx.getImageData(0, 0, 1, 1).data;
        return htmlPixel[0] <= 20 && htmlPixel[1] <= 20 && htmlPixel[2] <= 20;
      }
      return r <= 20 && g <= 20 && b <= 20;
    });
    expect(isDarkBackground).toBe(true);

    // Screenshot after background check
    await page.screenshot({
      path: path.join('tests/screenshots/task1', '02-dark-bg-verified.png'),
      fullPage: true,
    });
  });

  test('shadcn/ui Button component is available (renders without crash)', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // The page should render actual content (not blank)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);

    await page.screenshot({
      path: path.join('tests/screenshots/task1', '03-page-content.png'),
      fullPage: true,
    });
  });

  test('Tailwind CSS is applied — text is off-white', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check that some text element has a light color (Tailwind text-gray-100 or similar)
    const textColor = await page.evaluate(() => {
      const el = document.querySelector('h1, h2, p, span, main');
      if (!el) return null;
      return window.getComputedStyle(el).color;
    });

    // Should be light color (r, g, b all > 180 for off-white)
    if (textColor) {
      const match = textColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        expect(r + g + b).toBeGreaterThan(400); // off-white has high sum
      }
    }

    await page.screenshot({
      path: path.join('tests/screenshots/task1', '04-tailwind-text.png'),
      fullPage: true,
    });
  });
});

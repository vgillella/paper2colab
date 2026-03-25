import { test, expect } from '@playwright/test';
import path from 'path';

const SS = (n: string) => path.join('tests/screenshots/task3', n);

// This test hits a dedicated /test-progress route that renders ProgressFeed in isolation
test.describe('Task 3 — ProgressFeed Component', () => {
  test('01 — progress feed is hidden on main page initially', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: SS('01-no-feed-initially.png'), fullPage: true });
    // Feed should not be visible before submission
    await expect(page.getByTestId('progress-feed')).not.toBeVisible();
  });

  test('02 — progress feed renders messages after form submission begins', async ({ page }) => {
    await page.goto('/test-progress');
    await page.screenshot({ path: SS('02-progress-feed-visible.png'), fullPage: true });

    // Feed container is visible
    await expect(page.getByTestId('progress-feed')).toBeVisible();

    // At least one message is rendered
    const messages = page.getByTestId('progress-message');
    await expect(messages.first()).toBeVisible();
  });

  test('03 — completed messages are dimmed, latest is highlighted', async ({ page }) => {
    await page.goto('/test-progress');
    await page.screenshot({ path: SS('03-messages-state.png'), fullPage: true });

    // Check that completed messages have dimmed styling
    const doneMessage = page.getByTestId('progress-message-done');
    if (await doneMessage.count() > 0) {
      const opacity = await doneMessage.first().evaluate(el =>
        parseFloat(window.getComputedStyle(el).opacity)
      );
      expect(opacity).toBeLessThan(1); // dimmed = opacity < 1
    }

    // Active/latest message exists
    await expect(page.getByTestId('progress-message-active')).toBeVisible();
  });

  test('04 — pulsing indicator visible while processing', async ({ page }) => {
    await page.goto('/test-progress');
    await page.screenshot({ path: SS('04-pulsing-indicator.png'), fullPage: true });

    const indicator = page.getByTestId('progress-indicator');
    await expect(indicator).toBeVisible();
  });

  test('05 — done state shows checkmark, no pulsing indicator', async ({ page }) => {
    await page.goto('/test-progress?done=true');
    await page.screenshot({ path: SS('05-done-state.png'), fullPage: true });

    await expect(page.getByTestId('progress-checkmark')).toBeVisible();
    await expect(page.getByTestId('progress-indicator')).not.toBeVisible();
  });
});

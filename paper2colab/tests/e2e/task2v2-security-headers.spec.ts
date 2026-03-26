import { test, expect } from '@playwright/test';

test.describe('Task 2 v2 — HTTP Security Headers', () => {

  test('01 — X-Frame-Options: DENY is present', async ({ request }) => {
    const res = await request.get('/');
    const header = res.headers()['x-frame-options'];
    expect(header).toBe('DENY');
  });

  test('02 — X-Content-Type-Options: nosniff is present', async ({ request }) => {
    const res = await request.get('/');
    const header = res.headers()['x-content-type-options'];
    expect(header).toBe('nosniff');
  });

  test('03 — Referrer-Policy: no-referrer is present', async ({ request }) => {
    const res = await request.get('/');
    const header = res.headers()['referrer-policy'];
    expect(header).toBe('no-referrer');
  });

  test('04 — Permissions-Policy is present and restricts camera/mic/geolocation', async ({ request }) => {
    const res = await request.get('/');
    const header = res.headers()['permissions-policy'];
    expect(header).toBeTruthy();
    expect(header).toContain('camera=()');
    expect(header).toContain('microphone=()');
    expect(header).toContain('geolocation=()');
  });

  test('05 — Content-Security-Policy is present with default-src', async ({ request }) => {
    const res = await request.get('/');
    const header = res.headers()['content-security-policy'];
    expect(header).toBeTruthy();
    expect(header).toContain("default-src 'self'");
  });

  test('06 — headers apply to API routes too', async ({ request }) => {
    // Use a 400 response from the API route — headers still present
    const res = await request.post('/api/generate', { multipart: {} });
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('07 — page renders correctly with headers present (visual check)', async ({ page }) => {
    await page.goto('/');
    await page.screenshot({ path: 'tests/screenshots/task2v2/01-page-with-headers.png', fullPage: true });
    await expect(page.getByTestId('app-title')).toBeVisible();
    await expect(page.getByTestId('submit-button')).toBeVisible();
  });

});

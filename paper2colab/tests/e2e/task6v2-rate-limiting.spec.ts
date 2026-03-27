import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Use a unique IP per test run so repeated runs within 10 min don't collide
const TEST_IP = `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

// Minimal form data that passes FormData parsing but will fail API key validation
// (rate limiter runs in middleware BEFORE route validation, so status will be 400 for
//  requests 1-3 and 429 for request 4 — we only care about 429 appearing on request 4)
const MINIMAL_PDF = Buffer.from('%PDF-1.4 minimal');

function makeRequest(request: import('@playwright/test').APIRequestContext) {
  return request.post('/api/generate', {
    headers: { 'x-forwarded-for': TEST_IP },
    multipart: {
      apiKey: 'sk-abcdefghij1234567890', // valid format but not a real key
      pdf: { name: 'paper.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF },
    },
  });
}

const screenshotsDir = path.join(__dirname, '../screenshots');

test.describe('Task 6 v2 — per-IP rate limiting', () => {
  test.beforeAll(() => {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  });

  test('01 — first three requests are not rate-limited (not 429)', async ({ request, page }) => {
    await page.goto('/');
    await page.screenshot({ path: path.join(screenshotsDir, 'task6-01-home.png') });

    const res1 = await makeRequest(request);
    const res2 = await makeRequest(request);
    const res3 = await makeRequest(request);

    expect(res1.status()).not.toBe(429);
    expect(res2.status()).not.toBe(429);
    expect(res3.status()).not.toBe(429);
  });

  test('02 — fourth request from same IP returns 429 with retryAfter', async ({ request, page }) => {
    // Requests 1-3 were consumed in the previous test. Make the 4th.
    const res = await makeRequest(request);

    await page.goto('/');
    await page.screenshot({ path: path.join(screenshotsDir, 'task6-02-after-rate-limit.png') });

    expect(res.status()).toBe(429);

    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
    expect(typeof body.retryAfter).toBe('number');
    expect(body.retryAfter).toBeGreaterThan(0);

    const retryAfterHeader = res.headers()['retry-after'];
    expect(retryAfterHeader).toBeDefined();
  });

  test('03 — middleware does not rate-limit other routes (GET /)', async ({ request }) => {
    // Make 5 requests to home page with the same IP — should never 429
    for (let i = 0; i < 5; i++) {
      const res = await request.get('/', {
        headers: { 'x-forwarded-for': TEST_IP },
      });
      expect(res.status()).not.toBe(429);
    }
  });
});

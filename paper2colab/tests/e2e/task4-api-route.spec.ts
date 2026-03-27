import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Minimal valid PDF bytes (PDF 1.4 with a text object)
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n' +
    '4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Hello World) Tj ET\nendstream\nendobj\n' +
    'xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n' +
    '0000000115 00000 n\n0000000266 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n358\n%%EOF'
);

test.describe('Task 4 — /api/generate route (PDF extraction)', () => {
  test('01 — returns 400 when apiKey is missing', async ({ request }) => {
    const formData = new FormData();
    formData.append('pdf', new Blob([MINIMAL_PDF], { type: 'application/pdf' }), 'paper.pdf');

    const res = await request.post('/api/generate', { multipart: { pdf: { name: 'paper.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF } } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/api key/i);
  });

  test('02 — returns 400 when pdf is missing', async ({ request }) => {
    const res = await request.post('/api/generate', {
      multipart: { apiKey: 'sk-abcdefghij1234567890' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/pdf/i);
  });

  test('03 — returns 200 SSE stream when valid PDF + apiKey provided', async ({ request }) => {
    const res = await request.post('/api/generate', {
      multipart: {
        apiKey: 'sk-abcdefghij1234567890',
        pdf: { name: 'paper.pdf', mimeType: 'application/pdf', buffer: MINIMAL_PDF },
      },
    });
    // Route now streams SSE — success is 200 with text/event-stream content type
    // (PDF may be too small to extract text → first SSE event may be an error, still 200)
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('text/event-stream');
    // Body should start with "data:"
    const text = await res.text();
    expect(text).toMatch(/^data:/);
  });

  test('04 — returns 400 when form data is completely empty', async ({ request }) => {
    const res = await request.post('/api/generate', { multipart: {} });
    expect(res.status()).toBe(400);
  });
});

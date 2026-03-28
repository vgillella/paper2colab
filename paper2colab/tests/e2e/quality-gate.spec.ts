import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const PDF_PATH = '/Users/vishnugillella/Documents/AI/AI_ML_Vizuara/modern_software_dev/msd-prd/attention_1706.03762v7.pdf';
const SCREENSHOTS = path.resolve(__dirname, '../screenshots');

test.describe('Real quality gate', () => {
  test('generates valid notebook from Attention Is All You Need', async ({ page }) => {
    test.skip(!OPENAI_API_KEY || !fs.existsSync(PDF_PATH),
      'Skipped: OPENAI_API_KEY not set or PDF not found');
    test.setTimeout(240000);
    await page.goto('/');

    await page.screenshot({ path: path.join(SCREENSHOTS, 'quality-01-page-load.png') });

    // Enter API key from environment
    await page.getByTestId('api-key-input').fill(OPENAI_API_KEY);

    // Upload the Attention paper
    await page.getByTestId('pdf-file-input').setInputFiles(PDF_PATH);

    await page.screenshot({ path: path.join(SCREENSHOTS, 'quality-02-ready.png') });

    // Generate
    await page.getByTestId('submit-button').click();

    // Wait up to 200 seconds for generation to complete
    await page.waitForSelector('[data-testid="download-button"]', { timeout: 200000 });

    await page.screenshot({ path: path.join(SCREENSHOTS, 'quality-03-done.png') });

    // Download the notebook
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-button').click(),
    ]);

    // Read downloaded file
    const downloadPath = await download.path();
    const content = fs.readFileSync(downloadPath!, 'utf-8');

    await page.screenshot({ path: path.join(SCREENSHOTS, 'quality-04-downloaded.png') });

    // Assertions
    let notebook: { cells?: Array<{ source?: string; cell_type?: string }> } = {};
    expect(() => { notebook = JSON.parse(content); }).not.toThrow();

    expect(Array.isArray(notebook!.cells)).toBe(true);
    expect(notebook!.cells!.length).toBeGreaterThanOrEqual(8);

    const nonEmptyCells = notebook!.cells!.filter(c => (c.source ?? '').trim().length > 0);
    expect(nonEmptyCells.length).toBeGreaterThanOrEqual(3);

    const allText = notebook!.cells!.map(c => c.source ?? '').join(' ').toLowerCase();
    expect(allText).toContain('attention');

    const hasDisclaimer = ['disclaimer', 'safety', 'caution', 'note'].some(word => allText.includes(word));
    expect(hasDisclaimer).toBe(true);
  });
});

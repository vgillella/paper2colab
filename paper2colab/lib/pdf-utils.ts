// pdf-parse is a CJS module — use require to avoid ESM default-export issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse');

/**
 * Extract plain text from a PDF buffer.
 * Throws if pdf-parse fails (corrupt/non-PDF file).
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

/**
 * Validate the fields required for the /api/generate route.
 * Returns an array of field names that are missing/invalid.
 */
export function validateGenerateRequest(
  apiKey: string,
  pdfBuffer: Buffer | null
): string[] {
  const errors: string[] = [];
  if (!apiKey || apiKey.trim().length === 0) errors.push('apiKey');
  if (!pdfBuffer || pdfBuffer.length === 0) errors.push('pdf');
  return errors;
}

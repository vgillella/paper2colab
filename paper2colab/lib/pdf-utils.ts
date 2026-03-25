/**
 * Extract plain text from a PDF buffer.
 * Lazy-loads pdf-parse to avoid pdfjs-dist DOM initialisation at module load time.
 * Throws if pdf-parse fails (corrupt/non-PDF file).
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');
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

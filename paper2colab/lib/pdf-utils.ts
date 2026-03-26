/** Maximum allowed PDF size: 20 MB */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

/** Regex for a valid OpenAI API key: sk- followed by 20–200 alphanumeric/dash/underscore chars */
const API_KEY_RE = /^sk-[A-Za-z0-9\-_]{20,200}$/;

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

/**
 * Validate the fields required for the /api/generate route.
 * Returns an array of ValidationError objects (empty = valid).
 */
export function validateGenerateRequest(
  apiKey: string,
  pdfBuffer: Buffer | null
): ValidationError[] {
  const errors: ValidationError[] = [];

  // API key checks
  if (!apiKey || apiKey.trim().length === 0) {
    errors.push({ field: 'apiKey', code: 'MISSING', message: 'API key is required' });
  } else if (!API_KEY_RE.test(apiKey)) {
    errors.push({ field: 'apiKey', code: 'INVALID_FORMAT', message: 'Invalid API key format' });
  }

  // PDF checks
  if (!pdfBuffer || pdfBuffer.length === 0) {
    errors.push({ field: 'pdf', code: 'MISSING', message: 'PDF is required' });
  } else if (pdfBuffer.length > PDF_MAX_BYTES) {
    errors.push({ field: 'pdf', code: 'TOO_LARGE', message: 'PDF must be under 20 MB' });
  }

  return errors;
}

/**
 * Extract plain text from a PDF buffer.
 * Lazy-loads pdf-parse to avoid pdfjs-dist DOM initialisation at module load time.
 * Throws if pdf-parse fails (corrupt/non-PDF file).
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 uses a class-based API: new PDFParse({ data }).getText()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  // TextResult has a .text string (concatenated all pages)
  return result.text as string;
}

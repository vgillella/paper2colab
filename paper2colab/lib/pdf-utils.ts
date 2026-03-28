/** Maximum allowed PDF size: 20 MB */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

/** Maximum characters to extract from a PDF (320,000 chars ≈ ~230K tokens) */
export const MAX_PDF_CHARS = 320_000;

/**
 * Strip dangerous characters from extracted PDF text:
 * - C0 control chars: \x00–\x08, \x0B, \x0C, \x0E–\x1F (null, SOH…BS, VT, FF, SO…US)
 * - Unicode direction overrides and non-characters: \u202E, \uFFFE, \uFFFF
 * - Prompt injection delimiters: "=== PAPER TEXT START ===" / "=== PAPER TEXT END ==="
 * Preserves safe whitespace: \t (\x09), \n (\x0A), \r (\x0D).
 */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u202E\uFFFE\uFFFF]/g, '')
    .replace(/=== PAPER TEXT START ===/g, '')
    .replace(/=== PAPER TEXT END ===/g, '');
}

/**
 * Strip the References section and everything after it.
 * Looks for a line that is exactly "References" or "REFERENCES".
 */
export function stripReferences(text: string): string {
  const refMatch = text.match(/\n(References|REFERENCES)\n/);
  if (refMatch && refMatch.index !== undefined) {
    return text.slice(0, refMatch.index);
  }
  return text;
}

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

// Type for the PDFParse constructor (for DI in tests)
type PDFParseConstructor = new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text: string }> };

/**
 * Extract plain text from a PDF buffer.
 * Lazy-loads pdf-parse to avoid pdfjs-dist DOM initialisation at module load time.
 * Throws if pdf-parse fails (corrupt/non-PDF file).
 * Throws if the extracted text is too short (scanned/image-only PDFs).
 * Strips the References section and truncates to MAX_PDF_CHARS.
 *
 * @param _PDFParse - Optional PDFParse constructor override (for testing/DI).
 */
export async function extractTextFromPdf(buffer: Buffer, _PDFParse?: PDFParseConstructor): Promise<string> {
  // pdf-parse v2 uses a class-based API: new PDFParse({ data }).getText()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFParse = _PDFParse ?? require('pdf-parse').PDFParse;
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  // TextResult has a .text string (concatenated all pages)
  let text = result.text as string;

  // Check for scanned/image-only PDFs
  if (text.trim().length < 100) {
    throw new Error('PDF appears to be scanned or image-only (no extractable text)');
  }

  // Strip references section
  text = stripReferences(text);

  // Truncate if too long
  if (text.length > MAX_PDF_CHARS) {
    text = text.slice(0, MAX_PDF_CHARS) + '\n[Paper truncated]';
  }

  return text;
}

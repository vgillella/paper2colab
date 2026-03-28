/**
 * ArxivValidationError — thrown when input cannot be parsed as a valid arXiv identifier.
 */
export class ArxivValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArxivValidationError';
  }
}

// New-style arXiv IDs: YYMM.NNNNN (with optional version suffix)
const NEW_ID_RE = /^\d{4}\.\d{4,5}(v\d+)?$/;
// Old-style arXiv IDs: category/NNNNNNN
const OLD_ID_RE = /^[a-z-]+\/\d{7}$/;

/**
 * Extract and normalize an arXiv paper ID from a variety of input formats:
 * - Bare new-style IDs: 2301.00001, 1706.03762v7
 * - Old-style IDs: hep-th/9901001
 * - URLs: https://arxiv.org/abs/2301.00001, https://arxiv.org/pdf/1706.03762v7
 *
 * Version suffixes (vN) are stripped before returning.
 * Throws ArxivValidationError on invalid or empty input.
 */
export function extractArxivId(input: string): string {
  if (!input || input.trim().length === 0) {
    throw new ArxivValidationError('arXiv ID or URL must not be empty');
  }

  let candidate = input.trim();

  // Handle URLs like https://arxiv.org/abs/... or https://arxiv.org/pdf/...
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      const url = new URL(candidate);
      // Remove query params — just use pathname
      const pathname = url.pathname;
      // Match /abs/ID or /pdf/ID
      const match = pathname.match(/\/(abs|pdf)\/(.+)/);
      if (!match) {
        throw new ArxivValidationError(`Cannot extract arXiv ID from URL: ${input}`);
      }
      candidate = match[2];
    } catch (e) {
      if (e instanceof ArxivValidationError) throw e;
      throw new ArxivValidationError(`Invalid URL: ${input}`);
    }
  }

  // Strip version suffix (v\d+) from the end
  const withoutVersion = candidate.replace(/v\d+$/, '');

  // Validate as new-style or old-style ID
  if (NEW_ID_RE.test(candidate) || NEW_ID_RE.test(withoutVersion + (candidate.match(/v\d+$/) ?? [''])[0])) {
    // It's a new-style ID — return without version
    return withoutVersion;
  }

  if (OLD_ID_RE.test(withoutVersion)) {
    return withoutVersion;
  }

  throw new ArxivValidationError(`"${input}" is not a valid arXiv ID or URL`);
}

/**
 * Fetch the PDF for a given arXiv paper ID.
 * Returns a Buffer containing the PDF bytes.
 * Throws if the network request fails or the response is not a PDF.
 */
export async function fetchArxivPdf(arxivId: string): Promise<Buffer> {
  const url = `https://arxiv.org/pdf/${arxivId}.pdf`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'paper2colab/1.0 (research tool)' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch arXiv PDF: HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('pdf')) {
    throw new Error(`Unexpected content-type from arXiv: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

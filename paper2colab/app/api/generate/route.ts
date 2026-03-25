import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPdf, validateGenerateRequest } from '@/lib/pdf-utils';

export const runtime = 'nodejs';
export const maxDuration = 180; // 3 min for long OpenAI calls

export async function POST(req: NextRequest) {
  // ── Parse multipart/form-data ──────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const apiKey = (formData.get('apiKey') as string | null) ?? '';
  const pdfFile = formData.get('pdf') as File | null;

  // ── Convert File → Buffer ──────────────────────────────────
  let pdfBuffer: Buffer | null = null;
  if (pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    pdfBuffer = Buffer.from(arrayBuffer);
  }

  // ── Validate inputs ────────────────────────────────────────
  const errors = validateGenerateRequest(apiKey, pdfBuffer);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${errors.join(', ')}` },
      { status: 400 }
    );
  }

  // ── Extract PDF text ───────────────────────────────────────
  let pdfText: string;
  try {
    pdfText = await extractTextFromPdf(pdfBuffer!);
    console.log(`[generate] PDF text extracted: ${pdfText.length} chars`);
  } catch (err) {
    console.error('[generate] PDF parse error:', err);
    return NextResponse.json(
      { error: 'Failed to parse PDF. Make sure the file is a valid PDF.' },
      { status: 422 }
    );
  }

  if (pdfText.trim().length < 100) {
    return NextResponse.json(
      { error: 'PDF appears to be empty or contains no extractable text (e.g. scanned image).' },
      { status: 422 }
    );
  }

  // Stub response — will be replaced with SSE streaming in Task 7
  return NextResponse.json({
    ok: true,
    charCount: pdfText.length,
    preview: pdfText.slice(0, 200),
  });
}

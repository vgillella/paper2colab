import { NextRequest } from 'next/server';
import { extractTextFromPdf, validateGenerateRequest } from '@/lib/pdf-utils';
import { generateNotebook, classifyOpenAiError } from '@/lib/openai-client';
import { assembleNotebook, notebookToJson, notebookFilename } from '@/lib/notebook-assembler';
import { uploadToGist } from '@/lib/gist-uploader';

export const runtime = 'nodejs';
export const maxDuration = 180;

// ─────────────────────────────────────────────────────────────────────────────
// SSE helpers
// ─────────────────────────────────────────────────────────────────────────────
type SseEvent =
  | { type: 'progress'; message: string }
  | { type: 'token'; delta: string }
  | { type: 'done'; notebookJson: string; filename: string; colabUrl: string | null; title: string }
  | { type: 'error'; message: string };

function sseChunk(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/generate — SSE streaming pipeline
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── Parse form data ────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (formData.get('apiKey') as string | null) ?? '';
  const pdfFile = formData.get('pdf') as File | null;

  let pdfBuffer: Buffer | null = null;
  if (pdfFile) {
    const ab = await pdfFile.arrayBuffer();
    pdfBuffer = Buffer.from(ab);
  }

  const errors = validateGenerateRequest(apiKey, pdfBuffer);
  if (errors.length > 0) {
    const first = errors[0];
    const status = first.code === 'TOO_LARGE' ? 413 : 400;
    return new Response(
      JSON.stringify({ error: first.message }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Stream SSE ─────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: SseEvent) => {
        if (closed) return;
        try { controller.enqueue(sseChunk(event)); } catch { closed = true; }
      };
      const closeController = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };
      const progress = (message: string) => send({ type: 'progress', message });

      try {
        // Step 1: Extract PDF text
        progress('Extracting PDF text...');
        let pdfText: string;
        try {
          pdfText = await extractTextFromPdf(pdfBuffer!);
          console.log(`[generate] Extracted ${pdfText.length} chars`);
        } catch (err) {
          console.error('[generate] PDF extraction error:', err);
          const msg = err instanceof Error && err.message.includes('scanned')
            ? err.message
            : `Failed to parse PDF. Please upload a valid, text-based PDF. (${err instanceof Error ? err.message : String(err)})`;
          send({ type: 'error', message: msg });
          closeController();
          return;
        }

        // Step 2: Analyze paper
        progress('Analyzing paper structure and methodology...');

        // Step 3: Call OpenAI (streaming)
        progress('Generating notebook with AI model (streaming tokens)...');
        let spec;
        try {
          spec = await generateNotebook(
            apiKey,
            pdfText,
            progress,
            (delta) => send({ type: 'token', delta })
          );
        } catch (err: unknown) {
          send({ type: 'error', message: classifyOpenAiError(err) });
          closeController();
          return;
        }

        // Step 4: Assemble .ipynb
        progress('Assembling Jupyter notebook (nbformat v4)...');
        const notebook = assembleNotebook(spec);
        const nbJson = notebookToJson(notebook);
        const filename = notebookFilename(spec.title);

        // Step 5: Upload to GitHub Gist (non-fatal)
        progress('Uploading to GitHub Gist for Colab link...');
        const gist = await uploadToGist(nbJson, filename);

        if (gist) {
          progress('Colab link created successfully!');
        } else {
          progress('(Gist upload skipped — download still available)');
        }

        // Step 6: Done
        send({
          type: 'done',
          notebookJson: nbJson,
          filename,
          colabUrl: gist?.colabUrl ?? null,
          title: spec.title,
        });
        closeController();
      } catch (err: unknown) {
        console.error('[generate] Unexpected error:', err);
        send({ type: 'error', message: 'An unexpected error occurred. Please try again.' });
        closeController();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

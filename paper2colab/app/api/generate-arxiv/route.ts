import { NextRequest } from 'next/server';
import { extractTextFromPdf } from '@/lib/pdf-utils';
import { generateNotebook, classifyOpenAiError } from '@/lib/openai-client';
import { assembleNotebook, notebookToJson, notebookFilename } from '@/lib/notebook-assembler';
import { uploadToGist } from '@/lib/gist-uploader';
import { extractArxivId, fetchArxivPdf, ArxivValidationError } from '@/lib/arxiv-fetcher';

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

const API_KEY_RE = /^sk-[A-Za-z0-9\-_]{20,200}$/;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/generate-arxiv — SSE streaming pipeline from arXiv URL
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { arxivUrl?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = (body.apiKey ?? '').trim();
  const arxivUrl = (body.arxivUrl ?? '').trim();

  // Validate apiKey
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!API_KEY_RE.test(apiKey)) {
    return new Response(JSON.stringify({ error: 'Invalid API key format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate arxivUrl
  if (!arxivUrl) {
    return new Response(JSON.stringify({ error: 'arXiv URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract arXiv ID — validate before starting SSE stream
  let paperId: string;
  try {
    paperId = extractArxivId(arxivUrl);
  } catch (err) {
    const msg = err instanceof ArxivValidationError ? err.message : 'Invalid arXiv URL or ID';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
        // Step 1: Fetch PDF from arXiv
        progress(`Fetching PDF from arXiv (${paperId})...`);
        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await fetchArxivPdf(paperId);
          console.log(`[generate-arxiv] Fetched ${pdfBuffer.length} bytes for ${paperId}`);
        } catch (err) {
          send({ type: 'error', message: `Failed to fetch PDF from arXiv: ${err instanceof Error ? err.message : 'Unknown error'}` });
          closeController();
          return;
        }

        // Step 2: Extract PDF text
        progress('Extracting PDF text...');
        let pdfText: string;
        try {
          pdfText = await extractTextFromPdf(pdfBuffer);
          console.log(`[generate-arxiv] Extracted ${pdfText.length} chars`);
        } catch {
          send({ type: 'error', message: 'Failed to parse PDF. The paper may be scanned or image-only.' });
          closeController();
          return;
        }

        // Step 3: Analyze paper
        progress('Analyzing paper structure and methodology...');

        // Step 4: Call OpenAI (streaming)
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

        // Step 5: Assemble .ipynb
        progress('Assembling Jupyter notebook (nbformat v4)...');
        const notebook = assembleNotebook(spec);
        const nbJson = notebookToJson(notebook);
        const filename = notebookFilename(spec.title);

        // Step 6: Upload to GitHub Gist (non-fatal)
        progress('Uploading to GitHub Gist for Colab link...');
        const gist = await uploadToGist(nbJson, filename);

        if (gist) {
          progress('Colab link created successfully!');
        } else {
          progress('(Gist upload skipped — download still available)');
        }

        // Step 7: Done
        send({
          type: 'done',
          notebookJson: nbJson,
          filename,
          colabUrl: gist?.colabUrl ?? null,
          title: spec.title,
        });
        closeController();
      } catch (err: unknown) {
        console.error('[generate-arxiv] Unexpected error:', err);
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

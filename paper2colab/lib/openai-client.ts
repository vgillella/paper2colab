import OpenAI from 'openai';
import { buildSystemPrompt, buildUserMessage, parseNotebookResponse, NotebookSpec } from './prompt';

// Model to use — configurable. gpt-4.5-preview is a high-capability reasoning model.
// Update MODEL_ID to 'gpt-4.5-preview' or whichever model you have access to.
export const MODEL_ID = process.env.OPENAI_MODEL ?? 'gpt-5.1';

const GENERIC_ERROR = 'An unexpected error occurred. Please try again.';

/**
 * Classify an OpenAI SDK error into a safe user-facing message.
 * Unclassified errors are logged server-side and return a generic message
 * so that raw SDK internals are never sent to the client.
 */
export function classifyOpenAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';

  if (msg.includes('401') || msg.includes('Unauthorized')) {
    return 'Invalid OpenAI API key. Please check your key and try again.';
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return 'OpenAI rate limit reached. Please wait a moment and try again.';
  }
  if (msg.includes('quota') || msg.includes('billing')) {
    return 'OpenAI quota exceeded. Please check your usage limits.';
  }

  console.error('[generate] Unclassified OpenAI error:', err);
  return GENERIC_ERROR;
}

/**
 * Call the OpenAI API with streaming enabled.
 * Each token delta is forwarded via onToken(); the full JSON is accumulated
 * server-side, parsed into a NotebookSpec, and returned.
 *
 * @param _client - Optional OpenAI client instance (for testing/DI). If omitted, one is created from apiKey.
 */
export async function generateNotebook(
  apiKey: string,
  pdfText: string,
  onProgress?: (msg: string) => void,
  onToken?: (delta: string) => void,
  _client?: OpenAI
): Promise<NotebookSpec> {
  const client = _client ?? new OpenAI({ apiKey });

  onProgress?.('Sending paper to AI model...');

  const stream = await client.chat.completions.create({
    model: MODEL_ID,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserMessage(pdfText) },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 16000,
    temperature: 0.3,
    stream: true,
  });

  let rawJson = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta != null) {
      rawJson += delta;
      onToken?.(delta);
    }
  }

  onProgress?.('AI response received — parsing notebook structure...');

  if (!rawJson) {
    throw new Error('OpenAI returned an empty response');
  }

  const spec = parseNotebookResponse(rawJson);
  onProgress?.(`Notebook parsed: ${spec.cells.length} cells generated`);

  return spec;
}

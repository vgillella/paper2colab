import OpenAI from 'openai';
import { buildSystemPrompt, buildUserMessage, parseNotebookResponse, NotebookSpec } from './prompt';

// Model to use — configurable. gpt-4.5-preview is a high-capability reasoning model.
// Update MODEL_ID to 'gpt-4.5-preview' or whichever model you have access to.
export const MODEL_ID = process.env.OPENAI_MODEL ?? 'gpt-4.5-preview';

/**
 * Call the OpenAI API with the extracted PDF text and return a parsed NotebookSpec.
 * Uses the user-provided API key (never stored server-side).
 */
export async function generateNotebook(
  apiKey: string,
  pdfText: string,
  onProgress?: (msg: string) => void
): Promise<NotebookSpec> {
  const client = new OpenAI({ apiKey });

  onProgress?.('Sending paper to AI model...');

  const response = await client.chat.completions.create({
    model: MODEL_ID,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserMessage(pdfText) },
    ],
    // Response format: ask for JSON explicitly
    response_format: { type: 'json_object' },
    // High token output needed for detailed notebooks
    max_tokens: 16000,
    temperature: 0.3, // Low temperature for structured, accurate output
  });

  onProgress?.('AI response received — parsing notebook structure...');

  const rawContent = response.choices[0]?.message?.content ?? '';
  if (!rawContent) {
    throw new Error('OpenAI returned an empty response');
  }

  const spec = parseNotebookResponse(rawContent);
  onProgress?.(`Notebook parsed: ${spec.cells.length} cells generated`);

  return spec;
}

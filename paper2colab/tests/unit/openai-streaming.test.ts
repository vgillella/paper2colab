import { describe, it, expect, vi } from 'vitest';
import { generateNotebook } from '@/lib/openai-client';
import type OpenAI from 'openai';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAsyncIterable(deltas: (string | null)[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const delta of deltas) {
        yield { choices: [{ delta: { content: delta } }] };
      }
    },
  };
}

function makeMockClient(deltas: (string | null)[]): { client: OpenAI; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue(makeAsyncIterable(deltas));
  const client = {
    chat: { completions: { create } },
  } as unknown as OpenAI;
  return { client, create };
}

// ── generateNotebook() streaming behaviour ───────────────────────────────────

describe('generateNotebook() with stream:true', () => {
  it('calls OpenAI with stream:true', async () => {
    const validSpec = { title: 'T', summary: 'S', cells: [] };
    const { client, create } = makeMockClient([JSON.stringify(validSpec)]);

    await generateNotebook('sk-testkey1234567890', 'paper', undefined, undefined, client);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true })
    );
  });

  it('yields token events for each non-null delta in order', async () => {
    const chunks = ['{"title":"T"', ',"summary":"S","cells":[]}'];
    const { client } = makeMockClient(chunks);

    const tokenEvents: string[] = [];
    await generateNotebook(
      'sk-testkey1234567890',
      'paper',
      undefined,
      (delta) => tokenEvents.push(delta),
      client
    );

    expect(tokenEvents).toEqual(chunks);
  });

  it('skips null/undefined deltas without emitting token events', async () => {
    const { client } = makeMockClient([null, 'hello', null, ' world']);

    const tokenEvents: string[] = [];
    await generateNotebook(
      'sk-testkey1234567890',
      'paper',
      undefined,
      (delta) => tokenEvents.push(delta),
      client
    ).catch(() => {}); // rawJson 'hello world' is not valid JSON — parse error expected

    expect(tokenEvents).toEqual(['hello', ' world']);
  });

  it('accumulates all deltas into rawJson and parses NotebookSpec', async () => {
    const validSpec = {
      title: 'Test Notebook',
      summary: 'A test',
      cells: [{ type: 'code', source: 'print(1)', section: 'Introduction' }],
    };
    const jsonStr = JSON.stringify(validSpec);
    const chunks = jsonStr.match(/.{1,5}/g) ?? [jsonStr];

    const { client } = makeMockClient(chunks);

    const spec = await generateNotebook('sk-testkey1234567890', 'paper', undefined, undefined, client);

    expect(spec.title).toBe('Test Notebook');
    expect(spec.summary).toBe('A test');
    expect(spec.cells).toHaveLength(1);
  });

  it('emits progress events before and after the stream', async () => {
    const validSpec = { title: 'T', summary: 'S', cells: [] };
    const { client } = makeMockClient([JSON.stringify(validSpec)]);

    const progressEvents: string[] = [];
    await generateNotebook(
      'sk-testkey1234567890',
      'paper',
      (msg) => progressEvents.push(msg),
      undefined,
      client
    );

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents[0]).toMatch(/sending|model/i);
    expect(progressEvents[progressEvents.length - 1]).toMatch(/parsed|cells/i);
  });

  it('throws when OpenAI returns an empty stream', async () => {
    const { client } = makeMockClient([null, null]); // all nulls → rawJson = ''

    await expect(
      generateNotebook('sk-testkey1234567890', 'paper', undefined, undefined, client)
    ).rejects.toThrow(/empty response/i);
  });
});

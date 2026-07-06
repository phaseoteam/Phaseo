import { describe, expect, it } from 'vitest';
import { embed, embedMany } from 'ai';
import { createPhaseo } from '../src/index.js';

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

describe('Phaseo Vercel AI SDK embedding compatibility', () => {
  it('maps single embeddings and usage from /embeddings', async () => {
    const requests: Array<any> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? '{}')));

        return createJsonResponse({
          id: 'embed_resp_123',
          provider: 'openai',
          session_id: 'sess_embed_123',
          nativeResponseId: 'native_embed_123',
          pricing_lines: [{ provider: 'openai', endpoint: 'embeddings' }],
          meta: {
            routing: {
              provider: 'openai',
              model: 'openai/text-embedding-3-small',
            },
          },
          data: [
            {
              index: 0,
              embedding: [0.1, 0.2, 0.3],
            },
          ],
          usage: {
            total_tokens: 7,
          },
        }, {
          headers: {
            'x-request-id': 'req_embed_123',
          },
        });
      },
    });

    const result = await embed({
      model: phaseo.textEmbeddingModel('openai/text-embedding-3-small'),
      value: 'hello',
    });

    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.usage?.tokens).toBe(7);
    expect(result.providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_embed_123',
        responseId: 'embed_resp_123',
        provider: 'openai',
        nativeResponseId: 'native_embed_123',
        sessionId: 'sess_embed_123',
        pricingLines: [{ provider: 'openai', endpoint: 'embeddings' }],
        routing: {
          provider: 'openai',
          model: 'openai/text-embedding-3-small',
        },
      },
    });
    expect(requests[0]?.model).toBe('openai/text-embedding-3-small');
    expect(requests[0]?.encoding_format).toBe('float');
    expect(requests[0]?.input).toEqual(['hello']);
  });

  it('preserves embedMany ordering when gateway rows arrive out of order', async () => {
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async () =>
        createJsonResponse({
          data: [
            {
              index: 2,
              embedding: [0.9, 1.0],
            },
            {
              index: 0,
              embedding: [0.1, 0.2],
            },
            {
              index: 1,
              embedding: [0.5, 0.6],
            },
          ],
          usage: {
            total_tokens: 12,
          },
        }),
    });

    const result = await embedMany({
      model: phaseo.textEmbeddingModel('openai/text-embedding-3-small'),
      values: ['first', 'second', 'third'],
    });

    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.5, 0.6],
      [0.9, 1.0],
    ]);
    expect(result.usage?.tokens).toBe(12);
  });
});

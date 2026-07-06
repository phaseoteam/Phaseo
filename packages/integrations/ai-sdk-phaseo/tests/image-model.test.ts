import { describe, expect, it } from 'vitest';
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

describe('Phaseo Vercel AI SDK image compatibility', () => {
  it('maps generateImage responses from /images/generations', async () => {
    const requests: Array<{ url: string; body?: any; headers: Headers }> = [];
    const imageBytes = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]);
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (input, init) => {
        const url = String(input);

        requests.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          headers: new Headers(init?.headers),
        });

        if (url === 'https://gateway.example/v1/images/generations') {
          return createJsonResponse({
            id: 'imgresp_123',
            created: 1_710_000_000,
            provider: 'openai',
            session_id: 'sess_img_123',
            nativeResponseId: 'native_img_123',
            pricing_lines: [{ provider: 'openai', endpoint: 'images/generations' }],
            meta: {
              routing: {
                provider: 'openai',
                model: 'openai/dall-e-3',
              },
            },
            request_id: 'req_img_body_123',
            data: [
              {
                url: 'https://cdn.example/images/generated-1.png',
              },
            ],
          }, {
            headers: {
              'x-request-id': 'req_img_header_123',
            },
          });
        }

        expect(url).toBe('https://cdn.example/images/generated-1.png');
        return new Response(imageBytes, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
          },
        });
      },
    });

    const { generateImage } = await import('ai');
    const result = await generateImage({
      model: phaseo.imageModel('openai/dall-e-3'),
      prompt: 'A geometric poster on a white background',
      aspectRatio: '16:9',
      n: 1,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(Array.from(result.images[0]?.uint8Array ?? [])).toEqual(Array.from(imageBytes));
    expect(result.providerMetadata).toEqual({
      gateway: {
        requestId: 'req_img_header_123',
        responseId: 'imgresp_123',
        provider: 'openai',
        nativeResponseId: 'native_img_123',
        sessionId: 'sess_img_123',
        pricingLines: [{ provider: 'openai', endpoint: 'images/generations' }],
        routing: {
          provider: 'openai',
          model: 'openai/dall-e-3',
        },
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe('https://gateway.example/v1/images/generations');
    expect(requests[0]?.body.model).toBe('openai/dall-e-3');
    expect(requests[0]?.body.prompt).toBe('A geometric poster on a white background');
    expect(requests[0]?.body.n).toBe(1);
    expect(requests[0]?.body.size).toBe('1792x1024');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer test-key');
    expect(requests[1]?.headers.get('authorization')).toBeNull();
  });

  it('passes provider options through and preserves base64 image output', async () => {
    const requests: Array<any> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? '{}')));

        return createJsonResponse({
          data: [
            {
              b64_json: 'YmFzZTY0LWltYWdlLWRhdGE=',
            },
          ],
        });
      },
    });

    const { generateImage } = await import('ai');
    const result = await generateImage({
      model: phaseo.imageModel('openai/dall-e-2', { user: 'user_123' }),
      prompt: 'A small illustrated robot',
      size: '512x512',
      providerOptions: {
        openai: {
          quality: 'hd',
          style: 'vivid',
        },
      },
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.base64).toBe('YmFzZTY0LWltYWdlLWRhdGE=');
    expect(result.images[0]?.mediaType).toBe('image/png');
    expect(requests[0]).toMatchObject({
      model: 'openai/dall-e-2',
      prompt: 'A small illustrated robot',
      size: '512x512',
      quality: 'hd',
      style: 'vivid',
      user: 'user_123',
    });
  });
});

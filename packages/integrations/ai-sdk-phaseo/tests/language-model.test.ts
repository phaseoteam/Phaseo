import { describe, expect, it, vi } from 'vitest';
import { generateObject, generateText, streamObject, streamText } from 'ai';
import { z } from 'zod';
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

function createSseResponse(events: unknown[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    {
      status: init.status ?? 200,
      headers: {
        'Content-Type': 'text/event-stream',
        ...(init.headers ?? {}),
      },
    }
  );
}

describe('Phaseo Vercel AI SDK language model compatibility', () => {
  it('requires an API key', () => {
    expect(() => createPhaseo({ apiKey: '' })).toThrow(/API key is required/i);
  });

  it('default phaseo export reads PHASEO_API_KEY and PHASEO_BASE_URL at module load time', async () => {
    const previousApiKey = process.env.PHASEO_API_KEY;
    const previousBaseUrl = process.env.PHASEO_BASE_URL;
    const previousFetch = globalThis.fetch;
    const requests: Array<{ url: string; headers: Headers }> = [];

    process.env.PHASEO_API_KEY = 'default-env-phaseo-key';
    process.env.PHASEO_BASE_URL = 'https://default-env-phaseo.example/v1';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });

      return createJsonResponse({
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Hello from default export env',
            },
          },
        ],
      });
    }) as typeof fetch;

    try {
      vi.resetModules();
      const mod = await import('../src/index.js');

      const result = await generateText({
        model: mod.phaseo('openai/gpt-4o-mini'),
        prompt: 'Say hello',
      });

      expect(result.text).toBe('Hello from default export env');
      expect(requests[0]?.url).toBe('https://default-env-phaseo.example/v1/chat/completions');
      expect(requests[0]?.headers.get('authorization')).toBe('Bearer default-env-phaseo-key');
    } finally {
      process.env.PHASEO_API_KEY = previousApiKey;
      process.env.PHASEO_BASE_URL = previousBaseUrl;
      globalThis.fetch = previousFetch;
    }
  });

  it('reads PHASEO_API_KEY and PHASEO_BASE_URL environment variables', async () => {
    const previousApiKey = process.env.PHASEO_API_KEY;
    const previousBaseUrl = process.env.PHASEO_BASE_URL;
    const requests: Array<{ url: string; headers: Headers }> = [];

    process.env.PHASEO_API_KEY = 'env-phaseo-key';
    process.env.PHASEO_BASE_URL = 'https://env-phaseo.example/v1';

    try {
      const phaseo = createPhaseo({
        fetch: async (input, init) => {
          requests.push({
            url: String(input),
            headers: new Headers(init?.headers),
          });

          return createJsonResponse({
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: 'Hello from env',
                },
              },
            ],
          });
        },
      });

      const result = await generateText({
        model: phaseo('openai/gpt-4o-mini'),
        prompt: 'Say hello',
      });

      expect(result.text).toBe('Hello from env');
      expect(requests[0]?.url).toBe('https://env-phaseo.example/v1/chat/completions');
      expect(requests[0]?.headers.get('authorization')).toBe('Bearer env-phaseo-key');
    } finally {
      process.env.PHASEO_API_KEY = previousApiKey;
      process.env.PHASEO_BASE_URL = previousBaseUrl;
    }
  });

  it('maps generateText responses from /chat/completions', async () => {
    const requests: Array<{ url: string; body: any; headers: Headers }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? '{}')),
          headers: new Headers(init?.headers),
        });

        return createJsonResponse({
          id: 'chatcmpl_123',
          nativeResponseId: 'native_123',
          created: 1_710_000_000,
          model: 'openai/gpt-4o-mini',
          provider: 'openai',
          session_id: 'session_123',
          pricing_lines: [
            {
              dimension: 'input_text_tokens',
              amount_nanos: 1100,
            },
          ],
          meta: {
            routing: {
              selected_provider: 'openai',
            },
          },
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'Hello from Phaseo',
              },
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 4,
            total_tokens: 15,
          },
        }, {
          headers: {
            'x-request-id': 'req_123',
            'x-provider-route': 'openai',
          },
        });
      },
    });

    const result = await generateText({
      model: phaseo('openai/gpt-4o-mini'),
      prompt: 'Say hello',
      maxTokens: 32,
    });

    expect(result.text).toBe('Hello from Phaseo');
    expect(result.usage.inputTokens).toBe(11);
    expect(result.usage.outputTokens).toBe(4);
    expect(result.response.id).toBe('chatcmpl_123');
    expect(result.response.modelId).toBe('openai/gpt-4o-mini');
    expect(result.response.timestamp).toEqual(new Date(1_710_000_000 * 1000));
    expect(result.response.headers).toMatchObject({
      'content-type': 'application/json',
      'x-request-id': 'req_123',
      'x-provider-route': 'openai',
    });
    expect(result.providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_123',
        responseId: 'chatcmpl_123',
        provider: 'openai',
        nativeResponseId: 'native_123',
        sessionId: 'session_123',
        pricingLines: [
          {
            dimension: 'input_text_tokens',
            amount_nanos: 1100,
          },
        ],
        routing: {
          selected_provider: 'openai',
        },
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://gateway.example/v1/chat/completions');
    expect(requests[0]?.body.stream).toBe(false);
    expect(requests[0]?.body.model).toBe('openai/gpt-4o-mini');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer test-key');
  });

  it('maps generateText tool-call responses from /chat/completions', async () => {
    const requests: Array<{ body: any }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? '{}')),
        });

        return createJsonResponse({
          id: 'chatcmpl_tool_123',
          created: 1_710_000_050,
          model: 'openai/gpt-4o-mini',
          provider: 'openai',
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_weather_1',
                    type: 'function',
                    function: {
                      name: 'getWeather',
                      arguments: '{"city":"San Francisco"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 5,
            total_tokens: 17,
          },
        }, {
          headers: {
            'x-request-id': 'req_tool_123',
          },
        });
      },
    });

    const result = await generateText({
      model: phaseo('openai/gpt-4o-mini'),
      prompt: 'Get the weather in San Francisco.',
      tools: {
        getWeather: {
          description: 'Get weather for a city',
          parameters: z.object({
            city: z.string(),
          }),
        },
      },
      maxTokens: 64,
    });

    expect(result.finishReason).toBe('tool-calls');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      toolName: 'getWeather',
      toolCallId: 'call_weather_1',
      input: {
        city: 'San Francisco',
      },
    });
    expect(result.response.id).toBe('chatcmpl_tool_123');
    expect(result.providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_tool_123',
        responseId: 'chatcmpl_tool_123',
        provider: 'openai',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.stream).toBe(false);
    expect(requests[0]?.body.tools).toBeTruthy();
  });

  it('maps generateObject responses and requests json_object output mode', async () => {
    const requests: Array<{ body: any; headers: Headers }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? '{}')),
          headers: new Headers(init?.headers),
        });

        return createJsonResponse({
          id: 'chatcmpl_object_123',
          created: 1_710_000_075,
          model: 'openai/gpt-4o-mini',
          provider: 'openai',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  name: 'Ada Lovelace',
                  age: 36,
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 14,
            completion_tokens: 7,
            total_tokens: 21,
          },
        }, {
          headers: {
            'x-request-id': 'req_object_123',
          },
        });
      },
    });

    const result = await generateObject({
      model: phaseo('openai/gpt-4o-mini'),
      prompt: 'Generate a person.',
      schema: z.object({
        name: z.string(),
        age: z.number(),
      }),
    });

    expect(result.object).toEqual({
      name: 'Ada Lovelace',
      age: 36,
    });
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toMatchObject({
      inputTokens: 14,
      outputTokens: 7,
      totalTokens: 21,
    });
    expect(result.response.id).toBe('chatcmpl_object_123');
    expect(result.response.modelId).toBe('openai/gpt-4o-mini');
    expect(result.providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_object_123',
        responseId: 'chatcmpl_object_123',
        provider: 'openai',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.stream).toBe(false);
    expect(requests[0]?.body.response_format).toEqual({ type: 'json_object' });
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer test-key');
  });

  it('streams structured objects and resolves final metadata', async () => {
    const requests: Array<{ body: any }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? '{}')),
        });

        return createSseResponse([
          {
            object: 'chat.completion.chunk',
            id: 'chatcmpl_object_stream_123',
            created: 1_710_000_125,
            model: 'openai/gpt-4o-mini',
            provider: 'openai',
            choices: [
              {
                index: 0,
                delta: { content: '{"name":"Ada",' },
              },
            ],
          },
          {
            object: 'chat.completion.chunk',
            choices: [
              {
                index: 0,
                delta: { content: '"age":36}' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 9,
              completion_tokens: 6,
              total_tokens: 15,
            },
          },
        ], {
          headers: {
            'x-request-id': 'req_object_stream_123',
          },
        });
      },
    });

    const result = streamObject({
      model: phaseo('openai/gpt-4o-mini'),
      prompt: 'Generate a person.',
      schema: z.object({
        name: z.string(),
        age: z.number(),
      }),
    });

    const partials: Array<Record<string, unknown>> = [];
    for await (const partial of result.partialObjectStream) {
      partials.push(partial as Record<string, unknown>);
    }

    const object = await result.object;
    const finishReason = await result.finishReason;
    const usage = await result.usage;
    const response = await result.response;
    const providerMetadata = await result.providerMetadata;

    expect(partials.length).toBeGreaterThan(0);
    expect(partials[partials.length - 1]).toEqual({
      name: 'Ada',
      age: 36,
    });
    expect(object).toEqual({
      name: 'Ada',
      age: 36,
    });
    expect(finishReason).toBe('stop');
    expect(usage).toMatchObject({
      inputTokens: 9,
      outputTokens: 6,
      totalTokens: 15,
    });
    expect(response.id).toBe('chatcmpl_object_stream_123');
    expect(response.modelId).toBe('openai/gpt-4o-mini');
    expect(providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_object_stream_123',
        responseId: 'chatcmpl_object_stream_123',
        provider: 'openai',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.stream).toBe(true);
    expect(requests[0]?.body.stream_options).toEqual({ include_usage: true });
    expect(requests[0]?.body.response_format).toEqual({ type: 'json_object' });
  });

  it('streams text via SSE and resolves response metadata, usage, and finish reason', async () => {
    const requests: Array<{ body: any }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? '{}')),
        });

        return createSseResponse([
          {
            object: 'chat.completion.chunk',
            id: 'chatcmpl_stream_123',
            created: 1_710_000_100,
            model: 'anthropic/claude-3-5-haiku-20241022',
            provider: 'anthropic',
            nativeResponseId: 'native_stream_123',
            choices: [
              {
                index: 0,
                delta: { content: 'Hello' },
              },
            ],
          },
          {
            object: 'chat.completion.chunk',
            choices: [
              {
                index: 0,
                delta: { content: ' world' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 3,
              completion_tokens: 2,
              total_tokens: 5,
            },
          },
        ], {
          headers: {
            'x-request-id': 'req_stream_123',
          },
        });
      },
    });

    const result = streamText({
      model: phaseo('anthropic/claude-3-5-haiku-20241022'),
      prompt: 'Say hello',
      maxTokens: 32,
    });

    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
    }

    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const response = await result.response;
    const providerMetadata = await result.providerMetadata;

    expect(text).toBe('Hello world');
    expect(usage).toMatchObject({
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
    });
    expect(finishReason).toBe('stop');
    expect(response.id).toBe('chatcmpl_stream_123');
    expect(response.modelId).toBe('anthropic/claude-3-5-haiku-20241022');
    expect(response.timestamp).toEqual(new Date(1_710_000_100 * 1000));
    expect(response.headers).toMatchObject({
      'content-type': 'text/event-stream',
      'x-request-id': 'req_stream_123',
    });
    expect(providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_stream_123',
        responseId: 'chatcmpl_stream_123',
        provider: 'anthropic',
        nativeResponseId: 'native_stream_123',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.stream).toBe(true);
    expect(requests[0]?.body.stream_options).toEqual({ include_usage: true });
  });

  it('streams tool calls via SSE and assembles final AI SDK tool-call state', async () => {
    const requests: Array<{ body: any }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (_input, init) => {
        requests.push({
          body: JSON.parse(String(init?.body ?? '{}')),
        });

        return createSseResponse([
          {
            object: 'chat.completion.chunk',
            id: 'chatcmpl_tool_stream_123',
            created: 1_710_000_200,
            model: 'openai/gpt-4o-mini',
            provider: 'openai',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_weather_1',
                      function: {
                        name: 'getWeather',
                        arguments: '{"city":"San',
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            object: 'chat.completion.chunk',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: ' Francisco"}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 6,
              total_tokens: 14,
            },
          },
        ], {
          headers: {
            'x-request-id': 'req_tool_stream_123',
          },
        });
      },
    });

    const result = streamText({
      model: phaseo('openai/gpt-4o-mini'),
      prompt: 'Get the weather in San Francisco.',
      tools: {
        getWeather: {
          description: 'Get weather for a city',
          parameters: z.object({
            city: z.string(),
          }),
        },
      },
      maxTokens: 64,
    });

    const eventTypes: string[] = [];
    for await (const part of result.fullStream) {
      eventTypes.push(part.type);
    }

    const toolCalls = await result.toolCalls;
    const finishReason = await result.finishReason;
    const usage = await result.usage;
    const response = await result.response;
    const providerMetadata = await result.providerMetadata;
    const steps = await result.steps;

    expect(eventTypes).toContain('tool-input-start');
    expect(eventTypes).toContain('tool-input-delta');
    expect(eventTypes).toContain('tool-input-end');
    expect(eventTypes).toContain('tool-call');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      toolName: 'getWeather',
      toolCallId: 'call_weather_1',
      input: {
        city: 'San Francisco',
      },
    });
    expect(finishReason).toBe('tool-calls');
    expect(usage).toMatchObject({
      inputTokens: 8,
      outputTokens: 6,
      totalTokens: 14,
    });
    expect(response.id).toBe('chatcmpl_tool_stream_123');
    expect(response.modelId).toBe('openai/gpt-4o-mini');
    expect(response.headers).toMatchObject({
      'x-request-id': 'req_tool_stream_123',
    });
    expect(providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_tool_stream_123',
        responseId: 'chatcmpl_tool_stream_123',
        provider: 'openai',
      },
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.toolCalls).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.tools).toBeTruthy();
    expect(requests[0]?.body.stream).toBe(true);
  });
});

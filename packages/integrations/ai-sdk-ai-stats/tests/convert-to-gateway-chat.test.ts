import { describe, expect, it } from 'vitest';
import { convertToGatewayChatRequest } from '../src/convert-to-gateway-chat.js';

describe('convertToGatewayChatRequest', () => {
  it('applies model settings defaults when call options are unset', () => {
    const request = convertToGatewayChatRequest(
      [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] as any,
      'openai/gpt-5-nano',
      {
        temperature: 0.4,
        topP: 0.8,
        topK: 30,
        maxTokens: 256,
        frequencyPenalty: 0.2,
        presencePenalty: 0.1,
        seed: 42,
        user: 'user-123',
      },
      {} as any
    );

    expect(request.temperature).toBe(0.4);
    expect(request.top_p).toBe(0.8);
    expect(request.top_k).toBe(30);
    expect(request.max_tokens).toBe(256);
    expect(request.frequency_penalty).toBe(0.2);
    expect(request.presence_penalty).toBe(0.1);
    expect(request.seed).toBe(42);
    expect(request.user).toBe('user-123');
  });

  it('lets call options override model settings', () => {
    const request = convertToGatewayChatRequest(
      [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] as any,
      'openai/gpt-5-nano',
      {
        temperature: 0.1,
        maxTokens: 64,
      },
      {
        temperature: 0.9,
        maxOutputTokens: 512,
      } as any
    );

    expect(request.temperature).toBe(0.9);
    expect(request.max_tokens).toBe(512);
  });

  it('merges provider options into request body', () => {
    const request = convertToGatewayChatRequest(
      [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] as any,
      'openai/gpt-5-nano',
      {},
      {
        providerOptions: {
          openai: { service_tier: 'auto' },
          aiStats: { provider: { order: ['openai', 'anthropic'] } },
        },
      } as any
    );

    expect(request.service_tier).toBe('auto');
    expect(request.provider).toEqual({ order: ['openai', 'anthropic'] });
  });

  it('supports image parts in user content', () => {
    const request = convertToGatewayChatRequest(
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe image' },
            {
              type: 'image',
              image: new Uint8Array([1, 2, 3]),
              mediaType: 'image/png',
            },
          ],
        },
      ] as any,
      'openai/gpt-5-nano',
      {},
      {} as any
    );

    expect(Array.isArray(request.messages[0].content)).toBe(true);
    const imagePart = request.messages[0].content.find((part: any) => part.type === 'image_url');
    expect(imagePart.image_url.url).toBe('data:image/png;base64,AQID');
  });

  it('maps tools and tool choice from regular mode', () => {
    const request = convertToGatewayChatRequest(
      [{ role: 'user', content: [{ type: 'text', text: 'weather?' }] }] as any,
      'openai/gpt-5-nano',
      {},
      {
        mode: {
          type: 'regular',
          tools: [
            {
              type: 'function',
              name: 'getWeather',
              description: 'Get weather',
              inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          ],
          toolChoice: { type: 'tool', toolName: 'getWeather' },
        },
      } as any
    );

    expect(request.tools).toHaveLength(1);
    expect(request.tools[0].function.name).toBe('getWeather');
    expect(request.tool_choice).toEqual({
      type: 'function',
      function: { name: 'getWeather' },
    });
  });
});

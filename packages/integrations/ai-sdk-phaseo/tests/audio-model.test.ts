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

describe('Phaseo Vercel AI SDK audio compatibility', () => {
  it('maps experimental_generateSpeech responses from /audio/speech', async () => {
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

        return new Response(Uint8Array.from([1, 2, 3, 4]), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'x-request-id': 'req_speech_123',
          },
        });
      },
    });

    const { experimental_generateSpeech } = await import('ai');
    const result = await experimental_generateSpeech({
      model: phaseo.speechModel('openai/tts-1', { user: 'user_123' }),
      text: 'Hello from Phaseo',
      voice: 'alloy',
      speed: 1.25,
      outputFormat: 'mp3',
      instructions: 'Speak in a calm tone.',
    });

    expect(Array.from(result.audio.uint8Array)).toEqual([1, 2, 3, 4]);
    expect(result.audio.format).toBe('mp3');
    expect(result.providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_speech_123',
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://gateway.example/v1/audio/speech');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer test-key');
    expect(requests[0]?.body).toMatchObject({
      model: 'openai/tts-1',
      input: 'Hello from Phaseo',
      voice: 'alloy',
      speed: 1.25,
      response_format: 'mp3',
      instructions: 'Speak in a calm tone.',
      user: 'user_123',
    });
  });

  it('maps experimental_transcribe responses from /audio/transcriptions and uploads multipart audio', async () => {
    const requests: Array<{ url: string; body: FormData; headers: Headers }> = [];
    const phaseo = createPhaseo({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1',
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          body: init?.body as FormData,
          headers: new Headers(init?.headers),
        });

        return createJsonResponse({
          text: 'hello world',
          provider: 'openai',
          session_id: 'sess_transcribe_123',
          pricing_lines: [{ provider: 'openai', endpoint: 'audio/transcriptions' }],
          meta: {
            routing: {
              provider: 'openai',
              model: 'openai/whisper-1',
            },
          },
          language: 'en',
          duration: 1.5,
          segments: [
            {
              text: 'hello',
              start: 0,
              end: 0.5,
            },
            {
              text: 'world',
              start: 0.5,
              end: 1.5,
            },
          ],
        }, {
          headers: {
            'x-request-id': 'req_transcribe_123',
          },
        });
      },
    });

    const { experimental_transcribe } = await import('ai');
    const audioData = Uint8Array.from([10, 20, 30, 40]);
    const result = await experimental_transcribe({
      model: phaseo.transcriptionModel('openai/whisper-1', { user: 'user_123' }),
      audio: audioData,
      providerOptions: {
        openai: {
          language: 'en',
          temperature: 0,
        },
      },
    });

    expect(result.text).toBe('hello world');
    expect(result.language).toBe('en');
    expect(result.durationInSeconds).toBe(1.5);
    expect(result.providerMetadata).toEqual({
      'phaseo': {
        requestId: 'req_transcribe_123',
        provider: 'openai',
        sessionId: 'sess_transcribe_123',
        pricingLines: [{ provider: 'openai', endpoint: 'audio/transcriptions' }],
        routing: {
          provider: 'openai',
          model: 'openai/whisper-1',
        },
      },
    });
    expect(result.segments).toEqual([
      {
        text: 'hello',
        startSecond: 0,
        endSecond: 0.5,
      },
      {
        text: 'world',
        startSecond: 0.5,
        endSecond: 1.5,
      },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://gateway.example/v1/audio/transcriptions');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer test-key');

    const formData = requests[0]!.body;
    expect(formData.get('model')).toBe('openai/whisper-1');
    expect(formData.get('user')).toBe('user_123');
    expect(formData.get('language')).toBe('en');
    expect(formData.get('temperature')).toBe('0');
    const file = formData.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe('audio/wav');
  });
});

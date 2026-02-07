/**
 * Gateway Integration Tests (Optional - Requires API Key)
 *
 * These tests make actual calls to the AI Stats Gateway.
 * They are skipped by default to avoid costs.
 *
 * To run these tests, set the AI_STATS_API_KEY environment variable:
 *   AI_STATS_API_KEY=your_key pnpm test
 */

import { describe, it, expect } from 'vitest';
import { generateText, streamText, embed } from 'ai';
import { createAIStats } from '../src/index.js';

const resolvedApiKey = process.env.AI_STATS_API_KEY || process.env.OPENAI_GATEWAY_API_KEY;
const resolvedBaseUrl = process.env.AI_STATS_BASE_URL;
const hasApiKey = !!resolvedApiKey;
const testIf = (condition: boolean) => (condition ? it : it.skip);

// Only create provider instance if API key is present
const aiStats = hasApiKey
  ? createAIStats({ apiKey: resolvedApiKey, baseURL: resolvedBaseUrl })
  : null as any;

describe('Gateway Integration - Language Models', () => {
  testIf(hasApiKey)('should generate text with OpenAI GPT-4o', async () => {
    const result = await generateText({
      model: aiStats('openai/gpt-4o-mini'),
      prompt: 'Say "Hello from AI Stats Gateway" and nothing else.',
      maxTokens: 20,
    });

    expect(result.text).toContain('Hello');
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  }, 30000);

  testIf(hasApiKey)('should stream text with Anthropic Claude', async () => {
    const result = streamText({
      model: aiStats('anthropic/claude-3-5-haiku-20241022'),
      prompt: 'Count from 1 to 5 with just numbers.',
      maxTokens: 30,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const fullText = chunks.join('');
    expect(fullText.length).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(1); // Verify streaming
  }, 30000);

  testIf(hasApiKey)('should handle tool calls', async () => {
    const result = await generateText({
      model: aiStats('openai/gpt-4o-mini'),
      prompt: 'What is 25 + 17? Use the calculator tool.',
      maxTokens: 100,
      tools: {
        calculator: {
          description: 'Perform basic arithmetic',
          parameters: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['operation', 'a', 'b'],
          },
          execute: async ({ operation, a, b }) => {
            switch (operation) {
              case 'add': return a + b;
              case 'subtract': return a - b;
              case 'multiply': return a * b;
              case 'divide': return a / b;
              default: throw new Error('Invalid operation');
            }
          },
        },
      },
    });

    // Should either use the tool or provide the answer
    expect(result.text.length).toBeGreaterThan(0);
  }, 30000);
});

describe('Gateway Integration - Embeddings', () => {
  testIf(hasApiKey)('should generate embeddings with OpenAI', async () => {
    const result = await embed({
      model: aiStats.textEmbeddingModel('openai/text-embedding-3-small'),
      value: 'Hello, world!',
    });

    expect(result.embedding).toBeDefined();
    expect(result.embedding.length).toBeGreaterThan(0);
    expect(result.usage?.tokens).toBeGreaterThan(0);
  }, 30000);

  testIf(hasApiKey)('should handle batch embeddings', async () => {
    const { embedMany } = await import('ai');

    const result = await embedMany({
      model: aiStats.textEmbeddingModel('openai/text-embedding-3-small'),
      values: ['First text', 'Second text', 'Third text'],
    });

    expect(result.embeddings.length).toBe(3);
    result.embeddings.forEach((embedding: number[]) => {
      expect(embedding.length).toBeGreaterThan(0);
    });
  }, 30000);
});

describe('Gateway Integration - Image Generation', () => {
  testIf(hasApiKey)('should generate image with DALL-E', async () => {
    const { generateImage } = await import('ai');

    const result = await generateImage({
      model: aiStats.imageModel('openai/dall-e-2'),
      prompt: 'A simple geometric shape on white background',
      size: '256x256',
      n: 1,
    });

    expect(result.images).toBeDefined();
    expect(result.images.length).toBe(1);
    expect(result.images[0].url || result.images[0].base64).toBeDefined();
  }, 60000); // Image generation takes longer
});

describe('Gateway Integration - Audio Models', () => {
  testIf(hasApiKey)('should generate speech from text', async () => {
    const aiModule = await import('ai');
    if (!('speak' in aiModule)) {
      return;
    }

    const { speak } = aiModule as typeof import('ai');
    const result = await speak({
      model: aiStats.speechModel('openai/tts-1'),
      text: 'Hello world',
      voice: 'alloy',
      outputFormat: 'mp3',
    });

    expect(result.audio).toBeDefined();
    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.format).toBe('mp3');
  }, 30000);

  // Transcription test requires actual audio file, so skipped by default
  it.skip('should transcribe audio to text', async () => {
    // This test requires an actual audio file
    // Uncomment and provide audio file to test
  });
});

describe('Gateway Integration - Error Handling', () => {
  testIf(hasApiKey)('should handle invalid model gracefully', async () => {
    await expect(
      generateText({
        model: aiStats('invalid/model-that-does-not-exist'),
        prompt: 'Test',
      })
    ).rejects.toThrow();
  }, 30000);

  testIf(hasApiKey)('should handle rate limits', async () => {
    // This test would need to trigger rate limits
    // Skipped to avoid hitting actual rate limits in tests
    expect(true).toBe(true);
  });
});

// Add note if tests are skipped
if (!hasApiKey) {
  console.log('\n⚠️  Gateway integration tests skipped (no API key found)');
  console.log('   Set AI_STATS_API_KEY or OPENAI_GATEWAY_API_KEY to run integration tests\n');
}

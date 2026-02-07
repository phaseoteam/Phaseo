/**
 * AI Stats Gateway Provider for Vercel AI SDK
 *
 * @example Basic Usage
 * ```typescript
 * import { aiStats } from '@ai-stats/ai-sdk-provider';
 * import { generateText } from 'ai';
 *
 * const result = await generateText({
 *   model: aiStats('openai/gpt-4o'),
 *   prompt: 'Hello, world!',
 * });
 * ```
 *
 * @example Custom Configuration
 * ```typescript
 * import { createAIStats } from '@ai-stats/ai-sdk-provider';
 * import { streamText } from 'ai';
 *
 * const aiStats = createAIStats({
 *   apiKey: process.env.AI_STATS_API_KEY,
 *   baseURL: 'https://api.phaseo.app/v1',
 * });
 *
 * const { textStream } = await streamText({
 *   model: aiStats('anthropic/claude-3-5-sonnet'),
 *   prompt: 'Write a poem',
 * });
 * ```
 */

// Export main factory function
export { createAIStats } from './ai-stats-provider.js';

// Export types
export type { AIStatsSettings, AIStatsModelSettings } from './ai-stats-settings.js';

// Export models (for advanced usage)
export { AIStatsLanguageModel } from './ai-stats-language-model.js';
export { AIStatsEmbeddingModel } from './ai-stats-embedding-model.js';
export { AIStatsImageModel } from './ai-stats-image-model.js';
export { AIStatsTranscriptionModel } from './ai-stats-transcription-model.js';
export { AIStatsSpeechModel } from './ai-stats-speech-model.js';

// Create default instance using environment variable
import { createAIStats } from './ai-stats-provider.js';

/**
 * Default AI Stats provider instance.
 * Uses the AI_STATS_API_KEY environment variable for authentication.
 *
 * @example
 * ```typescript
 * import { aiStats } from '@ai-stats/ai-sdk-provider';
 * import { generateText } from 'ai';
 *
 * const result = await generateText({
 *   model: aiStats('openai/gpt-4o'),
 *   prompt: 'Hello!',
 * });
 * ```
 */
const resolvedApiKey = process.env.AI_STATS_API_KEY ?? process.env.OPENAI_GATEWAY_API_KEY;
const resolvedBaseUrl = process.env.AI_STATS_BASE_URL ?? process.env.OPENAI_GATEWAY_URL;

export const aiStats = resolvedApiKey
  ? createAIStats({ apiKey: resolvedApiKey, baseURL: resolvedBaseUrl })
  : ((() => {
      throw new Error(
        'AI Stats API key is required. ' +
          'Provide it via the apiKey option or set the AI_STATS_API_KEY environment variable.'
      );
    }) as unknown as ReturnType<typeof createAIStats>);

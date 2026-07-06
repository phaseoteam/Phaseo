/**
 * Phaseo Gateway Provider for Vercel AI SDK
 *
 * @example Basic Usage
 * ```typescript
 * import { phaseo } from '@phaseo/ai-sdk-provider';
 * import { generateText } from 'ai';
 *
 * const result = await generateText({
 *   model: phaseo('openai/gpt-4o'),
 *   prompt: 'Hello, world!',
 * });
 * ```
 *
 * @example Custom Configuration
 * ```typescript
 * import { createPhaseo } from '@phaseo/ai-sdk-provider';
 * import { streamText } from 'ai';
 *
 * const phaseo = createPhaseo({
 *   apiKey: process.env.PHASEO_API_KEY,
 *   baseURL: 'https://api.phaseo.app/v1',
 * });
 *
 * const { textStream } = streamText({
 *   model: phaseo('anthropic/claude-3-5-sonnet'),
 *   prompt: 'Write a poem',
 * });
 * ```
 */

// Export main factory function
export { createPhaseo } from './phaseo-provider.js';

// Export types
export type { PhaseoSettings, PhaseoModelSettings } from './phaseo-settings.js';

// Export models (for advanced usage)
export { PhaseoLanguageModel } from './phaseo-language-model.js';
export { PhaseoEmbeddingModel } from './phaseo-embedding-model.js';
export { PhaseoImageModel } from './phaseo-image-model.js';
export { PhaseoTranscriptionModel } from './phaseo-transcription-model.js';
export { PhaseoSpeechModel } from './phaseo-speech-model.js';

// Create default instance using environment variable
import { createPhaseo } from './phaseo-provider.js';

/**
 * Default Phaseo provider instance.
 * Uses the PHASEO_API_KEY environment variable for authentication.
 *
 * @example
 * ```typescript
 * import { phaseo } from '@phaseo/ai-sdk-provider';
 * import { generateText } from 'ai';
 *
 * const result = await generateText({
 *   model: phaseo('openai/gpt-4o'),
 *   prompt: 'Hello!',
 * });
 * ```
 */
const resolvedApiKey = process.env.PHASEO_API_KEY;
const resolvedBaseUrl = process.env.PHASEO_BASE_URL;

export const phaseo = resolvedApiKey
  ? createPhaseo({ apiKey: resolvedApiKey, baseURL: resolvedBaseUrl })
  : ((() => {
			throw new Error(
				'Phaseo API key is required. ' +
					'Provide it via the apiKey option or set the PHASEO_API_KEY environment variable.'
			);
    }) as unknown as ReturnType<typeof createPhaseo>);

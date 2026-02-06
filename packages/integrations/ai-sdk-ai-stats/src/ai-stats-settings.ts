/**
 * Configuration settings for the AI Stats provider
 */
export interface AIStatsSettings {
  /**
   * API key for authentication with the AI Stats Gateway.
   * If not provided, will use AI_STATS_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the AI Stats Gateway API.
   * @default "https://api.phaseo.app/v1"
   */
  baseURL?: string;

  /**
   * Additional headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation (useful for testing or proxying)
   */
  fetch?: typeof fetch;
}

/**
 * Model-specific settings that can be configured per-model
 */
export interface AIStatsModelSettings {
  /**
   * User identifier for tracking and analytics
   */
  user?: string;

  /**
   * Sampling temperature (0-2). Higher values make output more random.
   * @default undefined (provider default)
   */
  temperature?: number;

  /**
   * Nucleus sampling threshold (0-1). Alternative to temperature.
   * @default undefined (provider default)
   */
  topP?: number;

  /**
   * Top-K sampling threshold. Only sample from top K tokens.
   * @default undefined (provider default)
   */
  topK?: number;

  /**
   * Maximum number of tokens to generate
   * @default undefined (provider default)
   */
  maxTokens?: number;

  /**
   * Frequency penalty (-2.0 to 2.0). Positive values penalize new tokens based on frequency.
   * @default undefined (provider default)
   */
  frequencyPenalty?: number;

  /**
   * Presence penalty (-2.0 to 2.0). Positive values penalize new tokens based on presence.
   * @default undefined (provider default)
   */
  presencePenalty?: number;

  /**
   * Random seed for deterministic generation
   * @default undefined (non-deterministic)
   */
  seed?: number;
}

/**
 * Internal settings combining provider and model settings
 * @internal
 */
export interface AIStatsConfig extends Required<Pick<AIStatsSettings, 'apiKey' | 'baseURL'>> {
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

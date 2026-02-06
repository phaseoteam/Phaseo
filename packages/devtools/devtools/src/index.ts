/**
 * AI Stats Devtools
 *
 * Provides telemetry capture and debugging tools for AI Stats SDK.
 * Import this package to enable devtools in your application.
 *
 * @example Basic usage
 * ```typescript
 * import { AIStats } from '@ai-stats/sdk';
 * import { createAIStatsDevtools } from '@ai-stats/devtools';
 *
 * const client = new AIStats({
 *   apiKey: process.env.AI_STATS_API_KEY,
 *   devtools: createAIStatsDevtools()
 * });
 * ```
 *
 * @example With custom options
 * ```typescript
 * import { AIStats } from '@ai-stats/sdk';
 * import { createAIStatsDevtools } from '@ai-stats/devtools';
 *
 * const client = new AIStats({
 *   apiKey: process.env.AI_STATS_API_KEY,
 *   devtools: createAIStatsDevtools({
 *     directory: './my-devtools-data',
 *     flushIntervalMs: 2000,
 *     captureHeaders: true
 *   })
 * });
 * ```
 *
 * @example Environment variable control
 * ```typescript
 * // Enable via environment variable
 * // Set AI_STATS_DEVTOOLS=true in your environment
 * const client = new AIStats({
 *   apiKey: process.env.AI_STATS_API_KEY,
 *   devtools: createAIStatsDevtools()
 * });
 * ```
 */

import type { DevToolsConfig } from "@ai-stats/devtools-core";

/**
 * Creates a devtools configuration that enables telemetry capture for debugging.
 *
 * This function returns a configuration object that can be passed to the AIStats
 * constructor to enable automatic capture of all API requests and responses.
 * The captured data is stored locally and can be viewed using the devtools viewer.
 *
 * By default, devtools is enabled in development (NODE_ENV !== 'production') but
 * can be explicitly controlled via the AI_STATS_DEVTOOLS environment variable.
 *
 * @param options - Optional devtools configuration
 * @returns DevToolsConfig object to pass to AIStats constructor
 */
export function createAIStatsDevtools(options?: {
  /** Directory to store devtools data (default: .ai-stats-devtools) */
  directory?: string;
  /** How often to flush data to disk in ms (default: 1000) */
  flushIntervalMs?: number;
  /** Maximum queue size before forcing flush (default: 1000) */
  maxQueueSize?: number;
  /** Whether to capture HTTP headers (default: false) */
  captureHeaders?: boolean;
  /** Whether to save binary assets like images (default: true) */
  saveAssets?: boolean;
}): Partial<DevToolsConfig> {
  return {
    enabled: true,
    directory: options?.directory,
    flushIntervalMs: options?.flushIntervalMs,
    maxQueueSize: options?.maxQueueSize,
    captureHeaders: options?.captureHeaders,
    saveAssets: options?.saveAssets
  };
}

// Re-export devtools types and utilities for convenience
export type {
  DevToolsConfig,
  DevToolsEntry,
  SessionMetadata,
  Stats,
  EndpointType,
  SdkIdentifier,
  ErrorInfo,
  UsageInfo,
  CostInfo,
  Metadata
} from "@ai-stats/devtools-core";

export { DevToolsWriter, entriesToCSV } from "@ai-stats/devtools-core";

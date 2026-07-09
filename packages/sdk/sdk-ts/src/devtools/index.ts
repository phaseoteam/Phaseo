/**
 * Phaseo Devtools
 *
 * Provides telemetry capture and debugging tools for Phaseo SDK.
 * Import this package to enable devtools in your application.
 *
 * @example
 * ```typescript
 * import { Phaseo } from '@phaseo/sdk';
 * import { createPhaseoDevtools } from '@phaseo/devtools';
 *
 * const client = new Phaseo({
 *   apiKey: process.env.PHASEO_API_KEY,
 *   devtools: createPhaseoDevtools()
 * });
 * ```
 *
 * @example With custom options
 * ```typescript
 * const client = new Phaseo({
 *   apiKey: process.env.PHASEO_API_KEY,
 *   devtools: createPhaseoDevtools({
 *     directory: './my-devtools-data',
 *     flushIntervalMs: 2000,
 *     captureHeaders: true
 *   })
 * });
 * ```
 */

import type { DevToolsConfig } from "./core.js";

/**
 * Creates a devtools configuration that enables telemetry capture for debugging.
 *
 * This function returns a configuration object that can be passed to the Phaseo
 * constructor to enable automatic capture of all API requests and responses.
 * The captured data is stored locally and can be viewed using the devtools viewer.
 *
 * @param options - Optional devtools configuration
 * @returns DevToolsConfig object to pass to Phaseo constructor
 */
export function createPhaseoDevtools(options?: {
  /** Directory to store devtools data (default: .phaseo-devtools) */
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

// Re-export devtools types for convenience
export type {
  DevToolsConfig,
  DevToolsEntry,
  SessionMetadata,
  Stats,
  ProviderAttempt,
  Metadata,
  UsageInfo,
  CostInfo,
  ErrorInfo,
  EndpointType,
  SdkIdentifier,
} from "./core.js";

/**
 * Re-export the devtools viewer CLI
 * This allows users to run the devtools viewer directly from this package
 */
export { DevToolsWriter, entriesToCSV } from "./core.js";

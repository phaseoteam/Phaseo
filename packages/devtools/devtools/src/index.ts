/**
 * Phaseo Devtools
 *
 * Provides telemetry capture and debugging tools for Phaseo SDK.
 * Import this package to enable devtools in your application.
 *
 * @example Basic usage
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
 * import { Phaseo } from '@phaseo/sdk';
 * import { createPhaseoDevtools } from '@phaseo/devtools';
 *
 * const client = new Phaseo({
 *   apiKey: process.env.PHASEO_API_KEY,
 *   devtools: createPhaseoDevtools({
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
 * // Set PHASEO_DEVTOOLS=true in your environment
 * const client = new Phaseo({
 *   apiKey: process.env.PHASEO_API_KEY,
 *   devtools: createPhaseoDevtools()
 * });
 * ```
 */

import type { DevToolsConfig } from "@phaseo/devtools-core";

/**
 * Creates a devtools configuration that enables telemetry capture for debugging.
 *
 * This function returns a configuration object that can be passed to the Phaseo
 * constructor to enable automatic capture of all API requests and responses.
 * The captured data is stored locally and can be viewed using the devtools viewer.
 *
 * By default, devtools is enabled in development (NODE_ENV !== 'production') but
 * can be explicitly controlled via the PHASEO_DEVTOOLS environment variable.
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
  ProviderAttempt,
  Metadata
} from "@phaseo/devtools-core";

export { DevToolsWriter, entriesToCSV } from "@phaseo/devtools-core";

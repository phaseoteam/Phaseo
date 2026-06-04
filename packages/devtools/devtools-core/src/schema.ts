import { z } from "zod";

/**
 * Supported endpoint types across all AI Stats API endpoints
 */
export const EndpointTypeSchema = z.enum([
  "chat.completions",
  "messages",
  "images.generations",
  "images.edits",
  "audio.speech",
  "audio.transcriptions",
  "audio.translations",
  "video.generations",
  "video.list",
  "video.retrieve",
  "video.cancel",
  "music.generations",
  "music.retrieve",
  "embeddings",
  "ocr",
  "rerank",
  "moderations",
  "responses",
  "responses.websocket",
  "batches.create",
  "batches.retrieve",
  "batches.cancel",
  "files.list",
  "files.retrieve",
  "files.upload",
  "endpoints.list",
  "organisations.list",
  "pricing.models",
  "pricing.calculate",
  "key.current",
  "models.list",
  "models.data",
  "models.team",
  "providers",
  "providers.derank",
  "credits",
  "activity",
  "health",
  "analytics",
  "generations.retrieve",
  "provisioning.keys.list",
  "provisioning.keys.create",
  "provisioning.keys.get",
  "provisioning.keys.update",
  "provisioning.keys.delete",
  "provisioning.workspaces.list",
  "provisioning.workspaces.get",
  "provisioning.workspaces.create",
  "provisioning.workspaces.update",
  "provisioning.workspaces.delete",
  "agent.run",
  "agent.continue"
]);

export type EndpointType = z.infer<typeof EndpointTypeSchema>;

/**
 * SDK language/platform identifier
 */
export const SdkIdentifierSchema = z.enum([
  "typescript",
  "python",
  "go",
  "csharp",
  "ruby",
  "php",
  "java",
  "rust",
  "cpp"
]);

export type SdkIdentifier = z.infer<typeof SdkIdentifierSchema>;

/**
 * Error information when a request fails
 */
export const ErrorInfoSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  status: z.number().optional(),
  stack: z.string().optional()
});

export type ErrorInfo = z.infer<typeof ErrorInfoSchema>;

/**
 * Usage information (tokens, images, audio seconds, etc.)
 */
export const UsageInfoSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  images_generated: z.number().optional(),
  audio_seconds: z.number().optional(),
  video_seconds: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional()
});

export type UsageInfo = z.infer<typeof UsageInfoSchema>;

/**
 * Cost breakdown in USD
 */
export const CostInfoSchema = z.object({
  input_cost: z.number().optional(),
  output_cost: z.number().optional(),
  cache_creation_cost: z.number().optional(),
  cache_read_cost: z.number().optional(),
  total_cost: z.number()
});

export type CostInfo = z.infer<typeof CostInfoSchema>;

/**
 * Provider-level routing attempt metadata.
 * Shared across SDKs so the viewer can render multi-provider failover consistently.
 */
export const ProviderAttemptSchema = z.object({
  provider: z.string(),
  provider_label: z.string().optional(),
  request_id: z.string().optional(),
  status_code: z.number().optional(),
  status_text: z.string().optional(),
  outcome: z.string().optional(),
  duration_ms: z.number().optional(),
  latency_ms: z.number().optional(),
  generation_ms: z.number().optional(),
  throughput: z.number().optional(),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  error_code: z.string().optional(),
  error_message: z.string().optional()
});

export type ProviderAttempt = z.infer<typeof ProviderAttemptSchema>;

/**
 * Metadata about the API request
 */
export const MetadataSchema = z.object({
  sdk: SdkIdentifierSchema,
  sdk_version: z.string(),
  stream: z.boolean(),
  chunk_count: z.number().optional(),
  usage: UsageInfoSchema.optional(),
  cost: CostInfoSchema.optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  request_id: z.string().optional(),
  session_id: z.string().optional(),
  upstream_request_id: z.string().optional(),
  native_response_id: z.string().optional(),
  status_code: z.number().optional(),
  latency_ms: z.number().optional(),
  generation_ms: z.number().optional(),
  throughput: z.number().optional(),
  finish_reason: z.string().optional(),
  pricing_lines: z.array(z.any()).optional(),
  provider_attempts: z.array(ProviderAttemptSchema).optional(),
  agent_id: z.string().optional(),
  run_id: z.string().optional(),
  run_status: z.string().optional(),
  step_count: z.number().optional(),
  tool_count: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional()
});

export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Main telemetry entry - captures a single API request/response
 */
export const DevToolsEntrySchema = z.object({
  id: z.string(),
  type: EndpointTypeSchema,
  timestamp: z.number(),
  duration_ms: z.number(),
  request: z.record(z.string(), z.any()),
  response: z.record(z.string(), z.any()).nullable(),
  error: ErrorInfoSchema.nullable(),
  metadata: MetadataSchema
});

export type DevToolsEntry = z.infer<typeof DevToolsEntrySchema>;

/**
 * Configuration for devtools capture
 */
export const DevToolsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  directory: z.string().default(".ai-stats-devtools"),
  flushIntervalMs: z.number().default(1000),
  maxQueueSize: z.number().default(1000),
  captureHeaders: z.boolean().default(false),
  saveAssets: z.boolean().default(true)
});

export type DevToolsConfig = z.infer<typeof DevToolsConfigSchema>;

/**
 * Session metadata file structure
 */
export const SessionMetadataSchema = z.object({
  session_id: z.string(),
  started_at: z.number(),
  sdk: SdkIdentifierSchema,
  sdk_version: z.string(),
  platform: z.string().optional(),
  node_version: z.string().optional()
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * Stats aggregation for dashboard
 */
export const StatsSchema = z.object({
  total_requests: z.number(),
  total_errors: z.number(),
  total_cost: z.number(),
  total_tokens: z.number(),
  total_duration_ms: z.number(),
  by_endpoint: z.record(z.string(), z.object({
    count: z.number(),
    errors: z.number(),
    avg_duration_ms: z.number(),
    total_cost: z.number()
  })),
  by_model: z.record(z.string(), z.object({
    count: z.number(),
    tokens: z.number(),
    cost: z.number()
  }))
});

export type Stats = z.infer<typeof StatsSchema>;

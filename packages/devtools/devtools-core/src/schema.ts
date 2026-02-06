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
  "embeddings",
  "moderations",
  "responses",
  "batches.create",
  "batches.retrieve",
  "files.list",
  "files.retrieve",
  "files.upload",
  "models.list",
  "providers",
  "credits",
  "activity",
  "health",
  "analytics",
  "generations.retrieve",
  "provisioning.keys.list",
  "provisioning.keys.create",
  "provisioning.keys.get",
  "provisioning.keys.update",
  "provisioning.keys.delete"
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
  status_code: z.number().optional(),
  headers: z.record(z.string()).optional()
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
  request: z.record(z.any()),
  response: z.record(z.any()).nullable(),
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
  by_endpoint: z.record(z.object({
    count: z.number(),
    errors: z.number(),
    avg_duration_ms: z.number(),
    total_cost: z.number()
  })),
  by_model: z.record(z.object({
    count: z.number(),
    tokens: z.number(),
    cost: z.number()
  }))
});

export type Stats = z.infer<typeof StatsSchema>;

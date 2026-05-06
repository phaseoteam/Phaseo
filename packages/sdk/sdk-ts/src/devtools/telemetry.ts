import { DevToolsWriter, type DevToolsEntry, type EndpointType, type DevToolsConfig } from "./core.js";
import { randomUUID } from "crypto";

/**
 * Telemetry capture for TypeScript SDK
 * Captures API requests asynchronously with minimal performance impact
 */
export class TelemetryCapture {
  private readonly enabled: boolean;
  private readonly writer: DevToolsWriter;
  private readonly queue: DevToolsEntry[] = [];
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly sdkVersion: string;


  constructor(config?: Partial<DevToolsConfig>, sdkVersion: string = "2.0.3") {

    // Check if devtools is enabled via env var or config
    if (config?.enabled !== undefined) {
      this.enabled = config.enabled;
    } else if (process.env.AI_STATS_DEVTOOLS !== undefined) {
      this.enabled = process.env.AI_STATS_DEVTOOLS === "true";
    } else {
      // Opt-in only. Auto-enabling in local/dev keeps the process alive via timers.
      this.enabled = false;
    }
    this.sdkVersion = sdkVersion;

    if (!this.enabled) {
      this.writer = null as any; // Won't be used if disabled
      this.flushIntervalMs = 0;
      this.maxQueueSize = 0;
      return;
    }

    const directory = config?.directory ?? process.env.AI_STATS_DEVTOOLS_DIR ?? ".ai-stats-devtools";
    this.writer = new DevToolsWriter(directory);
    this.flushIntervalMs = config?.flushIntervalMs ?? 1000;
    this.maxQueueSize = config?.maxQueueSize ?? 1000;

    // Initialize directory structure
    this.writer.ensureDirectory();

    // Write session metadata
    this.writer.writeSessionMetadata({
      session_id: randomUUID(),
      started_at: Date.now(),
      sdk: "typescript",
      sdk_version: this.sdkVersion,
      platform: process.platform,
      node_version: process.version
    });

    // Start flush interval
    this.startFlushInterval();
  }

  /**
   * Capture a request/response pair
   * This is non-blocking and queues the entry for async persistence
   */
  capture(entry: Omit<DevToolsEntry, "metadata"> & { metadata: Partial<DevToolsEntry["metadata"]> }): void {
    if (!this.enabled) return;

    // Complete metadata
    const completeEntry: DevToolsEntry = {
      ...entry,
      metadata: {
        sdk: "typescript",
        sdk_version: this.sdkVersion,
        stream: false,
        ...entry.metadata
      }
    };

    // Add to queue
    this.queue.push(completeEntry);

    // Flush immediately if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.flushSync();
    }
  }

  /**
   * Helper to create a telemetry wrapper for a method
   */
  wrap<T>(
    type: EndpointType,
    fn: () => Promise<T>,
    getRequest: () => Record<string, any>,
    extractMetadata?: (response: T) => Partial<DevToolsEntry["metadata"]>
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const id = randomUUID();
    const startTime = Date.now();

    return fn()
      .then((response) => {
        const duration = Date.now() - startTime;

        this.capture({
          id,
          type,
          timestamp: startTime,
          duration_ms: duration,
          request: getRequest(),
          response: response as any,
          error: null,
          metadata: {
            ...extractMetadata?.(response)
          }
        });

        return response;
      })
      .catch((error) => {
        const duration = Date.now() - startTime;
        const errorResponse = extractErrorResponse(error);
        const errorMetadata = errorResponse && extractMetadata
          ? extractMetadata(errorResponse as T)
          : extractErrorMetadata(error, errorResponse);

        this.capture({
          id,
          type,
          timestamp: startTime,
          duration_ms: duration,
          request: getRequest(),
          response: errorResponse,
          error: {
            message: error instanceof Error ? error.message : String(error),
            code: (error as any).code,
            status: (error as any).status,
            stack: error instanceof Error ? error.stack : undefined
          },
          metadata: {
            ...errorMetadata
          }
        });

        throw error;
      });
  }

  /**
   * Helper for streaming requests
   * Returns [id, generator] where generator yields chunks and captures telemetry when done
   */
  async *wrapStream<T>(
    type: EndpointType,
    generator: AsyncGenerator<T>,
    getRequest: () => Record<string, any>,
    extractMetadata?: (chunks: T[]) => Partial<DevToolsEntry["metadata"]>
  ): AsyncGenerator<T> {
    if (!this.enabled) {
      yield* generator;
      return;
    }

    const id = randomUUID();
    const startTime = Date.now();
    const chunks: T[] = [];
    let error: Error | null = null;

    try {
      for await (const chunk of generator) {
        chunks.push(chunk);
        yield chunk;
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const errorResponse = error ? extractErrorResponse(error) : null;

      this.capture({
        id,
        type,
        timestamp: startTime,
        duration_ms: duration,
        request: getRequest(),
        response: error ? errorResponse : { chunks: chunks.length },
        error: error
          ? {
              message: error.message,
              code: (error as any).code,
              status: (error as any).status,
              stack: error.stack
            }
          : null,
        metadata: {
          stream: true,
          chunk_count: chunks.length,
          ...(error
            ? extractErrorMetadata(error, errorResponse)
            : extractMetadata?.(chunks))
        }
      });
    }
  }

  /**
   * Save a binary asset (image, audio, video)
   */
  async saveAsset(type: "images" | "audio" | "video", id: string, data: Blob | Buffer | ArrayBuffer): Promise<string> {
    if (!this.enabled) return "";
    return this.writer.saveAsset(type, id, data);
  }

  /**
   * Start periodic flush
   */
  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      this.flushSync();
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();

    // Ensure flush on process exit
    process.on("exit", () => this.flushSync());
    process.on("SIGINT", () => {
      this.flushSync();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      this.flushSync();
      process.exit(0);
    });
  }

  /**
   * Flush queued entries to disk
   */
  private flushSync(): void {
    if (this.queue.length === 0) return;

    const entries = [...this.queue];
    this.queue.length = 0; // Clear queue

    try {
      this.writer.writeEntries(entries);
    } catch (error) {
      console.error("[DevTools] Failed to flush telemetry:", error);
      // Re-add to queue on error
      this.queue.push(...entries);
    }
  }

  /**
   * Stop telemetry capture and flush remaining entries
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushSync();
  }
}

/**
 * Extract metadata from OpenAI-style chat completions response
 */
export function extractChatMetadata(response: any): Partial<DevToolsEntry["metadata"]> {
  const shared = extractGatewayMetadata(response);
  const finishReason = firstNonEmpty(
    response?.choices?.[0]?.finish_reason,
    response?.stop_reason,
    response?.finish_reason,
    response?.incomplete_details?.reason,
    response?.status
  );
  return {
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
          cache_creation_input_tokens: response.usage.prompt_tokens_details?.cached_tokens,
          cache_read_input_tokens: response.usage.prompt_tokens_details?.cached_tokens
        }
      : undefined,
    model: response.model,
    ...shared,
    finish_reason: finishReason,
    pricing_lines: shared.pricing_lines,
    provider_attempts: shared.provider_attempts
  };
}

/**
 * Extract metadata from images response
 */
export function extractImageMetadata(response: any): Partial<DevToolsEntry["metadata"]> {
  return {
    usage: {
      images_generated: response.data?.length || 0
    }
  };
}

/**
 * Extract metadata from video lifecycle responses.
 */
export function extractVideoMetadata(response: any): Partial<DevToolsEntry["metadata"]> {
  return {
    model: typeof response?.model === "string" ? response.model : undefined,
    ...extractGatewayMetadata(response)
  };
}

/**
 * Extract metadata from batch lifecycle responses.
 */
export function extractBatchMetadata(response: any): Partial<DevToolsEntry["metadata"]> {
  return {
    model: response?.model,
    ...extractGatewayMetadata(response)
  };
}

function extractErrorResponse(error: unknown): Record<string, any> | null {
  const body = (error as any)?.body;
  if (!body || typeof body !== "object") {
    return null;
  }
  return body as Record<string, any>;
}

function extractErrorMetadata(
  error: unknown,
  response: Record<string, any> | null
): Partial<DevToolsEntry["metadata"]> {
  const shared = extractGatewayMetadata(response);
  return {
    ...shared,
    status_code: asFiniteNumber((error as any)?.status) ?? shared.status_code,
    finish_reason: firstNonEmpty(
      response?.finish_reason,
      response?.error?.code,
      response?.error_code
    ),
    pricing_lines: shared.pricing_lines,
    provider_attempts: shared.provider_attempts
  };
}

export function extractGatewayMetadata(response: any): Partial<DevToolsEntry["metadata"]> {
  return {
    provider: firstNonEmpty(response?.provider, response?.error?.provider),
    request_id: firstNonEmpty(
      response?.request_id,
      response?.requestId,
      response?.metadata?.aistats_request_id
    ),
    session_id: firstNonEmpty(
      response?.session_id,
      response?.sessionId
    ),
    native_response_id: firstNonEmpty(
      response?.native_response_id,
      response?.nativeResponseId
    ),
    upstream_request_id: firstNonEmpty(
      response?.upstream_request_id,
      response?.upstreamRequestId
    ),
    status_code: asFiniteNumber(response?.status_code),
    latency_ms: asFiniteNumber(response?.latency_ms),
    generation_ms: asFiniteNumber(response?.generation_ms),
    throughput: asFiniteNumber(response?.throughput),
    pricing_lines: normalizePricingLines(
      response?.pricing_lines ?? response?.pricingLines
    ),
    provider_attempts: normalizeProviderAttempts(
      response?.provider_attempts ?? response?.providerAttempts
    )
  };
}

function normalizeProviderAttempts(value: unknown): DevToolsEntry["metadata"]["provider_attempts"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attempts = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const source = entry as Record<string, any>;
      const provider = firstNonEmpty(source.provider, source.provider_id, source.name);
      if (!provider) {
        return null;
      }
      return {
        provider,
        provider_label: firstNonEmpty(source.provider_label, source.providerName, source.provider_name),
        request_id: firstNonEmpty(source.request_id, source.requestId),
        status_code: asFiniteNumber(source.status_code ?? source.statusCode),
        status_text: firstNonEmpty(source.status_text, source.statusText),
        outcome: firstNonEmpty(source.outcome, source.result, source.status),
        duration_ms: asFiniteNumber(source.duration_ms ?? source.durationMs),
        latency_ms: asFiniteNumber(source.latency_ms ?? source.latencyMs),
        generation_ms: asFiniteNumber(source.generation_ms ?? source.generationMs),
        throughput: asFiniteNumber(source.throughput),
        started_at: asFiniteNumber(source.started_at ?? source.startedAt),
        completed_at: asFiniteNumber(source.completed_at ?? source.completedAt),
        error_code: firstNonEmpty(source.error_code, source.errorCode, source.code),
        error_message: firstNonEmpty(source.error_message, source.errorMessage, source.message, source.reason),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return attempts.length > 0 ? attempts : undefined;
}

function normalizePricingLines(value: unknown): DevToolsEntry["metadata"]["pricing_lines"] {
  return Array.isArray(value) ? value as DevToolsEntry["metadata"]["pricing_lines"] : undefined;
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

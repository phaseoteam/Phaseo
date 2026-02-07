import { DevToolsWriter, type DevToolsEntry, type EndpointType, type DevToolsConfig } from "@ai-stats/devtools-core";
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

  constructor(config?: Partial<DevToolsConfig>, sdkVersion: string = "0.2.1") {
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

        this.capture({
          id,
          type,
          timestamp: startTime,
          duration_ms: duration,
          request: getRequest(),
          response: null,
          error: {
            message: error instanceof Error ? error.message : String(error),
            code: (error as any).code,
            status: (error as any).status,
            stack: error instanceof Error ? error.stack : undefined
          },
          metadata: {}
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

      this.capture({
        id,
        type,
        timestamp: startTime,
        duration_ms: duration,
        request: getRequest(),
        response: error ? null : { chunks: chunks.length },
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
          ...extractMetadata?.(chunks)
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
    provider: (response as any).provider
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

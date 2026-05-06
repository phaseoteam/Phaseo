import { describe, expect, test } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats async job websocket helpers", () => {
  test("builds websocket URLs for async jobs from the configured base URL", () => {
    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test/v1",
    });

    expect(
      client.getAsyncJobWebSocketUrl("batch", "batch 123", {
        intervalMs: 1500,
        closeOnTerminal: false,
      }),
    ).toBe(
      "wss://example.test/v1/async/batch/batch%20123/ws?interval_ms=1500&close_on_terminal=false",
    );
  });

  test("exposes batch and video resource shortcuts", () => {
    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "http://localhost:8787/v1",
    });

    expect(client.batches.websocketUrl("batch_123")).toBe(
      "ws://localhost:8787/v1/async/batch/batch_123/ws",
    );
    expect(client.videos.websocketUrl("video_123", { closeOnTerminal: true })).toBe(
      "ws://localhost:8787/v1/async/video/video_123/ws?close_on_terminal=true",
    );
    expect(client.asyncJobs.websocketUrl("video", "video_123")).toBe(
      "ws://localhost:8787/v1/async/video/video_123/ws",
    );
  });
});

import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";
import type { AsyncWebhookPublicState, VideoBillingSummary, VideoStatusResponse } from "../src/index.js";

describe("Phaseo video helpers", () => {
  test("VideoStatusResponse exposes normalized async lifecycle fields", () => {
    expectTypeOf<VideoStatusResponse>().toHaveProperty("lifecycle_status").toEqualTypeOf<
      "pending" | "running" | "completed" | "failed" | "cancelled" | "expired" | undefined
    >();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("cancel_url").toEqualTypeOf<string | null | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("websocket_url").toEqualTypeOf<string | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("webhook").toEqualTypeOf<AsyncWebhookPublicState | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("billing").toEqualTypeOf<VideoBillingSummary | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("native_video_id").toEqualTypeOf<string | null | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("next_webhook_retry_at").toEqualTypeOf<string | null | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("last_webhook_progress").toEqualTypeOf<number | null | undefined>();
    expectTypeOf<VideoStatusResponse>().toHaveProperty("last_webhook_dispatched_at").toEqualTypeOf<string | null | undefined>();
  });

  test("preserves gateway video metadata through generateVideo and getVideo", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/data/models" && method === "GET") {
        return new Response(
          JSON.stringify({
            models: [{ model_id: "google/veo-3", status: "active" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url === "https://example.test/videos" && method === "POST") {
        expect(init?.body).toBeTruthy();
        const payload = JSON.parse(String(init.body));
        expect(payload.webhook).toEqual({
          url: "https://example.com/hooks/video",
          secret: "whsec_video",
          events: ["video.completed", "video.failed"],
        });
        return new Response(
          JSON.stringify({
            id: "G-ts-video-1",
            object: "video",
            status: "queued",
            polling_url: "https://example.test/videos/G-ts-video-1",
            websocket_url: "wss://example.test/v1/async/video/G-ts-video-1/ws",
            webhook: {
              url: "https://example.com/hooks/video",
              events: ["video.completed", "video.failed"],
              has_secret: true,
              delivery: {
                status: "pending",
                attempt_count: 0,
              },
            },
            provider: "google",
            model: "google/veo-3",
            request_id: "req_ts_video_1",
            session_id: "session_ts_video_1",
            generation_id: "req_ts_video_1",
            output_access: "both",
            billing: {
              charged: false,
            },
          }),
          {
            status: 202,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url === "https://example.test/videos/G-ts-video-1" && method === "GET") {
        return new Response(
          JSON.stringify({
            id: "G-ts-video-1",
            object: "video",
            status: "completed",
            polling_url: "https://example.test/videos/G-ts-video-1",
            websocket_url: "wss://example.test/v1/async/video/G-ts-video-1/ws",
            provider: "google",
            model: "google/veo-3",
            request_id: "req_ts_video_2",
            session_id: "session_ts_video_2",
            generation_id: "req_ts_video_1",
            output_access: "both",
            billing: {
              charged: true,
              cost_usd: 0.12,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      enableDeprecationWarnings: false,
    });

    const created = await client.generateVideo({
      model: "google/veo-3",
      prompt: "orbital reveal",
      webhook: {
        url: "https://example.com/hooks/video",
        secret: "whsec_video",
        events: ["video.completed", "video.failed"],
      },
    });
    const retrieved = await client.getVideo("G-ts-video-1");

    expect(created.provider).toBe("google");
    expect(created.request_id).toBe("req_ts_video_1");
    expect(created.session_id).toBe("session_ts_video_1");
    expect(created.generation_id).toBe("req_ts_video_1");
    expect(created.output_access).toBe("both");
    expect(created.websocket_url).toBe("wss://example.test/v1/async/video/G-ts-video-1/ws");
    expect(created.webhook).toMatchObject({
      url: "https://example.com/hooks/video",
      events: ["video.completed", "video.failed"],
      has_secret: true,
      delivery: {
        status: "pending",
        attempt_count: 0,
      },
    });
    expect(created.billing).toMatchObject({ charged: false });

    expect(retrieved.provider).toBe("google");
    expect(retrieved.request_id).toBe("req_ts_video_2");
    expect(retrieved.session_id).toBe("session_ts_video_2");
    expect(retrieved.generation_id).toBe("req_ts_video_1");
    expect(retrieved.output_access).toBe("both");
    expect(retrieved.websocket_url).toBe("wss://example.test/v1/async/video/G-ts-video-1/ws");
    expect(retrieved.billing).toMatchObject({ charged: true, cost_usd: 0.12 });
  });

  test("lists async video jobs through the helper surface", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      expect(method).toBe("GET");
      expect(url).toBe("https://example.test/videos?status=queued%2Ccompleted&limit=2");

      return new Response(
        JSON.stringify({
          object: "list",
          data: [
            {
              id: "G-ts-video-1",
              object: "video",
              status: "queued",
              polling_url: "https://example.test/videos/G-ts-video-1",
              websocket_url: "wss://example.test/v1/async/video/G-ts-video-1/ws",
              provider: "google",
            },
            {
              id: "G-ts-video-2",
              object: "video",
              status: "completed",
              polling_url: "https://example.test/videos/G-ts-video-2",
              websocket_url: "wss://example.test/v1/async/video/G-ts-video-2/ws",
              provider: "google",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listVideos({ status: "queued,completed", limit: 2 });

    expect(response.object).toBe("list");
    expect(response.data).toHaveLength(2);
    expect(response.data[0]?.id).toBe("G-ts-video-1");
    expect(response.data[0]?.websocket_url).toBe("wss://example.test/v1/async/video/G-ts-video-1/ws");
    expect(response.data[1]?.status).toBe("completed");
    expect(response.data[1]?.websocket_url).toBe("wss://example.test/v1/async/video/G-ts-video-2/ws");
  });

  test("serializes repeated video status filters from arrays", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/videos?status=completed&status=canceled&limit=5");
      expect(init?.method).toBe("GET");
      return new Response(
        JSON.stringify({
          object: "list",
          data: [],
          first_id: null,
          last_id: null,
          has_more: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;

    const client = new Phaseo({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listVideos({ status: ["completed", "canceled"], limit: 5 });

    expect(response.data).toEqual([]);
  });
});

import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats video helpers", () => {
  test("preserves gateway video metadata through generateVideo and getVideo", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();

      if (url === "https://example.test/models" && method === "GET") {
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
        return new Response(
          JSON.stringify({
            id: "G-ts-video-1",
            object: "video",
            status: "queued",
            polling_url: "https://example.test/videos/G-ts-video-1",
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

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      enableDeprecationWarnings: false,
    });

    const created = await client.generateVideo({
      model: "google/veo-3",
      prompt: "orbital reveal",
    });
    const retrieved = await client.getVideo("G-ts-video-1");

    expect(created.provider).toBe("google");
    expect(created.request_id).toBe("req_ts_video_1");
    expect(created.session_id).toBe("session_ts_video_1");
    expect(created.generation_id).toBe("req_ts_video_1");
    expect(created.output_access).toBe("both");
    expect(created.billing).toMatchObject({ charged: false });

    expect(retrieved.provider).toBe("google");
    expect(retrieved.request_id).toBe("req_ts_video_2");
    expect(retrieved.session_id).toBe("session_ts_video_2");
    expect(retrieved.generation_id).toBe("req_ts_video_1");
    expect(retrieved.output_access).toBe("both");
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
              provider: "google",
            },
            {
              id: "G-ts-video-2",
              object: "video",
              status: "completed",
              polling_url: "https://example.test/videos/G-ts-video-2",
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

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const response = await client.listVideos({ status: "queued,completed", limit: 2 });

    expect(response.object).toBe("list");
    expect(response.data).toHaveLength(2);
    expect(response.data[0]?.id).toBe("G-ts-video-1");
    expect(response.data[1]?.status).toBe("completed");
  });
});

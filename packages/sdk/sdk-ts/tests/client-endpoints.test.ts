import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats endpoints discovery helper", () => {
  test("calls /endpoints through listEndpoints", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/endpoints");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          endpoints: ["chat/completions", "responses", "files"],
          sample_models: ["openai/gpt-5-nano"],
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

    const response = await client.listEndpoints() as any;

    expect(response.ok).toBe(true);
    expect(response.endpoints).toEqual(["chat/completions", "responses", "files"]);
    expect(response.sample_models).toEqual(["openai/gpt-5-nano"]);
  });

  test("exposes high-level helpers for generated OCR, rerank, music, data-model, and provider derank operations", async () => {
    const seen: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      seen.push({ method, url, body });

      if (url === "https://example.test/ocr" && method === "POST") {
        return jsonResponse({ id: "ocr_1", model: body.model, text: "hello" });
      }
      if (url === "https://example.test/rerank" && method === "POST") {
        return jsonResponse({ id: "rerank_1", model: body.model, results: [] });
      }
      if (url === "https://example.test/music/generate" && method === "POST") {
        return jsonResponse({ id: "music_1", model: body.model, status: "queued" });
      }
      if (url === "https://example.test/music/generate/music_1" && method === "GET") {
        return jsonResponse({ id: "music_1", status: "completed" });
      }
      if (url.startsWith("https://example.test/data/models?") && method === "GET") {
        const parsedUrl = new URL(url);
        const modelId = parsedUrl.searchParams.get("model_id");
        if (modelId) {
          return jsonResponse({
            ok: true,
            models: [{ model_id: modelId, status: "active" }],
          });
        }
        return jsonResponse({ ok: true, models: [] });
      }
      if (url === "https://example.test/health/providers/openai/derank?window_hours=24" && method === "GET") {
        return jsonResponse({ ok: true, provider_id: "openai" });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    }) as unknown as typeof fetch;

    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
      fetchImpl,
      enableDeprecationWarnings: false,
    });

    await client.ocr.create({ model: "deepseek/deepseek-ocr", image: "data:image/png;base64,abc" } as any);
    await client.rerank.create({
      model: "voyage/rerank-2",
      query: "best",
      documents: ["a", "b"],
    });
    await client.music.create({ model: "minimax/music-2.6", prompt: "short theme" } as any);
    await client.music.get("music_1");
    await client.dataModels.list({ limit: 1 });
    await client.providers.derankStatus("openai", { window_hours: 24 });

    expect(seen.map((entry) => `${entry.method} ${entry.url}`)).toEqual([
      "GET https://example.test/data/models?model_id=deepseek%2Fdeepseek-ocr&limit=1",
      "POST https://example.test/ocr",
      "GET https://example.test/data/models?model_id=voyage%2Frerank-2&limit=1",
      "POST https://example.test/rerank",
      "GET https://example.test/data/models?model_id=minimax%2Fmusic-2.6&limit=1",
      "POST https://example.test/music/generate",
      "GET https://example.test/music/generate/music_1",
      "GET https://example.test/data/models?limit=1",
      "GET https://example.test/health/providers/openai/derank?window_hours=24",
    ]);
  });

  test("builds a Responses WebSocket URL", () => {
    const client = new AIStats({
      apiKey: "sk_test_123",
      baseUrl: "https://example.test",
    });

    expect(client.responses.websocketUrl({ model: "openai/gpt-5.4", sessionId: "session_1" })).toBe(
      "wss://example.test/responses/ws?model=openai%2Fgpt-5.4&session_id=session_1",
    );
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

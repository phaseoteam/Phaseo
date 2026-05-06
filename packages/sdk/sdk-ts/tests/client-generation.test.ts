import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats generation lookup helper", () => {
  test("surfaces replay metadata from /generations", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/generations?id=gen_123");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          request_id: "gen_123",
          provider: "openai",
          status_code: 200,
          replay_supported: true,
          replay_request: {
            model: "openai/gpt-5-nano",
            messages: [{ role: "user", content: "hello" }],
          },
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

    const response = await client.getGeneration("gen_123") as any;

    expect(response.request_id).toBe("gen_123");
    expect(response.replay_supported).toBe(true);
    expect(response.replay_request).toEqual({
      model: "openai/gpt-5-nano",
      messages: [{ role: "user", content: "hello" }],
    });
  });
});

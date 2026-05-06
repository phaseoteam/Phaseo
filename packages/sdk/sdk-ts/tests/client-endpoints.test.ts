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
});

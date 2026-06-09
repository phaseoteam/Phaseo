import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats team models discovery helper", () => {
  test("calls /models through listTeamModels", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/models");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.get("endpoints")).toBe("responses");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          limit: 2,
          models: [
            { id: "openai/gpt-5-mini", endpoints: ["responses"] },
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

    const response = await client.listTeamModels({
      limit: 2,
      endpoints: "responses",
    }) as any;

    expect(response.ok).toBe(true);
    expect(response.limit).toBe(2);
    expect(response.models[0].id).toBe("openai/gpt-5-mini");
  });
});

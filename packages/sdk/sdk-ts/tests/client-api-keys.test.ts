import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo API keys helper", () => {
  test("calls /keys through listApiKeys", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/keys");
      expect(url.searchParams.get("disabled")).toBe("true");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          object: "list",
          data: [
            { id: "key_123", status: "active" },
            { id: "key_456", status: "disabled" },
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

    const response = await client.listApiKeys({ disabled: true, limit: 2 }) as any;

    expect(response.object).toBe("list");
    expect(response.data).toHaveLength(2);
    expect(response.data[0].id).toBe("key_123");
    expect(response.data[1].status).toBe("disabled");
  });
});

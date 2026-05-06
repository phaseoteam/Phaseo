import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats single API key helper", () => {
  test("calls /keys/{id} through getApiKey", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/keys/key_123");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "key_123",
            hash: "keyhash_123",
            status: "active",
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

    const response = await client.getApiKey("key_123") as any;

    expect(response.data.id).toBe("key_123");
    expect(response.data.hash).toBe("keyhash_123");
    expect(response.data.status).toBe("active");
  });
});

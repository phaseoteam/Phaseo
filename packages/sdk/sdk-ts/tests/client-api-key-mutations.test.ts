import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats API key mutation helpers", () => {
  test("calls /keys through createApiKey", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/keys");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "Admin Key",
        scopes: ["gateway:read"],
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "key_123",
            name: "Admin Key",
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

    const response = await client.createApiKey({
      name: "Admin Key",
      scopes: ["gateway:read"],
    }) as any;

    expect(response.data.id).toBe("key_123");
    expect(response.data.name).toBe("Admin Key");
  });

  test("calls /keys/{id} through updateApiKey", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/keys/key_123");
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "Renamed Key",
        disabled: true,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "key_123",
            name: "Renamed Key",
            status: "disabled",
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

    const response = await client.updateApiKey("key_123", {
      name: "Renamed Key",
      disabled: true,
    }) as any;

    expect(response.data.id).toBe("key_123");
    expect(response.data.status).toBe("disabled");
  });

  test("calls /keys/{id} through deleteApiKey", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/keys/key_123");
      expect(init?.method).toBe("DELETE");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "key_123",
            deleted: true,
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

    const response = await client.deleteApiKey("key_123") as any;

    expect(response.data.id).toBe("key_123");
    expect(response.data.deleted).toBe(true);
  });
});

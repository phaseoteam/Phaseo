import { describe, expect, test, vi } from "vitest";
import { AIStats } from "../src/index.js";

describe("AIStats workspaces helpers", () => {
  test("calls /workspaces through listWorkspaces", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(`${url.origin}${url.pathname}`).toBe("https://example.test/workspaces");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.get("offset")).toBe("3");
      expect(init?.method).toBe("GET");
      return new Response(
        JSON.stringify({
          object: "list",
          data: [
            { id: "ws_123", slug: "default" },
            { id: "ws_456", slug: "sandbox" },
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

    const response = await client.listWorkspaces({ limit: 2, offset: 3 }) as any;

    expect(response.object).toBe("list");
    expect(response.data[0].id).toBe("ws_123");
    expect(response.data[1].slug).toBe("sandbox");
  });

  test("calls /workspaces/{id} through getWorkspace", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/workspaces/ws_123");
      expect(init?.method).toBe("GET");
      return new Response(
        JSON.stringify({
          data: {
            id: "ws_123",
            slug: "default",
            name: "Default Workspace",
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

    const response = await client.getWorkspace("ws_123") as any;

    expect(response.data.id).toBe("ws_123");
    expect(response.data.slug).toBe("default");
    expect(response.data.name).toBe("Default Workspace");
  });
});

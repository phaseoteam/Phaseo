import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

describe("Phaseo workspace mutation helpers", () => {
  test("calls /workspaces through createWorkspace", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/workspaces");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "Sandbox Workspace",
        slug: "sandbox",
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "ws_123",
            slug: "sandbox",
            name: "Sandbox Workspace",
          },
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

    const response = await client.createWorkspace({
      name: "Sandbox Workspace",
      slug: "sandbox",
    }) as any;

    expect(response.data.id).toBe("ws_123");
    expect(response.data.slug).toBe("sandbox");
  });

  test("calls /workspaces/{id} through updateWorkspace", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/workspaces/ws_123");
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "Renamed Workspace",
        archived: true,
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "ws_123",
            slug: "sandbox",
            name: "Renamed Workspace",
            archived: true,
          },
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

    const response = await client.updateWorkspace("ws_123", {
      name: "Renamed Workspace",
      archived: true,
    }) as any;

    expect(response.data.id).toBe("ws_123");
    expect(response.data.archived).toBe(true);
  });

  test("calls /workspaces/{id} through deleteWorkspace", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://example.test/workspaces/ws_123");
      expect(init?.method).toBe("DELETE");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test_123",
      });
      return new Response(
        JSON.stringify({
          data: {
            id: "ws_123",
            deleted: true,
          },
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

    const response = await client.deleteWorkspace("ws_123") as any;

    expect(response.data.id).toBe("ws_123");
    expect(response.data.deleted).toBe(true);
  });
});

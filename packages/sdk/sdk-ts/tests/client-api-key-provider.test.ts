import { describe, expect, test, vi } from "vitest";
import { Phaseo } from "../src/index.js";

function okResponse() {
  return new Response(JSON.stringify({ data: { id: "key_123" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function authorizationOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers.get("authorization");
}

describe("apiKey as a function", () => {
  test("asks for a fresh credential on every request", async () => {
    const seen: Array<string | null> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(authorizationOf(input, init));
      return okResponse();
    }) as unknown as typeof fetch;
    let issued = 0;
    const client = new Phaseo({
      apiKey: async () => `oidc-token-${++issued}`,
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await client.getApiKey("key_123");
    await client.getApiKey("key_123");

    expect(seen).toEqual(["Bearer oidc-token-1", "Bearer oidc-token-2"]);
  });

  test("covers requests made outside the generated client", async () => {
    const seen: Array<string | null> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(authorizationOf(input, init));
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: () => "sync-token", baseUrl: "https://example.test", fetchImpl });

    await client.streamContent("/files/file_1/content");

    expect(seen).toEqual(["Bearer sync-token"]);
  });

  test("keeps an Authorization header set for a scoped client", async () => {
    const seen: Array<string | null> = [];
    const provider = vi.fn(() => "workload-token");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(authorizationOf(input, init));
      return okResponse();
    }) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: provider, baseUrl: "https://example.test", fetchImpl });

    await client.withOptions({ headers: { Authorization: "Bearer explicit" } }).getApiKey("key_123");

    expect(seen).toEqual(["Bearer explicit"]);
    expect(provider).not.toHaveBeenCalled();
  });

  test("refuses an empty credential without sending the request", async () => {
    const fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: async () => "  ", baseUrl: "https://example.test", fetchImpl });

    await expect(client.getApiKey("key_123")).rejects.toThrow("empty credential");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("still accepts a plain API key string", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(authorizationOf(input, init)).toBe("Bearer sk_test_123");
      return okResponse();
    }) as unknown as typeof fetch;
    await new Phaseo({ apiKey: "sk_test_123", baseUrl: "https://example.test", fetchImpl }).getApiKey("key_123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

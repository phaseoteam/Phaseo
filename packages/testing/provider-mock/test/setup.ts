import { beforeAll } from "vitest";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

beforeAll(() => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw);
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error(`test_network_guard_blocked_external_request:${url.href}`);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

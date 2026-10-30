import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Phaseo, githubActionsToken, vercelToken } from "../src/index.js";

function jwt(expSeconds: number, id: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode({ exp: expSeconds, jti: id })}.sig`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const githubEnv = { ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.example/token?api-version=2.0", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token" };

afterEach(() => {
  vi.useRealTimers();
});

describe("githubActionsToken", () => {
  test("requests a token for Phaseo and reuses it until a minute before it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const now = Date.now() / 1000;
    const tokens = [jwt(now + 600, "a"), jwt(now + 1200, "b")];
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
      return json({ value: tokens[calls.length - 1] });
    }) as unknown as typeof fetch;
    const provider = githubActionsToken({ env: githubEnv, fetchImpl });

    expect(await provider()).toBe(tokens[0]);
    expect(await provider()).toBe(tokens[0]);
    expect(calls).toEqual([{ url: "https://pipelines.example/token?api-version=2.0&audience=https%3A%2F%2Fapi.phaseo.app", authorization: "bearer request-token" }]);

    vi.setSystemTime(Date.now() + 541_000);
    expect(await provider()).toBe(tokens[1]);
    expect(calls).toHaveLength(2);
  });

  test("does not cache a token without a readable expiry", async () => {
    const fetchImpl = vi.fn(async () => json({ value: "opaque" })) as unknown as typeof fetch;
    const provider = githubActionsToken({ env: { ...githubEnv, ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.example/token" }, fetchImpl });
    await provider();
    await provider();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe("https://pipelines.example/token?audience=https%3A%2F%2Fapi.phaseo.app");
  });

  test("explains the missing id-token permission", async () => {
    await expect(Promise.resolve(githubActionsToken({ env: {} })())).rejects.toThrow("id-token: write");
  });

  test("reports a failed token request without the tokens", async () => {
    const provider = githubActionsToken({ env: githubEnv, fetchImpl: (async () => json({}, 403)) as unknown as typeof fetch });
    await expect(Promise.resolve(provider())).rejects.toThrow("HTTP 403");
  });
});

describe("vercelToken", () => {
  test("exchanges the deployment token for a Phaseo token and caches it until near expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const expiry = Date.now() / 1000 + 600;
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://oidc.vercel.com/~token");
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      bodies.push(JSON.parse(String(init?.body)));
      return json({ token: `phaseo-${bodies.length}`, expiry });
    }) as unknown as typeof fetch;
    const provider = vercelToken({ env: { VERCEL_OIDC_TOKEN: " deployment " }, fetchImpl });

    expect(await provider()).toBe("phaseo-1");
    expect(await provider()).toBe("phaseo-1");
    expect(bodies).toEqual([{ token: "deployment", aud: "https://api.phaseo.app" }]);

    vi.setSystemTime(Date.now() + 541_000);
    expect(await provider()).toBe("phaseo-2");
  });

  test("prefers VERCEL_OIDC_TOKEN_FILE and an explicit token source", async () => {
    const dir = mkdtempSync(join(tmpdir(), "phaseo-vercel-"));
    const file = join(dir, "token");
    writeFileSync(file, "from-file\n");
    const sources: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sources.push(JSON.parse(String(init?.body)).token);
      return json({ token: "phaseo" });
    }) as unknown as typeof fetch;

    await vercelToken({ env: { VERCEL_OIDC_TOKEN_FILE: file, VERCEL_OIDC_TOKEN: "from-env" }, fetchImpl })();
    await vercelToken({ token: () => "from-header", env: { VERCEL_OIDC_TOKEN: "from-env" }, fetchImpl })();
    expect(sources).toEqual(["from-file", "from-header"]);
  });

  test("surfaces Vercel's error message and a missing source", async () => {
    const provider = vercelToken({ token: "deployment", fetchImpl: (async () => json({ error: "invalid audience" }, 400)) as unknown as typeof fetch });
    await expect(provider()).rejects.toThrow("Vercel OIDC token exchange failed: invalid audience");
    await expect(vercelToken({ env: {} })()).rejects.toThrow("VERCEL_OIDC_TOKEN");
  });

  test("works as a client's apiKey", async () => {
    const seen: Array<string | null> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://oidc.vercel.com/")) return json({ token: "phaseo-token" });
      seen.push(new Headers(init?.headers).get("authorization"));
      return json({ data: { id: "key_123" } });
    }) as unknown as typeof fetch;
    const client = new Phaseo({ apiKey: vercelToken({ token: "deployment", fetchImpl }), baseUrl: "https://example.test", fetchImpl });
    await client.getApiKey("key_123");
    expect(seen).toEqual(["Bearer phaseo-token"]);
  });
});

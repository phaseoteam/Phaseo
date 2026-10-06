// @effect-diagnostics globalFetch:off globalDate:off - Native loopback fixture uses real localhost callbacks and mocked token exchange.
import * as NodeCrypto from "node:crypto";
import { describe, expect, it, vi } from "vite-plus/test";
import { PHASEO_GATEWAY_ENDPOINT, signInPhaseo } from "./phaseoOAuth.ts";

const tokens = {
  access_token: "owned-fixture-key",
  token_type: "Bearer",
  expires_in: 3600,
  scope: "gateway:access models:read",
  resource: PHASEO_GATEWAY_ENDPOINT,
};
function callback(authorize: URL, state = authorize.searchParams.get("state")!) {
  const url = new URL(authorize.searchParams.get("redirect_uri")!);
  url.searchParams.set("code", "owned-code");
  url.searchParams.set("state", state);
  return url;
}

describe("Phaseo desktop OAuth", () => {
  it("binds the code to PKCE, the desktop client and gateway resource", async () => {
    let authorization!: URL;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokens)));
    const result = await signInPhaseo({
      signal: new AbortController().signal,
      fetcher,
      openBrowser: async (url) => {
        authorization = new URL(url);
        expect(authorization.searchParams.has("code_verifier")).toBe(false);
        const response = await fetch(callback(authorization));
        expect(response.status).toBe(200);
      },
    });
    const [url, request] = fetcher.mock.calls[0]!;
    const body = request.body as URLSearchParams;
    expect(url).toBe("https://api.phaseo.app/oauth/token");
    expect(request.redirect).toBe("error");
    expect(body.get("client_id")).toBe("phaseo_desktop");
    expect(body.get("code")).toBe("owned-code");
    expect(body.get("resource")).toBe(PHASEO_GATEWAY_ENDPOINT);
    expect(body.get("redirect_uri")).toBe(authorization.searchParams.get("redirect_uri"));
    expect(
      NodeCrypto.createHash("sha256").update(body.get("code_verifier")!).digest("base64url"),
    ).toBe(authorization.searchParams.get("code_challenge"));
    expect(result.key).toBe(tokens.access_token);
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects forged, duplicate and malformed callbacks without consuming the real callback", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(tokens)));
    await signInPhaseo({
      signal: new AbortController().signal,
      fetcher,
      openBrowser: async (value) => {
        const authorize = new URL(value);
        for (const state of ["wrong", "é".repeat(43)])
          expect((await fetch(callback(authorize, state))).status).toBe(400);
        const duplicate = callback(authorize);
        duplicate.searchParams.append("code", "second");
        expect((await fetch(duplicate)).status).toBe(400);
        expect((await fetch(callback(authorize), { method: "POST" })).status).toBe(400);
        expect((await fetch(callback(authorize))).status).toBe(200);
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels and closes the loopback listener without exchanging a code", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn();
    let url!: URL;
    await expect(
      signInPhaseo({
        signal: controller.signal,
        fetcher,
        openBrowser: async (value) => {
          url = callback(new URL(value));
          controller.abort();
        },
      }),
    ).rejects.toThrow("canceled");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(fetch(url)).rejects.toThrow();
  });
  it("rejects insufficient consent and mismatched resources", async () => {
    for (const invalid of [
      { ...tokens, scope: "models:read" },
      { ...tokens, resource: "https://another.example/v1" },
      { ...tokens, expires_in: -1 },
    ]) {
      await expect(
        signInPhaseo({
          signal: new AbortController().signal,
          fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid))),
          openBrowser: async (value) => {
            await fetch(callback(new URL(value)));
          },
        }),
      ).rejects.toThrow("invalid sign-in response");
    }
  });
  it("bounds the response and redacts malformed token bodies", async () => {
    for (const body of ["owned-sensitive-token", "x".repeat(65_537)])
      await expect(
        signInPhaseo({
          signal: new AbortController().signal,
          fetcher: vi.fn().mockResolvedValue(new Response(body)),
          openBrowser: async (value) => {
            await fetch(callback(new URL(value)));
          },
        }),
      ).rejects.toThrow("Phaseo returned an invalid sign-in response.");
  });
  it("handles browser failures and timeout without leaving a listener", async () => {
    await expect(
      signInPhaseo({
        signal: new AbortController().signal,
        openBrowser: async () => {
          throw new Error("Browser unavailable");
        },
      }),
    ).rejects.toThrow("Browser unavailable");
    await expect(
      signInPhaseo({
        signal: new AbortController().signal,
        timeoutMs: 25,
        openBrowser: async () => {},
      }),
    ).rejects.toThrow("timed out");
  });
});

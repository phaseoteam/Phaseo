// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off - Reused native PKCE/loopback boundary; its lifetime is interrupted by ProviderAuthFlow.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

export const PHASEO_DESKTOP_CLIENT_ID = "phaseo_desktop";
export const PHASEO_GATEWAY_ENDPOINT = "https://api.phaseo.app/v1";
const apiRoot = "https://api.phaseo.app";
const scopes = ["openid", "profile", "email", "gateway:access", "models:read"];

/** Authorization codes stay in main; only the final encrypted account reaches the renderer. */
export async function signInPhaseo({
  openBrowser,
  signal,
  fetcher = fetch,
  timeoutMs = 300_000,
}: {
  openBrowser: (url: string) => Promise<void>;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ key: string; expiresAt: string }> {
  if (signal.aborted) throw new Error("Sign-in canceled.");
  const verifier = NodeCrypto.randomBytes(32).toString("base64url");
  const state = NodeCrypto.randomBytes(32).toString("base64url");
  const challenge = NodeCrypto.createHash("sha256").update(verifier).digest("base64url");
  let redirectUri = "";
  let consumed = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const codeResult = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // A browser-launch failure can precede awaiting the callback promise.
  void codeResult.catch(() => {});
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
    rejectCode(new Error("Sign-in canceled."));
  };
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    controller.abort();
    rejectCode(new Error("Sign-in timed out. Try again."));
  }, timeoutMs);
  const server = NodeHttp.createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    let url: URL;
    try {
      if ((request.url?.length ?? 0) > 8192) throw new Error();
      url = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      response.writeHead(400);
      response.end("Invalid sign-in callback.");
      return;
    }
    if (!redirectUri) {
      response.writeHead(400);
      response.end("Invalid sign-in callback.");
      return;
    }
    const expectedHost = new URL(redirectUri).host;
    const returnedState = url.searchParams.get("state") ?? "";
    const returnedStateBytes = Buffer.from(returnedState);
    const expectedStateBytes = Buffer.from(state);
    const validState =
      returnedStateBytes.length === expectedStateBytes.length &&
      NodeCrypto.timingSafeEqual(returnedStateBytes, expectedStateBytes);
    if (
      request.method !== "GET" ||
      request.headers.host !== expectedHost ||
      url.pathname !== "/callback" ||
      consumed ||
      !validState ||
      url.searchParams.getAll("state").length !== 1
    ) {
      response.writeHead(400);
      response.end("Invalid sign-in callback.");
      return;
    }
    const code = url.searchParams.get("code");
    if (url.searchParams.has("error")) {
      consumed = true;
      response.writeHead(200);
      response.end("Sign-in canceled. Return to Phaseo.");
      rejectCode(new Error("Sign-in was declined."));
      return;
    }
    if (!code || code.length > 4096 || url.searchParams.getAll("code").length !== 1) {
      response.writeHead(400);
      response.end("Invalid sign-in callback.");
      return;
    }
    consumed = true;
    response.writeHead(200);
    response.end("Return to Phaseo to finish signing in.");
    resolveCode(code);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Could not start sign-in callback.");
    redirectUri = `http://127.0.0.1:${address.port}/callback`;
    if (signal.aborted || controller.signal.aborted) throw new Error("Sign-in canceled.");
    const authorize = new URL(`${apiRoot}/oauth/authorize`);
    authorize.search = new URLSearchParams({
      client_id: PHASEO_DESKTOP_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: PHASEO_GATEWAY_ENDPOINT,
    }).toString();
    await openBrowser(authorize.toString());
    const code = await codeResult;
    server.close();
    const response = await fetcher(`${apiRoot}/oauth/token`, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: PHASEO_DESKTOP_CLIENT_ID,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: PHASEO_GATEWAY_ENDPOINT,
      }),
    });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Phaseo desktop sign-in is not enabled on this server yet."
          : "Phaseo sign-in failed. Try again.",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Phaseo returned an invalid sign-in response.");
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65_536) {
          await reader.cancel();
          throw new Error("Phaseo returned an invalid sign-in response.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let tokens: Record<string, unknown>;
    try {
      tokens = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new Error("Phaseo returned an invalid sign-in response.");
    }
    if (!tokens || typeof tokens !== "object" || Array.isArray(tokens))
      throw new Error("Phaseo returned an invalid sign-in response.");
    if (
      typeof tokens.access_token !== "string" ||
      !tokens.access_token ||
      tokens.access_token.length > 10_000 ||
      tokens.token_type !== "Bearer" ||
      typeof tokens.expires_in !== "number" ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0 ||
      tokens.expires_in > 90 * 86400 ||
      tokens.resource !== PHASEO_GATEWAY_ENDPOINT ||
      typeof tokens.scope !== "string" ||
      !["gateway:access", "models:read"].every((scope) =>
        (tokens.scope as string).split(" ").includes(scope),
      )
    )
      throw new Error("Phaseo returned an invalid sign-in response.");
    if (controller.signal.aborted) throw new Error("Sign-in canceled.");
    return {
      key: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.abort();
    server.close();
    server.closeAllConnections();
  }
}

import type { ApiKeyProvider } from "./auth.js";

/** The audience Phaseo requires on trusted workload tokens. */
export const DEFAULT_WORKLOAD_AUDIENCE = "https://api.phaseo.app";

const VERCEL_EXCHANGE_URL = "https://oidc.vercel.com/~token";
const TIMEOUT_MS = 10_000;
const REFRESH_MARGIN_MS = 60_000;

type Env = Record<string, string | undefined>;

export type GitHubActionsTokenOptions = {
  audience?: string;
  /** For tests: replaces `fetch` and the environment. */
  fetchImpl?: typeof fetch;
  env?: Env;
};

export type VercelTokenOptions = {
  audience?: string;
  /**
   * The deployment's Vercel OIDC token, or a function returning it, such as the
   * request's `x-vercel-oidc-token` header. Defaults to `VERCEL_OIDC_TOKEN_FILE`'s
   * contents, then `VERCEL_OIDC_TOKEN`.
   */
  token?: string | (() => string | Promise<string>);
  /** For tests: replaces `fetch`, the environment and the exchange URL. */
  fetchImpl?: typeof fetch;
  env?: Env;
  exchangeUrl?: string;
};

function processEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

/** Reads a JWT's `exp` in milliseconds without checking its signature. */
function jwtExpiryMs(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    return typeof json.exp === "number" ? json.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function fresh(expiresAtMs: number | undefined): boolean {
  return expiresAtMs !== undefined && expiresAtMs - REFRESH_MARGIN_MS > Date.now();
}

async function readJson(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const data = await response.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns an `apiKey` function for GitHub Actions: it requests the job's OIDC token
 * for Phaseo and reuses it until a minute before it expires. The job needs
 * `permissions: id-token: write`.
 */
export function githubActionsToken(options: GitHubActionsTokenOptions = {}): ApiKeyProvider {
  const audience = options.audience ?? DEFAULT_WORKLOAD_AUDIENCE;
  let cached: { token: string; expiresAt?: number } | undefined;
  let pending: Promise<string> | undefined;

  async function fetchToken(): Promise<string> {
    const env = options.env ?? processEnv();
    const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!url || !requestToken) {
      throw new Error(
        "GitHub Actions OIDC is unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set. Give the job `permissions: id-token: write`.",
      );
    }
    const response = await (options.fetchImpl ?? fetch)(
      `${url}${url.includes("?") ? "&" : "?"}audience=${encodeURIComponent(audience)}`,
      { headers: { Authorization: `bearer ${requestToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!response.ok) throw new Error(`GitHub Actions OIDC token request failed with HTTP ${response.status}.`);
    const value = (await readJson(response))?.value;
    if (typeof value !== "string" || !value) throw new Error("GitHub Actions OIDC token response had no `value`.");
    cached = { token: value, expiresAt: jwtExpiryMs(value) };
    return value;
  }

  return () => {
    if (cached && fresh(cached.expiresAt)) return cached.token;
    pending ??= fetchToken().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}

/**
 * Returns an `apiKey` function for Vercel: it exchanges the deployment's OIDC token
 * for one issued to Phaseo and reuses it until a minute before it expires.
 */
export function vercelToken(options: VercelTokenOptions = {}): ApiKeyProvider {
  const audience = options.audience ?? DEFAULT_WORKLOAD_AUDIENCE;
  let cached: { source: string; token: string; expiresAt?: number } | undefined;

  async function sourceToken(): Promise<string> {
    if (options.token !== undefined) {
      const value = typeof options.token === "function" ? await options.token() : options.token;
      if (value?.trim()) return value.trim();
      throw new Error("The Vercel OIDC token is empty.");
    }
    const env = options.env ?? processEnv();
    const file = env.VERCEL_OIDC_TOKEN_FILE;
    if (file) {
      const fs = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule?.("node:fs/promises") as
        | { readFile(path: string, encoding: "utf8"): Promise<string> }
        | undefined;
      const value = (await fs?.readFile(file, "utf8"))?.trim();
      if (value) return value;
    }
    const value = env.VERCEL_OIDC_TOKEN?.trim();
    if (value) return value;
    throw new Error(
      "No Vercel OIDC token: pass `token` (for example the request's `x-vercel-oidc-token` header), or set VERCEL_OIDC_TOKEN. Enable OIDC in the Vercel project's settings.",
    );
  }

  return async () => {
    const source = await sourceToken();
    if (cached?.source === source && fresh(cached.expiresAt)) return cached.token;
    const response = await (options.fetchImpl ?? fetch)(options.exchangeUrl ?? VERCEL_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: source, aud: audience }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await readJson(response);
    if (!response.ok) {
      const detail = typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
      throw new Error(`Vercel OIDC token exchange failed: ${detail}`);
    }
    if (typeof data?.token !== "string" || !data.token) throw new Error("Vercel OIDC token exchange returned no token.");
    const expiresAt = typeof data.expiry === "number" ? data.expiry * 1000 : jwtExpiryMs(data.token);
    cached = { source, token: data.token, expiresAt };
    return data.token;
  };
}

/**
 * OAuth 2.1 (authorization code + PKCE) client for Phaseo.
 *
 * Endpoints come from the server's discovery document,
 * `${PHASEO_API_URL}/.well-known/oauth-authorization-server`, so nothing here
 * hard-codes Phaseo's OAuth paths.
 *
 * Third-party apps receive an opaque, user-funded Gateway key as the access
 * token (not a JWT) plus a refresh token. Every refresh rotates both, and
 * reusing an old refresh token ends the whole sign-in, so refreshes are
 * de-duplicated below.
 */

import { cookies } from 'next/headers';

/** Phaseo API origin. OAuth lives under `/oauth`, the Gateway under `/v1`. */
export const PHASEO_API_URL = (process.env.PHASEO_API_URL || 'https://api.phaseo.app')
  .replace(/\/+$/, '')
  .replace(/\/v1$/i, '');

/**
 * `gateway:access` lets the token call the Gateway and spend the chosen
 * workspace's credits; Phaseo requires it for third-party apps.
 * `openid email profile` let the app read who signed in from `/oauth/userinfo`.
 */
export const OAUTH_SCOPE = 'openid email profile gateway:access';

const VERIFIER_COOKIE = 'oauth_verifier';
const STATE_COOKIE = 'oauth_state';

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  /** Local: when the access token expires, in ms since the epoch. */
  expires_at: number;
}

export interface UserInfo {
  sub: string;
  email?: string | null;
  name?: string | null;
  workspace_id?: string | null;
}

interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  code_challenge_methods_supported?: string[];
  authorization_response_iss_parameter_supported?: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

function clientConfig() {
  return {
    clientId: requireEnv('PHASEO_OAUTH_CLIENT_ID'),
    // Confidential clients (the default in Settings > OAuth Apps) have a secret.
    // Public clients have none and authenticate with PKCE alone.
    clientSecret: process.env.PHASEO_OAUTH_CLIENT_SECRET?.trim() || null,
    redirectUri: requireEnv('PHASEO_OAUTH_REDIRECT_URI'),
  };
}

let metadataPromise: Promise<AuthorizationServerMetadata> | null = null;

export function getAuthorizationServerMetadata(): Promise<AuthorizationServerMetadata> {
  if (!metadataPromise) {
    metadataPromise = (async () => {
      const response = await fetch(`${PHASEO_API_URL}/.well-known/oauth-authorization-server`, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`OAuth discovery failed: ${response.status}`);
      }
      const metadata = (await response.json()) as AuthorizationServerMetadata;
      if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.issuer) {
        throw new Error('OAuth discovery document is missing required endpoints');
      }
      if (!metadata.code_challenge_methods_supported?.includes('S256')) {
        throw new Error('OAuth server does not advertise S256 PKCE');
      }
      return metadata;
    })().catch((error) => {
      // Retry discovery on the next call instead of caching the failure.
      metadataPromise = null;
      throw error;
    });
  }
  return metadataPromise;
}

export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const charsLength = chars.length;
  const unbiasedLimit = Math.floor(256 / charsLength) * charsLength;
  let output = '';

  while (output.length < length) {
    const randomValues = crypto.getRandomValues(new Uint8Array(Math.max(length, 32)));
    for (const value of randomValues) {
      if (value >= unbiasedLimit) continue;
      output += chars[value % charsLength];
      if (output.length >= length) break;
    }
  }

  return output;
}

function base64UrlEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('base64url');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(hash));
}

const transientCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 600,
  path: '/',
};

/**
 * Builds the authorize URL and stores the PKCE verifier and state in
 * short-lived httpOnly cookies for the callback.
 */
export async function generateAuthUrl(): Promise<string> {
  const { clientId, redirectUri } = clientConfig();
  const metadata = await getAuthorizationServerMetadata();

  // RFC 7636: 43-128 characters from the unreserved set.
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  const cookieStore = await cookies();
  cookieStore.set(VERIFIER_COOKIE, codeVerifier, transientCookie);
  cookieStore.set(STATE_COOKIE, state, transientCookie);

  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/**
 * Checks the callback's `state` (CSRF) and, when present, its `iss` (RFC 9207,
 * mix-up protection). Consumes the state and returns the PKCE verifier.
 */
export async function consumeAuthorizationResponse(
  state: string,
  iss: string | null,
): Promise<{ ok: true; codeVerifier: string } | { ok: false; error: string }> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(VERIFIER_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(VERIFIER_COOKIE);

  if (!storedState || storedState !== state) return { ok: false, error: 'State parameter mismatch' };
  if (!codeVerifier) return { ok: false, error: 'Missing PKCE code verifier' };

  const metadata = await getAuthorizationServerMetadata();
  if (metadata.authorization_response_iss_parameter_supported && iss !== metadata.issuer) {
    return { ok: false, error: 'Authorization response issuer mismatch' };
  }
  return { ok: true, codeVerifier };
}

/** POSTs a form to the token endpoint, authenticating with client_secret_basic when the app has a secret. */
async function postTokenRequest(params: Record<string, string>): Promise<OAuthTokens> {
  const { clientId, clientSecret } = clientConfig();
  const metadata = await getAuthorizationServerMetadata();

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  const body = new URLSearchParams({ ...params, client_id: clientId });
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const response = await fetch(metadata.token_endpoint, { method: 'POST', headers, body, cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const reason = payload?.error_description || payload?.error || response.statusText;
    throw new Error(`Token request failed (${response.status}): ${reason}`);
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    token_type: payload.token_type,
    scope: payload.scope,
    expires_at: Date.now() + Number(payload.expires_in ?? 0) * 1000,
  };
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokens> {
  const { redirectUri } = clientConfig();
  return postTokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
}

// Each refresh token works once; a second use revokes the sign-in. Parallel
// requests that all see an expired token share one refresh, and late requests
// still carrying the old cookie get the same result for a short while.
// This is per server process: run one instance, or move it to shared storage.
const inflightRefreshes = new Map<string, Promise<OAuthTokens>>();
const REFRESH_RESULT_TTL_MS = 60_000;

export function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const existing = inflightRefreshes.get(refreshToken);
  if (existing) return existing;

  const pending = postTokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  inflightRefreshes.set(refreshToken, pending);
  pending.then(
    () => setTimeout(() => inflightRefreshes.delete(refreshToken), REFRESH_RESULT_TTL_MS),
    () => inflightRefreshes.delete(refreshToken),
  );
  return pending;
}

/**
 * RFC 7009 revocation. Revoking the refresh token also revokes the delegated
 * key the access token belongs to, plus every refresh token from that sign-in.
 */
export async function revokeTokens(tokens: Pick<OAuthTokens, 'refresh_token' | 'access_token'>): Promise<void> {
  const metadata = await getAuthorizationServerMetadata();
  if (!metadata.revocation_endpoint) return;

  const token = tokens.refresh_token || tokens.access_token;
  const response = await fetch(metadata.revocation_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Token revocation failed: ${response.status}`);
  }
}

/** Reads the signed-in person from `/oauth/userinfo` (needs the `openid` scope). */
export async function fetchUserInfo(accessToken: string): Promise<UserInfo | null> {
  const metadata = await getAuthorizationServerMetadata();
  if (!metadata.userinfo_endpoint) return null;

  const response = await fetch(metadata.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return (await response.json()) as UserInfo;
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
  return Date.now() >= tokens.expires_at - 60_000;
}

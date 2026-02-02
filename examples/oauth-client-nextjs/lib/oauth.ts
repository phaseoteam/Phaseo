/**
 * OAuth 2.1 Utilities for AI Stats Integration
 *
 * Implements:
 * - PKCE challenge generation (RFC 7636)
 * - Authorization URL generation
 * - Token exchange
 * - Token refresh
 */

import { cookies } from 'next/headers';

// Environment variables
const OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET!;
const AISTATS_URL = process.env.NEXT_PUBLIC_AISTATS_URL!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI!;

// Types
export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  expires_at: number; // Unix timestamp
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues)
    .map(v => chars[v % chars.length])
    .join('');
}

/**
 * Base64-URL encode a buffer
 */
function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(hash);
}

/**
 * Generate PKCE challenge pair
 */
export async function generatePKCE(): Promise<PKCEChallenge> {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Store PKCE verifier in cookie for callback
 */
export function storeCodeVerifier(verifier: string, state: string): void {
  const cookieStore = cookies();

  // Store verifier with state as key (for validation)
  cookieStore.set('oauth_verifier', verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  // Store state for CSRF protection
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
}

/**
 * Retrieve and clear PKCE verifier
 */
export function getCodeVerifier(): string | null {
  const cookieStore = cookies();
  const verifier = cookieStore.get('oauth_verifier')?.value || null;

  if (verifier) {
    cookieStore.delete('oauth_verifier');
  }

  return verifier;
}

/**
 * Validate state parameter (CSRF protection)
 */
export function validateState(receivedState: string): boolean {
  const cookieStore = cookies();
  const storedState = cookieStore.get('oauth_state')?.value;

  if (!storedState || storedState !== receivedState) {
    return false;
  }

  // Clear state after validation
  cookieStore.delete('oauth_state');
  return true;
}

/**
 * Generate authorization URL with PKCE
 */
export async function generateAuthUrl(): Promise<string> {
  const pkce = await generatePKCE();
  const state = generateRandomString(32);

  // Store verifier and state for callback
  storeCodeVerifier(pkce.codeVerifier, state);

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: pkce.codeChallengeMethod,
  });

  return `${AISTATS_URL}/auth/v1/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const codeVerifier = getCodeVerifier();

  if (!codeVerifier) {
    throw new Error('Missing code verifier');
  }

  const response = await fetch(`${AISTATS_URL}/auth/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${error}`);
  }

  const tokens = await response.json();

  // Calculate expiration timestamp
  return {
    ...tokens,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const response = await fetch(`${AISTATS_URL}/auth/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${error}`);
  }

  const tokens = await response.json();

  // Calculate expiration timestamp
  return {
    ...tokens,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

/**
 * Check if access token is expired
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  // Add 60 second buffer before actual expiration
  return Date.now() >= (tokens.expires_at - 60000);
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken(tokens: OAuthTokens): Promise<string> {
  if (isTokenExpired(tokens)) {
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    // TODO: Store new tokens in session
    return newTokens.access_token;
  }

  return tokens.access_token;
}

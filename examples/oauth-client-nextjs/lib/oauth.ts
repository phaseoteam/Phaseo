/**
 * OAuth 2.1 Utilities for AI Stats Integration
 */

import { cookies } from 'next/headers';

const OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET!;
const AISTATS_URL = process.env.NEXT_PUBLIC_AISTATS_URL!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_REDIRECT_URI!;

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  expires_at: number;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues).map((v) => chars[v % chars.length]).join('');
}

function base64UrlEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

export async function generatePKCE(): Promise<PKCEChallenge> {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

export async function storeCodeVerifier(verifier: string, state: string): Promise<void> {
  const cookieStore = await cookies();
  const baseOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };

  cookieStore.set('oauth_verifier', verifier, baseOptions);
  cookieStore.set('oauth_state', state, baseOptions);
}

export async function getCodeVerifier(): Promise<string | null> {
  const cookieStore = await cookies();
  const verifier = cookieStore.get('oauth_verifier')?.value ?? null;
  if (verifier) cookieStore.delete('oauth_verifier');
  return verifier;
}

export async function validateState(receivedState: string): Promise<boolean> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get('oauth_state')?.value;
  if (!storedState || storedState !== receivedState) return false;
  cookieStore.delete('oauth_state');
  return true;
}

export async function generateAuthUrl(): Promise<string> {
  const pkce = await generatePKCE();
  const state = generateRandomString(32);
  await storeCodeVerifier(pkce.codeVerifier, state);

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

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const codeVerifier = await getCodeVerifier();
  if (!codeVerifier) throw new Error('Missing code verifier');

  const response = await fetch(`${AISTATS_URL}/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  return {
    ...tokens,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const response = await fetch(`${AISTATS_URL}/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${error}`);
  }

  const tokens = await response.json();
  return {
    ...tokens,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}

export function isTokenExpired(tokens: OAuthTokens): boolean {
  return Date.now() >= tokens.expires_at - 60_000;
}

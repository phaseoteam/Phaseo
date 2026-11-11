/**
 * Session storage using iron-session.
 *
 * OAuth tokens live only in an encrypted, httpOnly cookie and are never sent
 * to the browser in readable form.
 */

import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { OAuthTokens, UserInfo } from './oauth';

export interface SessionData {
  tokens?: OAuthTokens;
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
  workspaceId?: string;
}

function sessionOptions() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.');
  }
  return {
    password,
    cookieName: 'phaseo_session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

/**
 * Starts a session after sign-in. The access token is an opaque Gateway key,
 * not a JWT, so the person's identity comes from `/oauth/userinfo`.
 */
export async function startSession(tokens: OAuthTokens, userInfo: UserInfo | null): Promise<void> {
  const session = await getSession();
  session.tokens = tokens;
  session.user = userInfo
    ? {
        id: userInfo.sub,
        email: userInfo.email ?? undefined,
        name: userInfo.name ?? undefined,
      }
    : undefined;
  session.workspaceId = userInfo?.workspace_id ?? undefined;
  await session.save();
}

/** Replaces the token pair after a refresh, keeping the user details. */
export async function updateTokens(tokens: OAuthTokens): Promise<void> {
  const session = await getSession();
  session.tokens = tokens;
  await session.save();
}

export async function getTokens(): Promise<OAuthTokens | null> {
  const session = await getSession();
  return session.tokens || null;
}

export async function getUser(): Promise<SessionData['user'] | null> {
  const session = await getSession();
  return session.user || null;
}

export async function clearSession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokens();
  return !!tokens?.access_token;
}

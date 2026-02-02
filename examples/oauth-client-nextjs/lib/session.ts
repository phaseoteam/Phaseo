/**
 * Session Management using iron-session
 *
 * Securely stores OAuth tokens in encrypted httpOnly cookies
 */

import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { OAuthTokens } from './oauth';

// Session data structure
export interface SessionData {
  tokens?: OAuthTokens;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  teamId?: string;
}

// Session configuration
const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'aistats_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  },
};

/**
 * Get current session
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Store tokens in session
 */
export async function storeTokens(tokens: OAuthTokens): Promise<void> {
  const session = await getSession();
  session.tokens = tokens;

  // Decode JWT to extract user info (basic decoding, no signature verification needed here)
  try {
    const [, payload] = tokens.access_token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));

    session.user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.user_metadata?.name,
    };

    // Extract team_id if present
    if (decoded.team_id) {
      session.teamId = decoded.team_id;
    }
  } catch (error) {
    console.error('Failed to decode JWT:', error);
  }

  await session.save();
}

/**
 * Get tokens from session
 */
export async function getTokens(): Promise<OAuthTokens | null> {
  const session = await getSession();
  return session.tokens || null;
}

/**
 * Get user from session
 */
export async function getUser(): Promise<SessionData['user'] | null> {
  const session = await getSession();
  return session.user || null;
}

/**
 * Clear session (sign out)
 */
export async function clearSession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getTokens();
  return !!tokens?.access_token;
}

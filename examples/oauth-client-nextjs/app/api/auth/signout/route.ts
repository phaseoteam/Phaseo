/**
 * Sign out: revokes the sign-in at Phaseo, then clears the local session.
 *
 * Revoking the refresh token also revokes the app's delegated key for this
 * person and workspace, so the access token stops working at once.
 */

import { NextResponse } from 'next/server';
import { revokeTokens } from '@/lib/oauth';
import { clearSession, getTokens } from '@/lib/session';

export async function POST() {
  const tokens = await getTokens();
  let revoked = true;

  if (tokens) {
    try {
      await revokeTokens(tokens);
    } catch (error) {
      // Still end the local session, but say the token may remain valid at Phaseo.
      console.error('Token revocation failed:', error);
      revoked = false;
    }
  }

  try {
    await clearSession();
  } catch (error) {
    console.error('Sign out error:', error);
    return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, revoked });
}

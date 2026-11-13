/**
 * OAuth callback: checks state and issuer, then exchanges the code (with the
 * PKCE verifier) for tokens and starts the session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { consumeAuthorizationResponse, exchangeCodeForTokens, fetchUserInfo } from '@/lib/oauth';
import { startSession } from '@/lib/session';

function redirectWithError(request: NextRequest, error: string, description: string) {
  const url = new URL('/', request.url);
  url.search = new URLSearchParams({ error, error_description: description }).toString();
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // The person denied consent, or the server rejected the request.
  if (error) {
    return redirectWithError(request, error, searchParams.get('error_description') ?? '');
  }

  if (!code || !state) {
    return redirectWithError(request, 'invalid_request', 'Missing code or state');
  }

  try {
    const checked = await consumeAuthorizationResponse(state, searchParams.get('iss'));
    if (!checked.ok) {
      return redirectWithError(request, 'invalid_state', checked.error);
    }

    const tokens = await exchangeCodeForTokens(code, checked.codeVerifier);
    const userInfo = await fetchUserInfo(tokens.access_token).catch(() => null);
    await startSession(tokens, userInfo);

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (exchangeError) {
    console.error('Token exchange failed:', exchangeError);
    const message = exchangeError instanceof Error ? exchangeError.message : 'Unknown error';
    return redirectWithError(request, 'token_exchange_failed', message);
  }
}

/**
 * OAuth Callback Handler
 *
 * Receives authorization code from AI Stats and exchanges it for tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, validateState } from '@/lib/oauth';
import { storeTokens } from '@/lib/session';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/?error=${error}&error_description=${errorDescription}`, request.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/?error=invalid_request&error_description=Missing code or state', request.url)
    );
  }

  // Validate state parameter (CSRF protection)
  if (!validateState(state)) {
    return NextResponse.redirect(
      new URL('/?error=invalid_state&error_description=State parameter mismatch', request.url)
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens in encrypted session
    await storeTokens(tokens);

    // Redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Token exchange failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.redirect(
      new URL(`/?error=token_exchange_failed&error_description=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}

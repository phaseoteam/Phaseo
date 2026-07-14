/**
 * Chat Completion API Proxy
 *
 * Proxies chat requests to Phaseo gateway with OAuth token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTokens, updateTokens } from '@/lib/session';
import { isTokenExpired, refreshAccessToken } from '@/lib/oauth';

const GATEWAY_ORIGIN = (process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://api.phaseo.app').replace(/\/+$/, '');
const GATEWAY_BASE = /\/v1$/i.test(GATEWAY_ORIGIN) ? GATEWAY_ORIGIN : `${GATEWAY_ORIGIN}/v1`;

export async function POST(request: NextRequest) {
  try {
    // Get tokens from session
    let tokens = await getTokens();

    if (!tokens) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      try {
        tokens = await refreshAccessToken(tokens.refresh_token);
        await updateTokens(tokens);
      } catch (error) {
        return NextResponse.json(
          { error: 'Token refresh failed' },
          { status: 401 }
        );
      }
    }

    // Parse request body
    const body = await request.json();

    // Forward request to Phaseo gateway
    const response = await fetch(`${GATEWAY_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Handle streaming responses
    if (body.stream) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Handle non-streaming responses
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

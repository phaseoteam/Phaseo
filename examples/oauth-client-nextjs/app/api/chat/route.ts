/**
 * Chat Completions proxy: a fixed-path alternative to the catch-all proxy for
 * apps that only need `POST /v1/chat/completions`. The workbench UI uses
 * `/api/gateway/responses` instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGatewayAccessToken } from '@/lib/gateway';
import { PHASEO_API_URL } from '@/lib/oauth';

export async function POST(request: NextRequest) {
  let accessToken: string;
  try {
    accessToken = await getGatewayAccessToken();
  } catch (error) {
    const notSignedIn = error instanceof Error && error.message === 'AUTH_REQUIRED';
    return NextResponse.json({ error: notSignedIn ? 'not_authenticated' : 'token_refresh_failed' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${PHASEO_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'gateway_unreachable' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}

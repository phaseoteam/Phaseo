import { NextRequest, NextResponse } from 'next/server';
import { isTokenExpired, refreshAccessToken } from '@/lib/oauth';
import { getTokens, updateTokens } from '@/lib/session';

const DEFAULT_GATEWAY_ORIGIN = 'https://api.phaseo.app';
const GATEWAY_ORIGIN = (process.env.NEXT_PUBLIC_GATEWAY_URL || DEFAULT_GATEWAY_ORIGIN).replace(/\/+$/, '');
const GATEWAY_PATH_PREFIX = /\/v1$/i.test(GATEWAY_ORIGIN) ? '' : '/v1';

const ALLOWED_EXACT_SURFACES = new Set<string>([
  'health',
  'models',
  'providers',
  'generations',
  'chat/completions',
  'responses',
  'responses/ws',
  'messages',
  'embeddings',
  'moderations',
  'audio/speech',
  'audio/transcriptions',
  'audio/translations',
  'images/generations',
  'images/edits',
  'videos',
  'videos/models',
  'ocr',
  'music/generate',
  'files',
]);

const ALLOWED_PREFIX_SURFACES = ['videos/', 'music/generate/', 'control/', 'internal/'];

function normalizeSurface(segments: string[]): string | null {
  if (!segments.length) return null;

  const joined = segments
    .map((segment) => decodeURIComponent(segment).trim())
    .filter(Boolean)
    .join('/');

  if (!joined) return null;
  if (joined.includes('..')) return null;

  return joined;
}

function isAllowedSurface(surface: string): boolean {
  if (ALLOWED_EXACT_SURFACES.has(surface)) return true;
  return ALLOWED_PREFIX_SURFACES.some((prefix) => surface.startsWith(prefix));
}

async function getGatewayAccessToken(): Promise<string> {
  const tokens = await getTokens();
  if (!tokens) {
    throw new Error('AUTH_REQUIRED');
  }

  if (!isTokenExpired(tokens)) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  await updateTokens(refreshed);
  return refreshed.access_token;
}

function buildTargetUrl(request: NextRequest, surface: string): URL {
  const upstream = new URL(`${GATEWAY_ORIGIN}${GATEWAY_PATH_PREFIX}/${surface}`);
  upstream.search = request.nextUrl.search;
  return upstream;
}

function copyRequestHeaders(request: NextRequest, accessToken: string): Headers {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${accessToken}`);

  const passthroughHeaders = ['content-type', 'accept', 'accept-language'];
  for (const headerName of passthroughHeaders) {
    const value = request.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  const title = process.env.GATEWAY_APP_TITLE || 'AI Stats Gateway Integration Example';
  headers.set('x-title', title);

  const referer = process.env.GATEWAY_HTTP_REFERER || process.env.NEXT_PUBLIC_REDIRECT_URI;
  if (referer) {
    headers.set('http-referer', referer);
  }

  return headers;
}

function copyResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  const passthrough = [
    'content-type',
    'cache-control',
    'content-disposition',
    'x-request-id',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
  ];

  for (const name of passthrough) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

export async function proxyGatewayRequest(request: NextRequest, rawSurface: string[]): Promise<NextResponse> {
  const surface = normalizeSurface(rawSurface);
  if (!surface || !isAllowedSurface(surface)) {
    return NextResponse.json(
      {
        error: 'invalid_surface',
        message: `Surface "${surface ?? ''}" is not exposed by this example proxy.`,
      },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = await getGatewayAccessToken();
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'token_refresh_failed' }, { status: 401 });
  }

  const targetUrl = buildTargetUrl(request, surface);
  const headers = copyRequestHeaders(request, accessToken);

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const bytes = await request.arrayBuffer();
    body = bytes.byteLength > 0 ? bytes : undefined;
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'gateway_unreachable',
        message: error instanceof Error ? error.message : 'Network error',
      },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: copyResponseHeaders(upstream),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { isTokenExpired, PHASEO_API_URL, refreshAccessToken } from '@/lib/oauth';
import { getTokens, updateTokens } from '@/lib/session';

const GATEWAY_BASE = `${PHASEO_API_URL}/v1`;

// Only the Gateway paths the workbench calls. Every entry is a path the
// browser can reach with the signed-in person's key, so extend it deliberately.
const ALLOWED_EXACT_SURFACES = new Set<string>([
  'health',
  'models',
  'providers',
  'responses',
  'embeddings',
  'moderations',
  'images/generations',
  'videos',
  'ocr',
  'music/generate',
]);

// Status, content and cancel routes for the video and music jobs started above.
const ALLOWED_PREFIX_SURFACES = ['videos/', 'music/generate/'];

const SAFE_SEGMENT = /^[A-Za-z0-9._:-]+$/;

function normalizeSurface(segments: string[]): string | null {
  if (!segments.length) return null;

  let decoded: string[];
  try {
    decoded = segments.map((segment) => decodeURIComponent(segment).trim()).filter(Boolean);
  } catch {
    return null;
  }

  if (!decoded.length) return null;
  if (decoded.some((segment) => segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment))) return null;

  return decoded.join('/');
}

function isAllowedSurface(surface: string): boolean {
  if (ALLOWED_EXACT_SURFACES.has(surface)) return true;
  return ALLOWED_PREFIX_SURFACES.some((prefix) => surface.startsWith(prefix));
}

export async function getGatewayAccessToken(): Promise<string> {
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
  const upstream = new URL(`${GATEWAY_BASE}/${surface}`);
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

  const title = process.env.GATEWAY_APP_TITLE || 'Phaseo Gateway Integration Example';
  headers.set('x-title', title);

  const referer = process.env.GATEWAY_HTTP_REFERER;
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

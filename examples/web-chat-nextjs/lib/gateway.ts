const DEFAULT_GATEWAY_ORIGIN = 'https://api.phaseo.ai';

function gatewayOrigin() {
  return (process.env.NEXT_PUBLIC_GATEWAY_URL || DEFAULT_GATEWAY_ORIGIN).replace(/\/+$/, '');
}

function gatewayBase() {
  const origin = gatewayOrigin();
  return /\/v1$/i.test(origin) ? origin : `${origin}/v1`;
}

function apiKey() {
  const key = process.env.PHASEO_API_KEY;
  if (!key) {
    throw new Error('Missing PHASEO_API_KEY');
  }
  return key;
}

function buildHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${apiKey()}`);
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  headers.set('x-title', process.env.GATEWAY_APP_TITLE || 'Phaseo Web Chat Example');
  const referer = process.env.GATEWAY_HTTP_REFERER;
  if (referer) headers.set('http-referer', referer);
  return headers;
}

export async function getGatewayModels(): Promise<string[]> {
  const response = await fetch(`${gatewayBase()}/models`, {
    headers: buildHeaders({ Accept: 'application/json' }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Failed to fetch models (${response.status})`);
  }

  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models: string[] = [];
  for (const row of rows) {
    if (row && typeof row === 'object') {
      if (typeof row.id === 'string') models.push(row.id);
      if (typeof row.model_id === 'string') models.push(row.model_id);
      if (typeof row.model === 'string') models.push(row.model);
    }
  }

  return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
}

export async function createResponse(body: Record<string, unknown>) {
  const response = await fetch(`${gatewayBase()}/responses`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

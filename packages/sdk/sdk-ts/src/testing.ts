export type Fixture = {
  method: string;
  path: string;
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: string;
};

/** Strict, ordered fixtures. Unexpected calls fail locally and never reach a provider. */
export function createMockTransport(fixtures: readonly Fixture[]) {
  let position = 0;
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const fixture = fixtures[position++];
    const path = new URL(request.url).pathname;
    if (!fixture || fixture.method.toUpperCase() !== request.method || fixture.path !== path) throw new Error(`Unexpected mock request: ${request.method} ${path}`);
    const raw = await request.text();
    let body: unknown = raw;
    try { body = JSON.parse(raw); } catch { /* Binary/plain text requests stay strings. */ }
    requests.push({ method: request.method, url: request.url, body });
    return new Response(fixture.body ?? (fixture.json === undefined ? null : JSON.stringify(fixture.json)), {
      status: fixture.status ?? 200,
      headers: { ...(fixture.json === undefined ? {} : { "content-type": "application/json" }), ...fixture.headers },
    });
  };
  return { fetchImpl, requests, assertDone() { if (position !== fixtures.length) throw new Error(`${fixtures.length - position} mock requests unused`); } };
}

export function jobFixtures(path: string, id: string, outcome: "completed" | "failed" = "completed"): Fixture[] {
  return [
    { method: "POST", path, json: { id, status: "queued" } },
    { method: "GET", path: `${path}/${encodeURIComponent(id)}`, json: { id, status: "running" } },
    { method: "GET", path: `${path}/${encodeURIComponent(id)}`, json: { id, status: outcome } },
  ];
}

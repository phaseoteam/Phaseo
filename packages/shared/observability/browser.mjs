// Rebuild browser signals from an allowlist, including nested span attributes.
const STATIC_SEGMENTS = new Set(['', 'api', '_web', 'v1', 'chat', 'account', 'settings', 'dashboard', 'models', 'providers', 'login', 'signup', 'auth', 'callback', 'usage', 'keys', 'billing', 'workspaces', 'health', 'responses', 'messages', 'completions', 'images', 'audio', 'videos', 'embeddings', 'moderations', 'rerank', 'profile', 'privacy', 'terms', 'docs']);
export function privatePath(value) {
  try {
    const url = new URL(value, 'https://phaseo.app');
    return url.pathname.split('/').map(part => STATIC_SEGMENTS.has(part) ? part : ':id').join('/');
  } catch { return '/unknown'; }
}
export function browserCollector(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^faro-collector-[a-z0-9-]+\.grafana\.net$/.test(url.hostname)
      && /^\/collect\/[a-zA-Z0-9_-]+$/.test(url.pathname) && !url.username && !url.password && !url.port && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
const safeName = value => /^[a-zA-Z][a-zA-Z0-9_. -]{0,79}$/.test(value ?? '') ? value : 'Error';
export function sanitizeFaroItem(item) {
  const source = item.payload;
  const meta = {
    app: item.meta.app,
    sdk: item.meta.sdk,
    session: item.meta.session?.id ? { id: item.meta.session.id, attributes: { isSampled: item.meta.session.attributes?.isSampled } } : undefined,
    page: { url: privatePath(item.meta.page?.url ?? '/') },
    browser: item.meta.browser ? { name: item.meta.browser.name, version: item.meta.browser.version, mobile: item.meta.browser.mobile } : undefined,
  };
  let payload;
  switch (item.type) {
    case 'exception':
      payload = {
        timestamp: source.timestamp, type: safeName(source.type), value: 'Client error',
        fatal: source.fatal, trace: source.trace,
        stacktrace: { frames: (source.stacktrace?.frames ?? []).slice(0, 12).map(frame => ({
          // Keep bundle paths for private source map resolution, remove query/fragment.
          filename: (() => { try {
            const url = new URL(frame.filename);
            return (url.hostname === 'phaseo.app' || url.hostname.endsWith('.phaseo.app') || url.hostname.endsWith('.vercel.app'))
              && /^\/(?:assets|_next\/static)\/[a-zA-Z0-9/_.-]+\.js$/.test(url.pathname) ? `${url.origin}${url.pathname}` : '[source]';
          } catch { return '[source]'; } })(),
          function: '[frame]', lineno: frame.lineno, colno: frame.colno,
        })) },
      };
      break;
    case 'measurement':
      payload = { timestamp: source.timestamp, type: safeName(source.type), values: Object.fromEntries(
        Object.entries(source.values ?? {}).filter(([key, value]) => /^[a-zA-Z0-9_.-]{1,64}$/.test(key) && typeof value === 'number' && Number.isFinite(value))
      ) };
      break;
    case 'event':
      if (!['session_start', 'session_resume', 'session_extend', 'view_changed', 'navigation', 'route_change'].includes(source.name)) return null;
      payload = { timestamp: source.timestamp, name: source.name, domain: 'phaseo', attributes: { path: privatePath(item.meta.page?.url ?? '/') } };
      break;
    case 'trace':
      payload = { resourceSpans: (source.resourceSpans ?? []).map(resource => ({
        resource: { attributes: (resource.resource?.attributes ?? []).filter(attr => ['service.name', 'service.version', 'deployment.environment.name'].includes(attr.key)) },
        scopeSpans: (resource.scopeSpans ?? []).map(scope => ({ scope: scope.scope, spans: (scope.spans ?? []).slice(0, 32).map(span => ({
          traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId, kind: span.kind,
          name: 'HTTP browser request', startTimeUnixNano: span.startTimeUnixNano, endTimeUnixNano: span.endTimeUnixNano,
          status: { code: span.status?.code ?? 0 },
          attributes: (span.attributes ?? []).filter(attr => ['http.method', 'http.request.method', 'http.status_code', 'http.response.status_code'].includes(attr.key)),
        })) })),
      })) };
      break;
    default: return null;
  }
  const result = { type: item.type, meta, payload };
  return new TextEncoder().encode(JSON.stringify(result)).byteLength <= 32768 ? result : null;
}

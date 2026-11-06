// Runtime-neutral, bounded OTLP transport. No persistent timers or isolate counters.
const FIELDS = new Set([
  'event_name', 'event_id', 'request_id', 'trace_id', 'span_id', 'route', 'method',
  'modality', 'stream', 'status_code', 'outcome', 'error_origin', 'error_kind',
  'actionable', 'error_code', 'error_name', 'error_digest', 'error_stack',
  'provider', 'model', 'duration_ms', 'ttft_ms', 'provider_ttft_ms', 'attempt_count',
  'attempt_number', 'retryable', 'disconnected', 'job', 'scheduled_at', 'success_at',
  'pending_count', 'oldest_pending_seconds', 'failed_count', 'processed_count',
  'reason', 'signal', 'release', 'sample_rate', 'attempts_truncated',
]);

export function environmentName(value) {
  const name = String(value ?? '').trim().toLowerCase();
  return name === 'prod' ? 'production' : name || 'development';
}

export function telemetryConfig(bindings, service) {
  return {
    enabled: bindings.PLATFORM_TELEMETRY_ENABLED === 'true',
    endpoint: bindings.GRAFANA_OTLP_ENDPOINT,
    authorization: bindings.GRAFANA_OTLP_AUTHORIZATION,
    environment: environmentName(bindings.ENV ?? bindings.PHASEO_ENV ?? bindings.VERCEL_ENV ?? bindings.NODE_ENV),
    service,
    region: bindings.GATEWAY_ROUTING_REGION ?? bindings.VERCEL_REGION ?? 'global',
    release: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? bindings.PUBLIC_RELEASE ?? bindings.VERCEL_GIT_COMMIT_SHA ?? bindings.NEXT_PUBLIC_RELEASE,
  };
}

export function telemetryEndpoint(config, signal) {
  if (!config.enabled || !['production', 'staging'].includes(config.environment)) return null;
  if (!/^Basic [A-Za-z0-9+/]+=*$/.test(config.authorization ?? '')) return null;
  try {
    const url = new URL(config.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !/^otlp-gateway-[a-z0-9-]+\.grafana\.net$/.test(url.hostname) || url.port) return null;
    const base = url.pathname.replace(/\/v1\/(logs|traces|metrics)\/?$/, '').replace(/\/$/, '');
    if (base !== '/otlp') return null;
    return `${url.origin}${base}/v1/${signal}`;
  } catch { return null; }
}

export function sampled(key, rate = 0.05) {
  const limit = Number(rate);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  if (limit >= 1) return true;
  let hash = 2166136261;
  for (const char of String(key)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296 < limit;
}

export function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, value => value.toString(16).padStart(2, '0')).join('');
}

export function traceContext(header) {
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i.exec(header ?? '');
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), traceFlags: parseInt(match[3], 16) & 1 };
}

export function safeEvent(event) {
  const result = {};
  for (const [key, value] of Object.entries(event)) {
    if (!FIELDS.has(key) || value == null) continue;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[key] = value;
    else if (typeof value === 'string') {
      result[key] = value.replace(/Bearer\s+\S+|Basic\s+\S+|(?:sk-|xaat-)[A-Za-z0-9_-]+/gi, '[redacted]')
        .slice(0, key === 'error_stack' ? 1600 : 160);
    }
  }
  return result;
}

export function logPayload(config, events, now = Date.now()) {
  const attributes = [
    ['service.name', config.service], ['service.namespace', 'phaseo'],
    ['deployment.environment.name', config.environment], ['cloud.region', config.region],
    ['service.version', config.release],
  ].filter(([, value]) => value).map(([key, value]) => ({ key, value: { stringValue: String(value) } }));
  const timeUnixNano = String(BigInt(Math.floor(now)) * 1000000n);
  const logRecords = events.slice(0, 32).map(event => {
    const fields = safeEvent(event);
    const body = { ...fields, environment: config.environment, schema_version: 1, timestamp: new Date(now).toISOString() };
    const record = {
      timeUnixNano, observedTimeUnixNano: timeUnixNano,
      severityNumber: fields.outcome === 'error' ? 17 : 9,
      severityText: fields.outcome === 'error' ? 'ERROR' : 'INFO',
      body: { stringValue: JSON.stringify(body) },
      attributes: [{ key: 'event.name', value: { stringValue: fields.event_name ?? 'unknown' } }],
    };
    if (/^[a-f0-9]{32}$/.test(fields.trace_id ?? '')) record.traceId = fields.trace_id;
    if (/^[a-f0-9]{16}$/.test(fields.span_id ?? '')) record.spanId = fields.span_id;
    return record;
  });
  return { resourceLogs: [{ resource: { attributes }, scopeLogs: [{ scope: { name: 'phaseo.platform', version: '1.0.0' }, logRecords }] }] };
}

export async function sendOtlp(config, signal, payload, fetcher = fetch) {
  const endpoint = telemetryEndpoint(config, signal);
  if (!endpoint) return { state: 'disabled' };
  try {
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > 128 * 1024) return { state: 'failed', reason: 'payload_limit' };
    const response = await fetcher(endpoint, {
      method: 'POST', headers: { Authorization: config.authorization, 'Content-Type': 'application/json' },
      // Workers supports manual redirects; never forward ingest credentials.
      body, signal: AbortSignal.timeout(1500), redirect: 'manual',
    });
    // Never print remote bodies or authorization values, and never retry per request.
    if (!response.ok) { await response.body?.cancel(); return { state: 'failed', reason: `http_${response.status}` }; }
    // A successful HTTP response can still reject some records/spans.
    const reader = response.body?.getReader();
    let text = '';
    let bytes = 0;
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4096) { await reader.cancel(); return { state: 'failed', reason: 'response_limit' }; }
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    text += decoder.decode();
    if (text.trim()) {
      const result = JSON.parse(text);
      const rejected = Number(result.partialSuccess?.rejectedLogRecords ?? result.partialSuccess?.rejectedSpans ?? 0);
      if (rejected > 0) return { state: 'failed', reason: 'partial_rejection' };
    }
    return { state: 'delivered' };
  } catch { return { state: 'failed', reason: 'transport_error' }; }
}

export function emitLogs(config, events, fetcher) {
  if (!telemetryEndpoint(config, 'logs') || !events.length) return Promise.resolve({ state: 'disabled' });
  return sendOtlp(config, 'logs', logPayload(config, events), fetcher);
}

export function safeError(error) {
  // Error messages can contain customer input. Keep type, digest and source frames only.
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$|^Error$/.test(error.name) ? error.name : 'UnknownError';
  const digest = error && typeof error === 'object' && /^[a-zA-Z0-9_-]{1,64}$/.test(error.digest ?? '') ? error.digest : undefined;
  const frames = error instanceof Error ? error.stack?.split('\n').slice(1).filter(line => /^\s+at /.test(line)).slice(0, 8).flatMap(line => {
    const match = /(?:[/\\])([a-zA-Z0-9_.-]+\.[cm]?[jt]sx?):([0-9]+):([0-9]+)\)?$/.exec(line);
    return match ? [`at ${match[1]}:${match[2]}:${match[3]}`] : [];
  }).join('\n') : undefined;
  return safeEvent({ error_name: name, error_digest: digest, error_stack: frames });
}

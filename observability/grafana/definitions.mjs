// Canonical dashboard/query definitions. Run build.mjs to refresh importable JSON.
const loki = { type: 'loki', uid: '${loki}' };
const window = '$__auto';
const env = '$environment';
export function logs(service, event, fields = [], environment = env) {
  const selected = [...new Set(['environment', 'event_name', ...fields])];
  return `{service_name=~"${service}"} | json ${selected.map(field => `${field}="${field}"`).join(', ')} | __error__="" | environment="${environment}"${event ? ` | event_name="${event}"` : ''}`;
}
function count(service, event, filter = '', fields = [], range = window, environment = env) {
  return `sum(count_over_time(${logs(service, event, fields, environment)}${filter} | __error__="" [${range}])) or vector(0)`;
}
function rate(service, event, filter = '', fields = []) {
  return `sum(rate(${logs(service, event, fields)}${filter} | __error__="" [${window}])) or vector(0)`;
}
function percentile(service, event, field, quantile = 0.95, filter = '', fields = [], groupBy = 'service_name') {
  return `quantile_over_time(${quantile}, ${logs(service, event, [field, ...fields])}${filter} | unwrap ${field} | __error__="" [${window}]) by (${groupBy})`;
}
const gateway = 'phaseo-gateway';
function panel(title, expr, { type = 'timeseries', unit = 'short', description = '', instant = false, legend = '', ...extra } = {}) {
  return { title, type, datasource: loki, description,
    targets: [{ refId: 'A', expr, datasource: loki, queryType: instant ? 'instant' : 'range', instant, range: !instant, legendFormat: legend }],
    fieldConfig: { defaults: { unit, noValue: 'No data', custom: { spanNulls: false } }, overrides: [] },
    options: type === 'logs' ? { showTime: true, wrapLogMessage: true, enableLogDetails: true, sortOrder: 'Descending' } : { legend: { displayMode: 'list', placement: 'bottom' } }, ...extra };
}
function dashboard(uid, title, description, panels) {
  return { uid, title: `Phaseo · ${title}`, description, schemaVersion: 39, version: 1, editable: true,
    tags: ['phaseo', 'observability'], timezone: 'browser', refresh: '1m', time: { from: 'now-6h', to: 'now' },
    links: [
      ...['overview', 'gateway', 'web', 'jobs', 'telemetry'].filter(name => `phaseo-${name}` !== uid).map(name => ({ title: name[0].toUpperCase() + name.slice(1), type: 'link', url: `/d/phaseo-${name}?var-environment=$environment`, keepTime: true, includeVars: true })),
      { title: 'Explore', type: 'link', url: '/explore' },
      { title: 'Frontend Observability', type: 'link', url: '/a/grafana-kowalski-app' },
      { title: 'Alerts', type: 'link', url: '/alerting/list' },
    ],
    templating: { list: [
      { name: 'loki', label: 'Logs', type: 'datasource', query: 'loki', refresh: 1 },
      { name: 'environment', label: 'Environment', type: 'custom', query: 'production,staging', current: { text: 'production', value: 'production' }, options: [{ text: 'production', value: 'production', selected: true }, { text: 'staging', value: 'staging', selected: false }] },
      { name: 'request', label: 'Request ID', type: 'textbox', query: '', current: { text: '', value: '' }, hide: 0 },
    ] },
    annotations: { list: [{ name: 'Annotations & Alerts', type: 'dashboard', datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, iconColor: 'rgba(0, 211, 255, 1)' }] },
    panels: panels.map((item, index) => ({ id: index + 1, gridPos: { x: index % 2 * 12, y: Math.floor(index / 2) * 9, w: 12, h: 9 }, ...item })),
  };
}
export function dashboards() {
  const requestFilter = ' | request_id=~"${request:regex}.*"';
  return [
    dashboard('phaseo-overview', 'Overview', 'Start here. Quiet traffic is normal; the scheduler heartbeat provides independent telemetry freshness.', [
      panel('Gateway requests / second', rate(gateway, 'gateway.request'), { unit: 'reqps' }),
      panel('Actionable failures / second', rate(gateway, 'gateway.request', ' | actionable="true"', ['actionable']), { unit: 'reqps', description: 'Logical request failures classified as actionable. Client cancellations are excluded.' }),
      panel('Gateway p95 duration', percentile(gateway, 'gateway.request', 'duration_ms'), { unit: 'ms', description: 'Terminal request duration, including streamed responses. Missing timing is omitted.' }),
      panel('Web API p95 headers', percentile('phaseo-web-api', 'web.request', 'duration_ms'), { unit: 'ms', description: 'Time to response headers; streamed generation completion is measured by the gateway.' }),
      panel('Scheduler ticks / 15 minutes', count('phaseo-jobs', 'job.heartbeat', '', [], '15m'), { description: 'Expected about 15 ticks. Zero means missing scheduler or missing telemetry, even if there are no users.' }),
      panel('Recent actionable events', `${logs('phaseo-.*', '', ['actionable'])} | actionable="true"`, { type: 'logs' }),
    ]),
    dashboard('phaseo-gateway', 'Gateway and providers', 'Request summaries cover received terminal events. Trace retention is sampled. Delivery is best effort, so counts are operational rather than financial.', [
      panel('Requests by outcome', `sum by (outcome) (rate(${logs(gateway, 'gateway.request', ['outcome'])} [${window}]))`, { unit: 'reqps', legend: '{{outcome}}' }),
      panel('Provider attempts / second', `sum by (provider, outcome) (rate(${logs(gateway, 'provider.attempt', ['provider', 'outcome'])} [${window}]))`, { unit: 'reqps', legend: '{{provider}} · {{outcome}}' }),
      panel('Streaming p95 time to first token', percentile(gateway, 'gateway.request', 'ttft_ms', 0.95, ' | stream="true"', ['stream']), { unit: 'ms', description: 'Downstream first token timing. Null timings are omitted, never converted into zero.' }),
      panel('Provider p95 first token', percentile(gateway, 'gateway.request', 'provider_ttft_ms', 0.95, ' | stream="true"', ['stream']), { unit: 'ms' }),
      panel('Requests requiring fallback / second', rate(gateway, 'gateway.request', ' | attempt_count > 1', ['attempt_count']), { unit: 'reqps' }),
      panel('Client cancellations / second', rate(gateway, 'gateway.request', ' | outcome="cancelled"', ['outcome']), { unit: 'reqps' }),
      panel('Request lookup', `${logs(gateway, 'gateway.request', ['request_id'])}${requestFilter}`, { type: 'logs', description: 'Enter a request ID above. Expand the JSON line to find trace_id; paste it into Tempo in Explore. Only sampled traces exist.' }),
      panel('Provider attempt lookup', `${logs(gateway, 'provider.attempt', ['request_id'])}${requestFilter}`, { type: 'logs' }),
    ]),
    dashboard('phaseo-web', 'Web experience', 'Server-side errors and web API performance. Browser errors, sessions and Web Vitals live in the linked Frontend Observability app and require analytics consent.', [
      panel('Web API requests / second', rate('phaseo-web-api', 'web.request'), { unit: 'reqps' }),
      panel('Web API 5xx / second', rate('phaseo-web-api', 'web.request', ' | status_code >= 500', ['status_code']), { unit: 'reqps' }),
      panel('Web API p95 headers', percentile('phaseo-web-api', 'web.request', 'duration_ms'), { unit: 'ms' }),
      panel('Web server captured errors', count('phaseo-web', 'web.server_error'), { description: 'Captured server errors only. This hook does not provide a request denominator or server latency percentiles.' }),
      panel('Web API failures', `${logs('phaseo-web-api', 'web.request', ['actionable'])} | actionable="true"`, { type: 'logs' }),
      panel('Web server errors', logs('phaseo-web', 'web.server_error'), { type: 'logs', description: 'Error messages and request URLs are omitted. Use the route, release and source frames to investigate.' }),
    ]),
    dashboard('phaseo-jobs', 'Jobs and settlement', 'Completion means the handler returned; inspect item failures separately. Skipped jobs are distinct. Financial truth remains in Supabase.', [
      panel('Completed job invocations', `sum by (job) (count_over_time(${logs('phaseo-jobs|phaseo-web-api', 'job.run', ['job', 'outcome'])} | outcome="completed" [${window}]))`, { legend: '{{job}}' }),
      panel('Failed job invocations', `sum by (job) (count_over_time(${logs('phaseo-jobs|phaseo-web-api', 'job.run', ['job', 'outcome'])} | outcome="error" [${window}]))`, { legend: '{{job}}' }),
      panel('Job p95 duration', percentile('phaseo-jobs|phaseo-web-api', 'job.run', 'duration_ms', 0.95, '', ['job'], 'job'), { unit: 'ms', legend: '{{job}}' }),
      panel('Disabled job invocations', `sum by (job) (count_over_time(${logs('phaseo-jobs', 'job.run', ['job', 'outcome'])} | outcome="skipped" [${window}]))`, { legend: '{{job}}' }),
      panel('Operational failures', logs(gateway, 'ops.failure'), { type: 'logs', description: 'Includes existing settlement and usage persistence failure hooks. No balances, prompts or customer identities are exported.' }),
      panel('Recent job runs', logs('phaseo-jobs|phaseo-web-api', 'job.run'), { type: 'logs' }),
    ]),
    dashboard('phaseo-telemetry', 'Telemetry health', 'Check Grafana Cloud Billing / Usage for authoritative ingest volume and quotas. These panels monitor the application pipeline and do not estimate billable bytes.', [
      panel('Received events / second', `sum by (service_name) (rate(${logs('phaseo-.*', '')} [${window}]))`, { unit: 'ops', legend: '{{service_name}}' }),
      panel('Scheduler ticks / 15 minutes', count('phaseo-jobs', 'job.heartbeat', '', [], '15m'), { description: 'Independent of request volume. If absent, check Cloudflare cron and Worker console delivery warnings.' }),
      panel('Persistence delivery failures', count(gateway, 'telemetry.delivery'), { description: 'Existing application persistence failures. An OTLP outage cannot reliably report itself through the same OTLP destination.' }),
      panel('Attempt batches truncated', count(gateway, 'gateway.request', ' | attempts_truncated > 0', ['attempts_truncated']), { description: 'Provider attempt detail is capped at 16 per request; the request total is still retained.' }),
      panel('Recent heartbeats', logs('phaseo-jobs', 'job.heartbeat'), { type: 'logs' }),
      panel('Persistence errors', logs(gateway, 'telemetry.delivery'), { type: 'logs' }),
    ]),
  ];
}

export function alertRules({ lokiUid, environment = 'production', folderUid = 'phaseo-observability', enabled = false }) {
  if (!['production', 'staging'].includes(environment)) throw new Error('Unsupported alert environment');
  const failure = count(gateway, 'gateway.request', ' | actionable="true"', ['actionable'], '10m', environment);
  const total = count(gateway, 'gateway.request', '', [], '10m', environment);
  const rules = [
    ['gateway-errors', 'Gateway actionable failures', `(((${failure}) / (${total})) > 0.05) and ((${total}) >= 20)`, '5m', 'At least 20 requests in 10 minutes and over 5% actionable failures.'],
    ['scheduler-missing', 'Scheduler telemetry missing', `absent_over_time(${logs('phaseo-jobs', 'job.heartbeat', [], environment)} [15m]) or vector(0)`, '5m', 'No scheduler heartbeat for 15 minutes. Check cron, bindings and Grafana delivery; quiet user traffic does not cause this alert.'],
    ['jobs-failing', 'Scheduled job failure', count('phaseo-jobs|phaseo-web-api', 'job.run', ' | outcome="error"', ['outcome'], '10m', environment), '0s', 'A scheduled invocation threw or reported item failures. Inspect job logs and the relevant platform queue.'],
    ['ops-failing', 'Settlement or operational failure', count(gateway, 'ops.failure', '', [], '5m', environment), '0s', 'An existing operational failure hook fired. Inspect request and settlement records before taking action.'],
    ['web-errors', 'Web server failures', `(${count('phaseo-web-api', 'web.request', ' | status_code >= 500', ['status_code'], '10m', environment)}) + (${count('phaseo-web', 'web.server_error', '', [], '10m', environment)})`, '5m', 'Web API 5xx responses or captured web server errors. Check routes, release and source frames.'],
  ];
  return rules.map(([id, title, expr, pending, summary]) => ({
    uid: `phaseo-${id}-${environment}`, title: `Phaseo ${environment} · ${title}`, folderUID: folderUid,
    ruleGroup: `phaseo-${environment}`, orgID: 1, condition: 'B', for: pending,
    noDataState: 'OK', execErrState: 'Error', isPaused: !enabled,
    labels: { application: 'phaseo', environment, severity: id === 'ops-failing' ? 'critical' : 'warning' },
    annotations: { summary },
    data: [
      { refId: 'A', relativeTimeRange: { from: 1200, to: 0 }, datasourceUid: lokiUid, model: { refId: 'A', expr, queryType: 'instant', instant: true, range: false, datasource: { type: 'loki', uid: lokiUid }, intervalMs: 1000, maxDataPoints: 43200 } },
      { refId: 'B', relativeTimeRange: { from: 0, to: 0 }, datasourceUid: '__expr__', model: { refId: 'B', type: 'math', expression: '$A > 0', datasource: { type: '__expr__', uid: '__expr__' } } },
    ],
  }));
}

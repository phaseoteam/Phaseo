// Canonical dashboard/query definitions. Run build.mjs to refresh importable JSON.
import { addDiagnostics, records } from './diagnostics.mjs';
import { freeTierDashboard } from './free-tier.mjs';
import { presentDashboards } from './presentation.mjs';
import { deploymentQuery } from './deployments.mjs';
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
function panel(title, expr, { type = 'timeseries', unit = 'short', description = '', instant = false, legend = '', series = [[expr, legend]], ...extra } = {}) {
  return { title, type, datasource: loki, description,
    targets: series.map(([expression, legendFormat], index) => ({ refId: String.fromCharCode(65 + index), expr: expression, datasource: loki, queryType: instant ? 'instant' : 'range', instant, range: !instant, legendFormat })),
    fieldConfig: { defaults: { unit, noValue: 'No data', custom: { spanNulls: false } }, overrides: [] },
    options: { legend: { displayMode: 'list', placement: 'bottom' } }, ...extra };
}
function stat(title, expr, x, { description, failures = false, heartbeat = false } = {}) {
  return panel(title, expr, { type: 'stat', instant: true, description,
    gridPos: { x, y: 5, w: 4, h: 4 },
    fieldConfig: { defaults: { unit: 'short', decimals: 0, noValue: 'No data',
      color: { mode: failures || heartbeat ? 'thresholds' : 'fixed', fixedColor: 'blue' },
      thresholds: { mode: 'absolute', steps: [{ color: heartbeat ? 'red' : 'green', value: null }, { color: heartbeat ? 'green' : 'red', value: 1 }] },
      mappings: heartbeat ? [{ type: 'range', options: { from: 0, to: 0, result: { text: 'Missing', color: 'red' } } }, { type: 'range', options: { from: 1, to: 1000000, result: { text: 'Arriving', color: 'green' } } }] : [],
    }, overrides: [] },
    options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, orientation: 'auto', textMode: 'auto', colorMode: 'value', graphMode: 'none', justifyMode: 'auto' },
  });
}
function note(title, content, gridPos) {
  return { title, type: 'text', gridPos, options: { mode: 'markdown', content } };
}
function breakdown(title, expr, legend, gridPos, description) {
  return panel(title, expr, { type: 'bargauge', instant: true, legend, gridPos, description,
    fieldConfig: { defaults: { unit: 'short', decimals: 0, min: 0, noValue: 'No matching events', color: { mode: 'fixed', fixedColor: 'blue' } }, overrides: [] },
    options: { orientation: 'horizontal', displayMode: 'basic', showUnfilled: false, reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
  });
}
function dashboard(uid, title, description, panels) {
  return { uid, title: `Phaseo · ${title}`, description, schemaVersion: 39, version: 1, editable: true,
    tags: ['phaseo', 'observability'], timezone: 'browser', refresh: '1m', time: { from: 'now-6h', to: 'now' },
    links: [
      ...['overview', 'gateway', 'web', 'jobs', 'telemetry'].filter(name => `phaseo-${name}` !== uid).map(name => ({ title: name[0].toUpperCase() + name.slice(1), type: 'link', url: `/d/phaseo-${name}?var-environment=$environment`, keepTime: true, includeVars: true })),
      { title: 'Free tier', type: 'link', url: '/d/phaseo-free-tier' },
      { title: 'Explore', type: 'link', url: '/explore' },
      { title: 'Frontend Observability', type: 'link', url: '/a/grafana-kowalski-app' },
      { title: 'Alerts', type: 'link', url: '/alerting/list' },
    ],
    templating: { list: [
      { name: 'loki', label: 'Logs', type: 'datasource', query: 'loki', refresh: 1 },
      { name: 'environment', label: 'Environment', type: 'custom', query: 'production,staging', current: { text: 'production', value: 'production' }, options: [{ text: 'production', value: 'production', selected: true }, { text: 'staging', value: 'staging', selected: false }] },
      { name: 'request', label: 'Request ID', type: 'textbox', query: '', current: { text: '', value: '' }, hide: 0 },
    ] },
    annotations: { list: [{ name: 'Annotations & Alerts', type: 'dashboard', datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, iconColor: 'rgba(0, 211, 255, 1)' }, deploymentQuery(({ 'phaseo-gateway': 'gateway', 'phaseo-web': 'web', 'phaseo-jobs': 'jobs' })[uid])] },
    panels: panels.map((item, index) => ({ id: index + 1, gridPos: { x: index % 2 * 12, y: Math.floor(index / 2) * 9, w: 12, h: 9 }, ...item })),
  };
}
export function dashboards() {
  const requestFilter = ' | request_id=~"${request:regex}.*"';
  const selectedCount = (service, event, filter = '', fields = []) => count(service, event, filter, fields, '$__range');
  const windowCount = (service, event, filter = '', fields = []) => count(service, event, filter, fields);
  const groupedCount = (service, event, field, filter = '', fields = []) => `sum by (${field}) (count_over_time(${logs(service, event, [field, ...fields])}${filter} | __error__="" [$__range]))`;
  const overview = dashboard('phaseo-overview', 'Overview', 'Check received traffic and failures, then investigate the affected service. Scheduler freshness is not an external uptime check.', [
    note('Start here', '**1. Check collection:** “Arriving” means a scheduler heartbeat was received in the last 5 minutes. “Missing” means check cron and telemetry delivery. **2. Check failures:** red counts need investigation; click a count to open its service dashboard. **3. Compare the charts:** did failures or latency rise after a deployment?\n\nCounts cover the selected time range and received events only. Zero requests can mean quiet traffic; zero failures does not prove uptime. Use external checks to establish availability and alert rules to configure notifications.', { x: 0, y: 0, w: 24, h: 5 }),
    stat('Scheduler telemetry · last 5m', count('phaseo-jobs', 'job.heartbeat', '', [], '5m'), 0, { heartbeat: true, description: 'At least one recent heartbeat confirms scheduler telemetry is arriving. This does not test the website or generation endpoints from outside Cloudflare.' }),
    stat('Gateway requests', selectedCount(gateway, 'gateway.request'), 4, { description: 'Received terminal gateway request events in the selected time range. Includes success, error and cancellation; not a billing count.' }),
    stat('Gateway failures', selectedCount(gateway, 'gateway.request', ' | actionable="true"', ['actionable']), 8, { failures: true, description: 'Actionable logical request failures, including failures after streaming HTTP 200. Client cancellations are excluded.' }),
    stat('Web API requests', selectedCount('phaseo-web-api', 'web.request'), 12, { description: 'Web API response-header events in the selected time range. This is separate from gateway generation traffic.' }),
    stat('Web API 5xx', selectedCount('phaseo-web-api', 'web.request', ' | status_code >= 500', ['status_code']), 16, { failures: true, description: 'Server-error responses only. Expected client rejections such as 401 and 404 are excluded.' }),
    stat('Job failures', selectedCount('phaseo-jobs|phaseo-web-api', 'job.run', ' | outcome="error"', ['outcome']), 20, { failures: true, description: 'Job invocations that threw or explicitly reported known item failures. A completed handler can still contain internally handled failures.' }),
    panel('Traffic · per interval', '', { interval: '5m', gridPos: { x: 0, y: 9, w: 12, h: 8 },
      description: 'Each point counts events in the preceding query interval, with a five-minute minimum. The window grows with the query step on long ranges so events between points remain counted. Web API and gateway are separate traffic populations; do not add them as unique requests.',
      series: [[windowCount(gateway, 'gateway.request'), 'Gateway'], [windowCount('phaseo-web-api', 'web.request'), 'Web API']],
    }),
    panel('Failures · per interval', '', { interval: '5m', gridPos: { x: 12, y: 9, w: 12, h: 8 },
      description: 'Received failure events per category in the preceding query interval, with a five-minute minimum. The window grows with the query step on long ranges so short spikes remain counted. These are not distinct incidents; one incident can produce events in multiple categories.',
      series: [[windowCount(gateway, 'gateway.request', ' | actionable="true"', ['actionable']), 'Gateway actionable'], [windowCount('phaseo-web-api', 'web.request', ' | status_code >= 500', ['status_code']), 'Web API 5xx'], [windowCount('phaseo-web', 'web.server_error'), 'Website server errors'], [windowCount('phaseo-jobs|phaseo-web-api', 'job.run', ' | outcome="error"', ['outcome']), 'Job failures'], [windowCount(gateway, 'ops.failure'), 'Operational failures']],
    }),
    panel('Gateway p95 duration', percentile(gateway, 'gateway.request', 'duration_ms'), { unit: 'ms', gridPos: { x: 0, y: 17, w: 12, h: 8 }, description: '95% of received terminal gateway timings are at or below this value. Includes streamed response completion. Interpret with request volume; a percentile from very few requests is unstable. Missing timing stays empty.' }),
    panel('Web API p95 headers', percentile('phaseo-web-api', 'web.request', 'duration_ms'), { unit: 'ms', gridPos: { x: 12, y: 17, w: 12, h: 8 }, description: '95% of received web API timings reach response headers within this duration. Does not measure full streamed response completion. Empty means no matching timings, not zero latency.' }),
    breakdown('Gateway outcomes', groupedCount(gateway, 'gateway.request', 'outcome'), '{{outcome}}', { x: 0, y: 25, w: 12, h: 7 }, 'Counts in the selected time range. Cancellation is separate from success and error; error is not always operationally actionable.'),
    breakdown('Web API responses by status', groupedCount('phaseo-web-api', 'web.request', 'status_code'), 'HTTP {{status_code}}', { x: 12, y: 25, w: 12, h: 7 }, 'Counts by HTTP status in the selected time range. A 4xx response is a client rejection and is not automatically an outage.'),
    breakdown('Web API 5xx by route', `topk(10, ${groupedCount('phaseo-web-api', 'web.request', 'route', ' | status_code >= 500', ['status_code'])})`, '{{route}}', { x: 0, y: 32, w: 12, h: 7 }, 'Up to 10 route templates with received server-error responses in the selected time range. Empty means no matching events, not confirmed availability.'),
    breakdown('Provider attempt failures', `topk(10, ${groupedCount(gateway, 'provider.attempt', 'provider', ' | outcome="error"', ['outcome'])})`, '{{provider}}', { x: 12, y: 32, w: 12, h: 7 }, 'Up to 10 providers with failed attempts in the selected time range. Retries and fallbacks can recover, so these are not necessarily failed customer requests. Attempt detail is capped per request.'),
    { ...records('Recent actionable events', `${logs('phaseo-gateway|phaseo-web-api|phaseo-web|phaseo-jobs', '', ['actionable'])} | actionable="true"`, ['timestamp', 'service_name', 'event_name', 'route', 'job', 'error_kind', 'error_code', 'duration_ms', 'request_id', 'trace_id'], 'Newest 100 actionable events. Read the service, route or job and error classification, then open its request or trace. Inspect matching logs for deeper detail. No matching events does not establish external uptime.'), gridPos: { x: 0, y: 39, w: 24, h: 9 } },
    note('Investigate and recover', '**API failures:** open [Gateway and providers](/d/phaseo-gateway?var-environment=$environment&from=$__from&to=$__to) and look for shared providers, outcomes or request IDs. **Website problems:** open [Web experience](/d/phaseo-web?var-environment=$environment&from=$__from&to=$__to); browser errors and Web Vitals are in [Frontend Observability](/a/grafana-kowalski-app). **Job or settlement failures:** open [Jobs and settlement](/d/phaseo-jobs?var-environment=$environment&from=$__from&to=$__to).\n\nRead event tables first. Click a trace ID for its timing details, or **Inspect matching logs** in a table menu for the original records. Privacy exclusions, sampling settings and delivery failures can leave a trace unavailable. Compare the incident time with [recent deployments](https://github.com/phaseoteam/Phaseo/actions/workflows/ci.yml). After a fix or rollback, test the affected page or endpoint directly and confirm errors settle. [Alert rules](/alerting/list) show notification-rule state; this dashboard itself does not send notifications.', { x: 0, y: 48, w: 24, h: 7 }),
  ]);
  overview.time.from = 'now-1h';
  overview.templating.list[2].hide = 2;
  const destinations = ['telemetry', 'gateway', 'gateway', 'web', 'web', 'jobs'];
  for (const [index, item] of overview.panels.slice(1, 7).entries()) item.fieldConfig.defaults.links = [{ title: 'Investigate', url: `/d/phaseo-${destinations[index]}?var-environment=$environment&from=$__from&to=$__to` }];
  return presentDashboards(addDiagnostics([
    overview,
    dashboard('phaseo-gateway', 'Gateway and providers', 'Request summaries cover received terminal events. Trace retention is sampled. Delivery is best effort, so counts are operational rather than financial.', [
      panel('Requests by outcome', `sum by (outcome) (rate(${logs(gateway, 'gateway.request', ['outcome'])} [${window}]))`, { unit: 'reqps', legend: '{{outcome}}' }),
      panel('Provider attempts / second', `sum by (provider, outcome) (rate(${logs(gateway, 'provider.attempt', ['provider', 'outcome'])} [${window}]))`, { unit: 'reqps', legend: '{{provider}} · {{outcome}}' }),
      panel('Streaming p95 time to first token', percentile(gateway, 'gateway.request', 'ttft_ms', 0.95, ' | stream="true"', ['stream']), { unit: 'ms', description: 'Downstream first token timing. Null timings are omitted, never converted into zero.' }),
      panel('Provider p95 first token', percentile(gateway, 'gateway.request', 'provider_ttft_ms', 0.95, ' | stream="true"', ['stream']), { unit: 'ms' }),
      panel('Requests requiring fallback / second', rate(gateway, 'gateway.request', ' | attempt_count > 1', ['attempt_count']), { unit: 'reqps' }),
      panel('Client cancellations / second', rate(gateway, 'gateway.request', ' | outcome="cancelled"', ['outcome']), { unit: 'reqps' }),
      records('Request lookup', `${logs(gateway, 'gateway.request', ['request_id'])}${requestFilter}`, ['timestamp', 'request_id', 'route', 'provider', 'model', 'outcome', 'status_code', 'error_code', 'duration_ms', 'trace_id'], 'Newest 100 matching requests. Enter a request ID above; click its trace ID to investigate. Privacy exclusions, sampling and delivery failures can leave a trace unavailable.'),
      records('Provider attempt lookup', `${logs(gateway, 'provider.attempt', ['request_id'])}${requestFilter}`, ['timestamp', 'request_id', 'attempt_number', 'provider', 'model', 'outcome', 'error_code', 'duration_ms', 'provider_ttft_ms', 'trace_id'], 'Newest 100 matching provider attempts. A failed attempt can recover through fallback. Attempt detail is capped per request; use Inspect matching logs for the original event.'),
    ]),
    dashboard('phaseo-web', 'Web experience', 'Server-side errors and web API performance. Browser errors, sessions and Web Vitals live in the linked Frontend Observability app and require analytics consent.', [
      panel('Web API requests / second', rate('phaseo-web-api', 'web.request'), { unit: 'reqps' }),
      panel('Web API 5xx / second', rate('phaseo-web-api', 'web.request', ' | status_code >= 500', ['status_code']), { unit: 'reqps' }),
      panel('Web API p95 headers', percentile('phaseo-web-api', 'web.request', 'duration_ms'), { unit: 'ms' }),
      panel('Web server captured errors', count('phaseo-web', 'web.server_error'), { description: 'Captured server errors only. This hook does not provide a request denominator or server latency percentiles.' }),
      records('Web API failures', `${logs('phaseo-web-api', 'web.request', ['actionable'])} | actionable="true"`, ['timestamp', 'method', 'route', 'status_code', 'duration_ms', 'trace_id'], 'Newest 100 actionable web API responses. Timing ends at response headers. Click a trace ID for deeper investigation.'),
      records('Web server errors', logs('phaseo-web', 'web.server_error'), ['timestamp', 'route', 'error_name', 'error_digest', 'service_version', 'trace_id'], 'Newest 100 captured website errors. Compare route, fingerprint and release; source frames are available in Website error records and Inspect matching logs. Error messages and request URLs are omitted.'),
    ]),
    dashboard('phaseo-jobs', 'Jobs and settlement', 'Completion means the handler returned; inspect item failures separately. Skipped jobs are distinct. Financial truth remains in Supabase.', [
      panel('Completed job invocations', `sum by (job) (count_over_time(${logs('phaseo-jobs|phaseo-web-api', 'job.run', ['job', 'outcome'])} | outcome="completed" [${window}]))`, { legend: '{{job}}' }),
      panel('Failed job invocations', `sum by (job) (count_over_time(${logs('phaseo-jobs|phaseo-web-api', 'job.run', ['job', 'outcome'])} | outcome="error" [${window}]))`, { legend: '{{job}}' }),
      panel('Job p95 duration', percentile('phaseo-jobs|phaseo-web-api', 'job.run', 'duration_ms', 0.95, '', ['job'], 'job'), { unit: 'ms', legend: '{{job}}' }),
      panel('Disabled job invocations', `sum by (job) (count_over_time(${logs('phaseo-jobs', 'job.run', ['job', 'outcome'])} | outcome="skipped" [${window}]))`, { legend: '{{job}}' }),
      records('Operational failures', logs(gateway, 'ops.failure'), ['timestamp', 'signal', 'outcome', 'error_kind', 'error_code', 'request_id', 'trace_id'], 'Newest 100 existing settlement and usage persistence failures. Inspect the source hook and request before taking action. No balances, prompts or customer identities are exported.'),
      records('Recent job runs', logs('phaseo-jobs|phaseo-web-api', 'job.run'), ['timestamp', 'service_name', 'job', 'outcome', 'duration_ms', 'failed_count', 'processed_count'], 'Newest 100 job invocations. Completed means the handler returned; missing item counts stay unavailable, not zero. Skipped jobs are distinct from failed jobs.'),
    ]),
    dashboard('phaseo-telemetry', 'Telemetry health', 'Check Grafana Cloud Billing / Usage for authoritative ingest volume and quotas. These panels monitor the application pipeline and do not estimate billable bytes.', [
      panel('Received events / second', `sum by (service_name) (rate(${logs('phaseo-.*', '')} [${window}]))`, { unit: 'ops', legend: '{{service_name}}' }),
      panel('Scheduler ticks / 15 minutes', count('phaseo-jobs', 'job.heartbeat', '', [], '15m'), { description: 'Independent of request volume. If absent, check Cloudflare cron and Worker console delivery warnings.' }),
      panel('Persistence delivery failures', count(gateway, 'telemetry.delivery'), { description: 'Existing application persistence failures. An OTLP outage cannot reliably report itself through the same OTLP destination.' }),
      panel('Attempt batches truncated', count(gateway, 'gateway.request', ' | attempts_truncated > 0', ['attempts_truncated']), { description: 'Provider attempt detail is capped at 16 per request; the request total is still retained.' }),
      records('Recent heartbeats', logs('phaseo-jobs', 'job.heartbeat'), ['timestamp', 'service_name', 'event_name', 'service_version'], 'Newest 100 scheduler heartbeats. Their arrival confirms scheduler telemetry, not external availability or successful completion of every job.'),
      records('Persistence errors', logs(gateway, 'telemetry.delivery'), ['timestamp', 'signal', 'outcome', 'reason', 'error_kind', 'error_code', 'request_id', 'trace_id'], 'Newest 100 persistence delivery events. Inspect the source and classification. An OTLP outage cannot reliably report itself through the same OTLP destination.'),
    ]),
  ], logs).concat(freeTierDashboard()));
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

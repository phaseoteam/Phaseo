import { pathToFileURL } from 'node:url';

export const dashboardUids = ['phaseo-overview', 'phaseo-gateway', 'phaseo-web', 'phaseo-jobs', 'phaseo-telemetry'];
const services = 'phaseo-gateway|phaseo-gateway-eu|phaseo-gateway-us|phaseo-web-api|phaseo-web|phaseo-jobs';
const lookupUrl = '/d/phaseo-investigation?var-environment=${environment:percentencode}&var-lookup=${__value.raw:percentencode}&from=${__from}&to=${__to}';

export function traceUrl() {
  const panes = { trace: { datasource: '${tempo}', queries: [{ refId: 'A', queryType: 'traceId', query: '${__value.raw}' }], range: { from: '${__from}', to: '${__to}' } } };
  return '/explore?schemaVersion=1&panes=' + encodeURIComponent(JSON.stringify(panes)).replace(/%24%7B(.*?)%7D/g, (_, value) => '${' + decodeURIComponent(value) + '}');
}

function fieldLinks(panel, field, links) {
  panel.fieldConfig ??= { defaults: {}, overrides: [] };
  panel.fieldConfig.overrides ??= [];
  // Grafana uses the last matching property. Remove the old link properties,
  // retaining widths, names and other styling from the installed dashboard.
  for (const override of panel.fieldConfig.overrides) if (override.matcher?.id === 'byName' && override.matcher.options === field) override.properties = override.properties.filter(property => property.id !== 'links');
  panel.fieldConfig.overrides = panel.fieldConfig.overrides.filter(override => override.properties.length);
  panel.fieldConfig.overrides.push({ matcher: { id: 'byName', options: field }, properties: [{ id: 'links', value: links }] });
}

export function enhanceInvestigations(source) {
  const dashboard = structuredClone(source);
  dashboard.links ??= [];
  dashboard.links = dashboard.links.filter(link => link.title !== 'Request investigation');
  if (dashboard.uid !== 'phaseo-investigation') dashboard.links.push({ title: 'Request investigation', type: 'link', url: '/d/phaseo-investigation?var-environment=${environment:percentencode}', keepTime: true });
  const visit = panels => {
    for (const panel of panels) {
      if (panel.panels) visit(panel.panels);
      if (!['table', 'logs'].includes(panel.type)) continue;
      fieldLinks(panel, 'request_id', [{ title: 'Related request records', url: lookupUrl }]);
      fieldLinks(panel, 'trace_id', [{ title: 'Related trace records', url: lookupUrl }, { title: 'Open sampled trace', url: traceUrl() }]);
      fieldLinks(panel, 'service_version', [{ title: 'View deployed commit', url: 'https://github.com/phaseoteam/Phaseo/commit/${__value.raw:percentencode}', targetBlank: true }]);
      // Existing record tables extract labels and then discard some identifiers.
      // Keep correlation/release columns only on those tables, not aggregations.
      if (panel.type === 'table' && panel.transformations?.some(transform => transform.id === 'extractFields' && transform.options?.source === 'Line')) {
        const filter = panel.transformations.findLast(transform => transform.id === 'filterFieldsByName' && transform.options?.include?.names);
        if (filter) filter.options.include.names = [...new Set([...filter.options.include.names, 'request_id', 'trace_id', 'service_version'])];
      }
    }
  };
  visit(dashboard.panels ?? []);
  dashboard.templating ??= { list: [] };
  if (!dashboard.templating.list.some(variable => variable.name === 'tempo')) dashboard.templating.list.push({ name: 'tempo', label: 'Traces', type: 'datasource', query: 'tempo', refresh: 1 });
  return dashboard;
}

export function investigationDashboard(lokiUid, tempoUid) {
  const fields = ['timestamp', 'service_name', 'event_name', 'method', 'route', 'job', 'outcome', 'status_code', 'error_kind', 'error_code', 'duration_ms', 'provider', 'model', 'request_id', 'trace_id', 'service_version'];
  const names = ['Time', 'Service', 'Event', 'Method', 'Route', 'Job', 'Outcome', 'HTTP status', 'Category', 'Code', 'Duration', 'Provider', 'Model', 'Request ID', 'Trace ID', 'Release'];
  // Grafana's JSON formatter leaves string variables unquoted. Compare encoded
  // values instead, so quotes/backslashes cannot change the LogQL expression.
  const query = `{service_name=~"${services}"} | json environment="environment", request_id="request_id", trace_id="trace_id" | __error__="" | environment="$environment" | label_format lookup_request=\`{{ .request_id | urlencode | replace "+" "%20" }}\`, lookup_trace=\`{{ .trace_id | urlencode | replace "+" "%20" }}\` | ((request_id!="" and lookup_request="${'${lookup:percentencode}'}") or (trace_id!="" and lookup_trace="${'${lookup:percentencode}'}"))`;
  return enhanceInvestigations({
    uid: 'phaseo-investigation', title: 'Phaseo · Request investigation', tags: ['phaseo', 'observability'], schemaVersion: 39, editable: true,
    timezone: 'browser', refresh: '', time: { from: 'now-1h', to: 'now' },
    description: 'Received records matching one exact request or trace ID across Phaseo services. Absence is not proof of success.',
    templating: { list: [
      { name: 'loki', label: 'Logs', type: 'datasource', query: 'loki', current: { text: lokiUid, value: lokiUid }, hide: 2 },
      { name: 'tempo', label: 'Traces', type: 'datasource', query: 'tempo', current: { text: tempoUid, value: tempoUid }, hide: 2 },
      { name: 'environment', label: 'Environment', type: 'custom', query: 'production,staging', current: { text: 'production', value: 'production' } },
      { name: 'lookup', label: 'Request or trace ID', type: 'textbox', query: '', current: { text: '', value: '' } },
    ] },
    links: [{ title: 'Overview', type: 'link', url: '/d/phaseo-overview?var-environment=${environment:percentencode}', keepTime: true }, { title: 'PostHog errors', type: 'link', url: 'https://eu.posthog.com/project/81404/error-tracking', targetBlank: true }],
    annotations: { list: [{ name: 'Deployments', type: 'tags', datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: false, target: { type: 'tags', tags: ['phaseo-deployment', 'environment:$environment'], matchAny: false, limit: 500 }, iconColor: '#FFB357' }] },
    panels: [
      { id: 1, title: 'Follow the failure', type: 'text', gridPos: { x: 0, y: 0, w: 24, h: 3 }, options: { mode: 'markdown', content: 'Paste a **request ID or trace ID** above, or open this page from a failure record. Check the time range, then read the matching records below. Click a trace ID to open a retained trace, or a release to view its code.\n\nRecords are best effort; traces are sampled. A missing trace does not mean the request succeeded. Use PostHog for browser exceptions and consented replays.' } },
      { id: 2, title: 'Related records', type: 'table', datasource: { type: 'loki', uid: '${loki}' }, gridPos: { x: 0, y: 3, w: 24, h: 17 },
        description: 'Up to 100 received records in the selected environment and time range, matching the exact ID. Blank lookup returns no records. Not every service propagates the same request ID; use a shared trace ID when available.',
        targets: [{ refId: 'A', datasource: { type: 'loki', uid: '${loki}' }, expr: query, queryType: 'range', direction: 'backward', maxLines: 100 }],
        transformations: [
          { id: 'extractFields', options: { source: 'labels', format: 'json', replace: false } },
          { id: 'filterFieldsByName', options: { include: { names: ['Line', 'service_name', 'service_version'] } } },
          { id: 'extractFields', options: { source: 'Line', format: 'json', replace: false } },
          { id: 'filterFieldsByName', options: { include: { names: fields } } },
          { id: 'organize', options: { indexByName: Object.fromEntries(fields.map((field, index) => [field, index])) } },
          { id: 'sortBy', options: { sort: [{ field: 'timestamp', desc: true }] } },
        ],
        fieldConfig: { defaults: { noValue: '—', custom: { filterable: true, minWidth: 100, cellOptions: { type: 'auto' } } }, overrides: [
          ...fields.map((field, index) => ({ matcher: { id: 'byName', options: field }, properties: [{ id: 'displayName', value: names[index] }] })),
          { matcher: { id: 'byName', options: 'duration_ms' }, properties: [{ id: 'unit', value: 'ms' }] },
          { matcher: { id: 'byName', options: 'timestamp' }, properties: [{ id: 'unit', value: 'dateTimeAsIso' }] },
        ] }, options: { showHeader: true, cellHeight: 'sm', footer: { show: false } },
      },
    ],
  });
}

export function grafanaApi(env, fetcher = fetch) {
  const origin = new URL(env.GRAFANA_URL);
  if (origin.protocol !== 'https:' || origin.port || !/^[a-z0-9-]+\.grafana\.net$/.test(origin.hostname) || origin.origin + '/' !== origin.href) throw new Error('Use the HTTPS Grafana stack origin');
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN) throw new Error('Set GRAFANA_SERVICE_ACCOUNT_TOKEN privately');
  return async (path, method = 'GET', body, allow404 = false) => {
    const response = await fetcher(origin.origin + path, { method, headers: { Authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-Disable-Provenance': 'true' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (allow404 && response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Grafana ${method} ${path.split('?')[0]} returned HTTP ${response.status}`); }
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) throw new Error('Grafana response exceeded 2 MiB');
    return text ? JSON.parse(text) : {};
  };
}

export async function provisionInvestigations({ args = process.argv.slice(2), env = process.env, fetcher = fetch, log = console.log } = {}) {
  if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) throw new Error('Use --check for a read-only plan or --apply to update investigation links');
  const api = grafanaApi(env, fetcher);
  const datasources = await api('/api/datasources');
  const loki = datasources.find(source => source.uid === env.GRAFANA_LOKI_UID && source.type === 'loki');
  const tempo = datasources.find(source => source.uid === (env.GRAFANA_TEMPO_UID ?? 'grafanacloud-traces') && source.type === 'tempo');
  if (!loki || !tempo) throw new Error('Configure the Loki and Tempo datasource UIDs');
  const updates = [];
  for (const uid of [...dashboardUids, 'phaseo-investigation']) {
    const existing = await api(`/api/dashboards/uid/${uid}`, 'GET', undefined, uid === 'phaseo-investigation');
    if (existing && (!existing.dashboard.tags?.includes('phaseo') || existing.meta.folderUid !== 'phaseo-observability')) throw new Error(`Dashboard ownership mismatch: ${uid}`);
    updates.push(uid === 'phaseo-investigation' ? { ...investigationDashboard(loki.uid, tempo.uid), ...(existing ? { id: existing.dashboard.id, version: existing.dashboard.version } : {}) } : enhanceInvestigations(existing.dashboard));
  }
  if (args[0] === '--apply') for (const dashboard of updates) {
    // Keep the read version and omit overwrite, so a concurrent UI edit fails.
    await api('/api/dashboards/db', 'POST', { dashboard, folderUid: 'phaseo-observability', message: 'Add related records and release investigation links' });
    log(`Updated ${dashboard.uid}`);
  }
  else log(`Ready: ${updates.map(dashboard => dashboard.uid).join(', ')}; existing layouts and deployment annotations preserved`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) provisionInvestigations().catch(error => { console.error(error.message); process.exitCode = 1; });

import { pathToFileURL } from 'node:url';
import { dashboards, alertRules } from './definitions.mjs';
import { allPanels } from './presentation.mjs';

export function rulerGroup(rules) {
  return { name: rules[0].ruleGroup, interval: '1m', rules: rules.map(rule => ({
    expr: '', for: rule.for, keep_firing_for: '0s', labels: rule.labels, annotations: rule.annotations,
    grafana_alert: { uid: rule.uid, title: rule.title, condition: rule.condition, data: rule.data,
      no_data_state: rule.noDataState, exec_err_state: rule.execErrState, is_paused: rule.isPaused, missing_series_evals_to_resolve: 2 },
  })) };
}

function stackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.grafana\.net$/.test(url.hostname)
    || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('GRAFANA_URL must be your HTTPS stack origin');
  return url.origin;
}
export async function provision({ args = process.argv.slice(2), env = process.env, fetcher = fetch, log = console.log } = {}) {
  const allowed = new Set(['--apply', '--check', '--enable-alerts', '--frontend', '--dashboards-only']);
  if (args.some(arg => !allowed.has(arg)) || (args.includes('--apply') && args.includes('--check')) || ((args.includes('--enable-alerts') || args.includes('--frontend') || args.includes('--dashboards-only')) && !args.includes('--apply')) || (args.includes('--dashboards-only') && (args.includes('--enable-alerts') || args.includes('--frontend')))) throw new Error('Use no flags for dry-run, --check for live query validation, or --apply [--dashboards-only | --enable-alerts] [--frontend]');
  const apply = args.includes('--apply');
  const check = args.includes('--check');
  const dashboardsOnly = args.includes('--dashboards-only');
  const environment = env.GRAFANA_ENVIRONMENT ?? 'production';
  const origins = (env.GRAFANA_FRONTEND_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (args.includes('--frontend') && (!origins.length || origins.some(value => {
    try { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value || url.username || url.password; } catch { return true; }
  }))) throw new Error('Set GRAFANA_FRONTEND_ORIGINS to a comma-separated list of exact HTTPS origins');
  const folderUid = 'phaseo-observability';
  const definitions = dashboards();
  const rules = alertRules({ lokiUid: env.GRAFANA_LOKI_UID ?? 'SET_LOKI_DATASOURCE_UID', environment, folderUid, enabled: args.includes('--enable-alerts') });
  if (!apply && !check) {
    log(JSON.stringify({ mode: 'dry-run', environment, folder: folderUid, dashboards: definitions.map(item => item.uid), alerts: rules.map(item => ({ uid: item.uid, paused: item.isPaused })) }, null, 2));
    return;
  }
  const origin = stackOrigin(env.GRAFANA_URL);
  if (!env.GRAFANA_SERVICE_ACCOUNT_TOKEN || !env.GRAFANA_LOKI_UID) throw new Error('Set GRAFANA_SERVICE_ACCOUNT_TOKEN and GRAFANA_LOKI_UID privately');
  const api = async (path, method = 'GET', body, allow404 = false) => {
    const response = await fetcher(`${origin}${path}`, {
      method, headers: { Authorization: `Bearer ${env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`, 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-Disable-Provenance': 'true' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (allow404 && response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Grafana ${method} ${path.split('?')[0]} returned HTTP ${response.status}`); }
    const reader = response.body?.getReader();
    let size = 0;
    const chunks = [];
    if (reader) while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Grafana response exceeded 1 MiB'); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder().decode(bytes);
    return text ? JSON.parse(text) : {};
  };
  const datasource = await api(`/api/datasources/uid/${encodeURIComponent(env.GRAFANA_LOKI_UID)}`);
  if (datasource.type !== 'loki') throw new Error('GRAFANA_LOKI_UID must identify a Loki datasource');
  const usageDatasource = await api(`/api/datasources/uid/${encodeURIComponent(env.GRAFANA_USAGE_UID ?? 'grafanacloud-usage')}`);
  if (usageDatasource.type !== 'prometheus') throw new Error('GRAFANA_USAGE_UID must identify the grafanacloud-usage Prometheus datasource');
  if (check) {
    // Read-only: evaluate dashboard expressions against their own backend.
    // Empty results prove syntax/access, not that collection is working.
    for (const dashboard of definitions) for (const panel of allPanels(dashboard.panels)) for (const target of panel.targets ?? []) {
      const query = target.expr.replaceAll('$__auto', '5m').replaceAll('$__range', '1h').replaceAll('$environment', environment).replace(/\$\{(?:request|route|provider|model|job):regex\}/g, '');
      const usage = panel.datasource.type === 'prometheus';
      const endpoint = panel.type === 'logs' || target.maxLines ? 'query_range' : 'query';
      const path = usage ? `/api/datasources/proxy/uid/${encodeURIComponent(usageDatasource.uid)}/api/v1/query` : `/api/datasources/proxy/uid/${encodeURIComponent(env.GRAFANA_LOKI_UID)}/loki/api/v1/${endpoint}`;
      const result = await api(`${path}?${new URLSearchParams({ query, ...(usage ? {} : { limit: '1' }) })}`);
      if (result.status !== 'success') throw new Error(`Query validation failed: ${panel.title}`);
      log(`${dashboard.title} / ${panel.title} / ${target.refId}: valid (${result.data?.result?.length ?? 0} series)`);
    }
    for (const rule of rules) {
      const result = await api(`/api/datasources/proxy/uid/${encodeURIComponent(env.GRAFANA_LOKI_UID)}/loki/api/v1/query?${new URLSearchParams({ query: rule.data[0].model.expr })}`);
      if (result.status !== 'success') throw new Error(`Alert query validation failed: ${rule.title}`);
      log(`${rule.title}: valid`);
    }
    return;
  }
  // Preflight ownership for every stable UID before making any writes.
  // Grafana Cloud can return 403 for an unknown folder UID. List visible root
  // folders instead; creating a colliding hidden UID will still fail safely.
  const folders = await api('/api/folders?limit=1000');
  if (!Array.isArray(folders)) throw new Error('Unexpected Grafana folder listing');
  const folder = folders.find(item => item.uid === folderUid);
  if (folder && folder.title !== 'Phaseo observability') throw new Error('Folder UID belongs to another folder');
  for (const dashboard of definitions) {
    const existing = await api(`/api/dashboards/uid/${dashboard.uid}`, 'GET', undefined, true);
    if (existing && (!existing.dashboard?.tags?.includes('phaseo') || existing.meta?.folderUid !== folderUid)) throw new Error(`Dashboard UID collision: ${dashboard.uid}`);
  }
  for (const rule of dashboardsOnly ? [] : rules) {
    const existing = await api(`/api/v1/provisioning/alert-rules/${rule.uid}`, 'GET', undefined, true);
    if (existing && (existing.labels?.application !== 'phaseo' || existing.folderUID !== folderUid)) throw new Error(`Alert UID collision: ${rule.uid}`);
  }
  // Use the rule API available to Grafana Editors. The provisioning write API
  // requires a separate privileged role in current Grafana Cloud stacks.
  const namespace = dashboardsOnly ? null : await api(`/api/ruler/grafana/api/v1/rules/${folderUid}`, 'GET', undefined, true);
  const existingGroup = Object.values(namespace ?? {}).flat().find(group => group?.name === rules[0].ruleGroup);
  if (existingGroup && existingGroup.rules?.some(rule => rule.labels?.application !== 'phaseo')) throw new Error('Alert group contains rules owned by another application');
  if (!folder) await api('/api/folders', 'POST', { uid: folderUid, title: 'Phaseo observability' });
  for (const dashboard of definitions) {
    const configured = structuredClone(dashboard);
    const selectedDatasource = configured.uid === 'phaseo-free-tier' ? usageDatasource : datasource;
    configured.templating.list[0].current = { text: selectedDatasource.name, value: selectedDatasource.uid };
    if (configured.uid === 'phaseo-free-tier') configured.templating.list[0].regex = `/^${usageDatasource.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$/`;
    await api('/api/dashboards/db', 'POST', { dashboard: configured, folderUid, overwrite: true, message: 'Phaseo observability definitions' });
    log(`Dashboard: ${origin}/d/${dashboard.uid}`);
  }
  if (!dashboardsOnly) await api(`/api/ruler/grafana/api/v1/rules/${folderUid}`, 'POST', rulerGroup(rules));
  for (const rule of dashboardsOnly ? [] : rules) {
    log(`Alert ${rule.uid}: ${rule.isPaused ? 'paused' : 'enabled'}`);
  }
  if (args.includes('--frontend')) {
    const path = '/api/plugin-proxy/grafana-kowalski-app/api-proxy/api/v1/app';
    const apps = await api(path);
    if (!Array.isArray(apps)) throw new Error('Unexpected Frontend Observability application list');
    const frontend = apps.find(app => app.name === 'phaseo-web') ?? await api(path, 'POST', {
      name: 'phaseo-web', corsOrigins: origins.map(url => ({ url })),
      settings: { 'geolocation.enabled': '0', combineLabData: '0' },
    });
    const collector = frontend.collectEndpointURL?.replace(/\/$/, '');
    const endpoint = collector?.endsWith('/collect') && frontend.appKey ? `${collector}/${encodeURIComponent(frontend.appKey)}` : collector;
    log(`Frontend collector: ${endpoint}`);
    log('Existing frontend application settings and origins are preserved; review them in Frontend Observability.');
  }
  log('No contact points, notification policies, datasources or unrelated resources were changed.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  provision().catch(error => { console.error(error.message); process.exitCode = 1; });
}

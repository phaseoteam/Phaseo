import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { grafanaApi } from './investigations.mjs';

const apiVersion = 'notifications.alerting.grafana.app/v0alpha1';
const receiverTitle = 'Phaseo incident.io';
const integrationUid = 'phaseo-incidentio-webhook';

export function incidentCredentials(env) {
  let url;
  try { url = new URL(env.INCIDENT_GRAFANA_WEBHOOK_URL); } catch { throw new Error('Set the incident.io Grafana source URL privately'); }
  if (url.origin !== 'https://api.incident.io' || url.username || url.password || url.search || url.hash || !/^\/v2\/alert_events\/grafana\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) throw new Error('Use an incident.io Grafana alert-source URL');
  if (!env.INCIDENT_GRAFANA_BEARER_TOKEN?.trim() || /[\r\n]/.test(env.INCIDENT_GRAFANA_BEARER_TOKEN)) throw new Error('Set the incident.io Grafana source bearer token privately');
  return { url: url.href, authorization_scheme: 'Bearer', authorization_credentials: env.INCIDENT_GRAFANA_BEARER_TOKEN.trim(), httpMethod: 'POST' };
}

export function notificationRoute(source) {
  const tree = structuredClone(source);
  const owned = tree.spec.routes.filter(route => route.receiver === receiverTitle);
  if (owned.some(route => route.matchers?.length !== 2 || !['application', 'environment'].every(label => route.matchers.some(matcher => matcher.label === label && matcher.type === '=' && matcher.value === (label === 'application' ? 'phaseo' : 'production'))))) throw new Error('Existing incident.io route has different ownership matchers');
  tree.spec.routes = [
    { receiver: receiverTitle, matchers: [{ label: 'application', type: '=', value: 'phaseo' }, { label: 'environment', type: '=', value: 'production' }],
      continue: false, group_by: ['grafana_folder', 'alertname', 'environment'], group_wait: '30s', group_interval: '5m', repeat_interval: '4h' },
    ...tree.spec.routes.filter(route => route.receiver !== receiverTitle),
  ];
  return tree;
}

export function investigationAnnotations(uid, origin) {
  const destination = uid.includes('gateway-errors') ? 'gateway' : uid.includes('scheduler-missing') ? 'telemetry' : /jobs-failing|ops-failing/.test(uid) ? 'jobs' : 'web';
  return {
    dashboard_url: `${origin}/d/phaseo-${destination}?var-environment=production&from=now-1h&to=now`,
    runbook_url: 'https://github.com/phaseoteam/Phaseo/blob/main/docs/operations/incident-response.md#first-15-minutes',
    description: 'Open the service dashboard for failures and deployment markers. Click a request or trace ID for related records; sampled traces may be absent. Confirm customer impact before declaring an incident or changing the public status page.',
  };
}

export async function provisionNotifications({ args = process.argv.slice(2), env = process.env, fetcher = fetch, log = console.log } = {}) {
  if (!args.length || args.some(arg => !['--check', '--apply', '--enable-alerts'].includes(arg)) || args.includes('--check') === args.includes('--apply') || (args.includes('--enable-alerts') && !args.includes('--apply'))) throw new Error('Use --check or --apply [--enable-alerts]');
  const apply = args.includes('--apply');
  const settings = apply ? incidentCredentials(env) : null;
  const api = grafanaApi(env, fetcher);
  const frontend = await api('/api/frontend/settings');
  if (!/^stacks-[0-9]+$/.test(frontend.namespace)) throw new Error('Unexpected Grafana Cloud namespace');
  const path = `/apis/${apiVersion}/namespaces/${frontend.namespace}`;
  const receivers = await api(`${path}/receivers`);
  const existing = receivers.items.find(receiver => receiver.spec.title === receiverTitle);
  if (existing && (existing.spec.integrations.length !== 1 || existing.spec.integrations[0].uid !== integrationUid || existing.spec.integrations[0].type !== 'webhook')) throw new Error('Contact point name belongs to another configuration');
  const trees = await api(`${path}/routingtrees`);
  const tree = trees.items.find(item => item.metadata.name === 'user-defined');
  if (!tree) throw new Error('User notification policy was not found');
  const routing = notificationRoute(tree);
  const groups = await api('/api/ruler/grafana/api/v1/rules/phaseo-observability');
  const group = Object.values(groups).flat().find(item => item.name === 'phaseo-production');
  if (!group?.rules?.length || group.rules.some(rule => rule.labels?.application !== 'phaseo' || rule.labels?.environment !== 'production')) throw new Error('Production alert group ownership mismatch');
  if (!apply) {
    log(JSON.stringify({ destination: receiverTitle, contactPointExists: Boolean(existing), productionRouteExists: tree.spec.routes.some(route => route.receiver === receiverTitle), rules: group.rules.map(rule => ({ title: rule.grafana_alert.title, paused: rule.grafana_alert.is_paused })) }));
    return;
  }
  const receiver = { apiVersion, kind: 'Receiver', metadata: existing?.metadata ?? { namespace: frontend.namespace },
    spec: { title: receiverTitle, integrations: [{ uid: integrationUid, type: 'webhook', version: 'v1', disableResolveMessage: false, settings }] } };
  // Grafana requires an empty name on create and returns the generated name.
  const created = await api(`${path}/receivers${existing ? '/' + existing.metadata.name : ''}`, existing ? 'PUT' : 'POST', receiver);
  const receiverName = existing?.metadata.name ?? created.metadata?.name;
  if (!receiverName || !/^[a-zA-Z0-9_-]+$/.test(receiverName)) throw new Error('Grafana did not return a contact point name; alerts remain unchanged');
  const saved = await api(`${path}/receivers/${receiverName}`);
  if (!saved.spec.integrations[0]?.secureFields?.authorization_credentials) throw new Error('Grafana did not confirm secure storage of the source token; alerts remain unchanged');
  await api(`${path}/routingtrees/user-defined`, 'PUT', routing);
  const savedTree = await api(`${path}/routingtrees/user-defined`);
  if (!isDeepStrictEqual(savedTree.spec, routing.spec)) throw new Error('Notification policy readback mismatch; alerts remain unchanged');
  const updated = structuredClone(group);
  for (const rule of updated.rules) {
    rule.annotations = { ...rule.annotations, ...investigationAnnotations(rule.grafana_alert.uid, new URL(env.GRAFANA_URL).origin) };
    if (args.includes('--enable-alerts')) rule.grafana_alert.is_paused = false;
  }
  await api('/api/ruler/grafana/api/v1/rules/phaseo-observability', 'POST', updated);
  log(`Configured ${receiverTitle}; production-only routing, recovery notifications and investigation links saved. Alert state ${args.includes('--enable-alerts') ? 'enabled' : 'preserved'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) provisionNotifications().catch(error => { console.error(error.message); process.exitCode = 1; });

// Native Grafana layout and styling, independent of collection and queries.
export const allPanels = panels => panels.flatMap(panel => [panel, ...allPanels(panel.panels ?? [])]);

const override = (matcher, properties) => ({ matcher, properties: Object.entries(properties).map(([id, value]) => ({ id, value })) });
const named = (name, properties) => override({ id: 'byName', options: name }, properties);
const matching = (pattern, properties) => override({ id: 'byRegexp', options: pattern }, properties);
const colors = { gateway: '#5794F2', web: '#6ED0E0', jobs: '#B877D9', error: '#F2495C', quiet: '#8E8E8E' };

function style(panel) {
  if (panel.type === 'timeseries') {
    const labels = { 'Gateway p95 duration': 'Gateway', 'Web API p95 headers': 'Web API', 'Web API requests / second': 'Web API', 'Web API 5xx / second': 'Server errors', 'Web server captured errors': 'Server errors', 'Scheduler ticks / 15 minutes': 'Heartbeats', 'Persistence delivery failures': 'Delivery failures', 'Attempt batches truncated': 'Truncated requests', 'Requests requiring fallback / second': 'Fallbacks', 'Client cancellations / second': 'Cancelled' };
    for (const target of panel.targets) if (!target.legendFormat) target.legendFormat = labels[panel.title] ?? panel.title;
    const sparse = /^(Gateway p95 duration|Requests by outcome|Provider attempts|Streaming p95|Provider p95|.*job invocations|Job p95)/.test(panel.title);
    Object.assign(panel.fieldConfig.defaults, {
      min: 0,
      color: { mode: 'palette-classic-by-name' },
      custom: { ...panel.fieldConfig.defaults.custom, drawStyle: 'line', lineInterpolation: 'linear', lineWidth: 2, fillOpacity: 8, showPoints: sparse ? 'always' : 'auto', pointSize: 4, spanNulls: false, axisBorderShow: false },
    });
    panel.fieldConfig.overrides.push(
      matching('^(Gateway|phaseo-gateway)$', { color: { mode: 'fixed', fixedColor: colors.gateway } }),
      matching('^(Web API|phaseo-web-api|phaseo-web)$', { color: { mode: 'fixed', fixedColor: colors.web } }),
      matching('^(Job failures|phaseo-jobs)$', { color: { mode: 'fixed', fixedColor: colors.jobs } }),
      matching('^(error|.* · error|Gateway actionable|Web API 5xx|Website server errors|Operational failures|Server errors|Delivery failures)$', { color: { mode: 'fixed', fixedColor: colors.error } }),
      matching('^(success|completed|.* · success)$', { color: { mode: 'fixed', fixedColor: 'green' } }),
      matching('^(cancelled|skipped)$', { color: { mode: 'fixed', fixedColor: colors.quiet } }),
    );
    panel.options = { legend: { displayMode: 'list', placement: 'bottom', calcs: [] }, tooltip: { mode: 'multi', sort: 'desc' } };
  }
  if (panel.type === 'table') {
    Object.assign(panel.fieldConfig.defaults.custom, { minWidth: 90, align: 'auto' });
    panel.fieldConfig.overrides.push(
      named('service_name', { mappings: [{ type: 'value', options: { 'phaseo-gateway': { text: 'Gateway' }, 'phaseo-web-api': { text: 'Web API' }, 'phaseo-web': { text: 'Website' }, 'phaseo-jobs': { text: 'Jobs' } } }], 'custom.width': 115 }),
      ...['Failures', 'Failure %', 'error', 'failed_count'].map(name => named(name, {
        'custom.cellOptions': { type: 'color-text' },
        thresholds: { mode: 'absolute', steps: [{ color: colors.quiet, value: null }, { color: colors.error, value: 0.000001 }] },
        color: { mode: 'thresholds' },
      })),
      named('completed', { displayName: 'Completed' }),
      named('error', { displayName: 'Failed' }),
      named('skipped', { displayName: 'Skipped' }),
      named('route', { 'custom.width': 260 }),
      named('model', { 'custom.width': 220 }),
      named('job', { 'custom.width': 220 }),
      named('p95 ms', { displayName: 'p95 latency' }),
      named('timestamp', { 'custom.width': 190 }),
      ...['request_id', 'trace_id'].map(name => named(name, { 'custom.width': 160, 'custom.inspect': true })),
      named('service_version', { 'custom.width': 140, 'custom.inspect': true }),
      named('outcome', { 'custom.width': 105, 'custom.cellOptions': { type: 'color-text' }, mappings: [{ type: 'value', options: {
        success: { text: 'Succeeded', color: 'green' }, completed: { text: 'Completed', color: 'green' }, error: { text: 'Failed', color: colors.error }, cancelled: { text: 'Cancelled', color: colors.quiet }, skipped: { text: 'Skipped', color: colors.quiet }, started: { text: 'Started', color: colors.web },
      } }] }),
    );
    if (panel.title === 'Grouped failures') {
      const order = ['service_name', 'Value #A', 'route', 'error_name', 'error_kind', 'error_code', 'error_digest', 'status_code', 'job', 'event_name'];
      panel.transformations.find(transform => transform.id === 'organize').options.indexByName = Object.fromEntries(order.map((name, index) => [name, index]));
    }
  }
  if (panel.type === 'stat') {
    if (panel.title === 'Web API requests') panel.fieldConfig.defaults.color.fixedColor = colors.web;
    panel.options.text = { titleSize: 14, valueSize: 32 };
    panel.options.justifyMode = 'center';
    panel.options.wideLayout = true;
  }
  return panel;
}

function layout(dashboard, compose) {
  const available = new Map(dashboard.panels.map(panel => [panel.title, style(panel)]));
  let y = 0;
  let nextId = Math.max(...dashboard.panels.map(panel => panel.id)) + 1;
  const take = title => {
    const panel = available.get(title);
    if (!panel) throw new Error(`Unknown panel: ${dashboard.uid} / ${title}`);
    available.delete(title);
    return panel;
  };
  const line = (titles, height = 8) => {
    const width = 24 / titles.length;
    const panels = titles.map((title, index) => ({ ...take(title), gridPos: { x: index * width, y, w: width, h: height } }));
    y += height;
    return panels;
  };
  const section = (title, titles, { collapsed = false, height = 8, paired = false } = {}) => {
    const row = { id: nextId++, title, type: 'row', collapsed, gridPos: { x: 0, y: y++, w: 24, h: 1 }, panels: [] };
    const start = y;
    const children = [];
    for (let index = 0; index < titles.length; index += paired ? 2 : 1) children.push(...line(titles.slice(index, index + (paired ? 2 : 1)), height));
    if (!collapsed) return [row, ...children];
    row.panels = children;
    y = start;
    return [row];
  };
  dashboard.panels = compose({ line, section, take });
  const omitted = {
    'phaseo-overview': ['Investigate and recover'],
    'phaseo-gateway': ['Request lookup'],
    'phaseo-web': ['Web API failures', 'Web server errors'],
    'phaseo-free-tier': ['Increase coverage deliberately'],
  };
  // These are duplicate records or superseded instruction blocks. Fail rather
  // than silently hide a newly added diagnostic that has no layout assignment.
  for (const title of available.keys()) if (!omitted[dashboard.uid]?.includes(title)) throw new Error(`Panel needs a layout: ${dashboard.uid} / ${title}`);
  // Sort by position for Grafana's legacy grid; IDs remain stable across imports.
  dashboard.panels.sort((a, b) => a.gridPos.y - b.gridPos.y || a.gridPos.x - b.gridPos.x);
  for (const variable of dashboard.templating.list) if (['loki', 'tempo', 'usage'].includes(variable.name)) variable.hide = 2;
  if (dashboard.uid !== 'phaseo-gateway') {
    const request = dashboard.templating.list.find(variable => variable.name === 'request');
    if (request) request.hide = 2;
  }
  for (const link of dashboard.links) if (link.title === 'Frontend Observability') link.title = 'Browser monitoring';
  return dashboard;
}

export function presentDashboards(dashboards) {
  const [overview, gateway, web, jobs, telemetry, free] = dashboards;
  layout(overview, ({ line, section, take }) => {
    const help = take('Start here');
    help.title = 'Reading this view';
    help.options.content = '**Cards:** totals for the selected range; click one to investigate. **Trends:** hover for values, drag to zoom, click a legend to isolate a series. **Tables:** click a column heading to sort; use column filters to narrow results.\n\nExpand **Event records** for request and trace links. Counts cover received telemetry; no matching data does not establish uptime. Scheduler telemetry uses the five minutes before the range ends.';
    const content = [
      ...line(['Gateway requests', 'Web API requests', 'Job failures'], 3),
      ...line(['Gateway failures', 'Web API 5xx', 'Scheduler telemetry · last 5m'], 3),
      ...line(['Traffic · per interval', 'Failures · per interval']),
      ...line(['Gateway p95 duration', 'Web API p95 headers'], 7),
      ...section('Service health', ['Service request health'], { height: 5 }),
      ...line(['Grouped failures'], 8),
      ...section('Event records', ['Recent actionable events'], { collapsed: true }),
      ...section('Outcomes and providers', ['Gateway outcomes', 'Web API responses by status', 'Web API 5xx by route', 'Provider attempt failures'], { collapsed: true, paired: true, height: 7 }),
    ];
    return [...content, { ...help, gridPos: { x: 0, y: content.at(-1).gridPos.y + 1, w: 24, h: 3 } }];
  });
  layout(gateway, ({ line, section }) => [
    ...line(['Requests by outcome', 'Provider attempts / second']),
    ...line(['Streaming p95 time to first token', 'Provider p95 first token'], 7),
    ...section('Provider health', ['Provider and model attempts'], { height: 9 }),
    ...line(['Gateway failure reasons'], 7),
    ...line(['Requests requiring fallback / second', 'Client cancellations / second'], 6),
    ...section('Request and attempt records', ['Request records', 'Provider attempt lookup'], { collapsed: true }),
  ]);
  layout(web, ({ line, section }) => [
    ...line(['Web API requests / second', 'Web API 5xx / second']),
    ...line(['Web API p95 headers', 'Web server captured errors'], 7),
    ...section('Routes and errors', ['Web API route health'], { height: 9 }),
    ...line(['Grouped failures'], 8),
    ...line(['Website errors by release'], 7),
    ...section('Request and error records', ['Recent web API failures', 'Slow web API requests', 'Website error records'], { collapsed: true }),
  ]);
  layout(jobs, ({ line, section }) => [
    ...line(['Completed job invocations', 'Failed job invocations']),
    ...line(['Job p95 duration', 'Disabled job invocations'], 7),
    ...section('Job health', ['Job execution results'], { height: 8 }),
    ...line(['Failed job records'], 7),
    ...line(['Operational failures'], 7),
    ...section('Recent job records', ['Recent job runs'], { collapsed: true }),
  ]);
  layout(telemetry, ({ line, section }) => [
    ...line(['Received events / second', 'Scheduler ticks / 15 minutes']),
    ...line(['Persistence delivery failures', 'Attempt batches truncated'], 7),
    ...section('Collection coverage', ['Collected event types'], { height: 8 }),
    ...section('Delivery records', ['Recent heartbeats', 'Persistence errors'], { collapsed: true }),
  ]);
  layout(free, ({ line, section, take }) => {
    const guide = take('Stay on Free');
    guide.options.content = 'Organization-wide monthly usage against **permanent Free allowances**. Amber: 80%. Red: 100%. Missing data stays **Unavailable**. These bars do not cap collection. Free includes 14-day metrics/logs/traces retention and 3 active Grafana users. [Billing/Usage](/dashboards?query=Billing%2FUsage) · [Account plan](https://grafana.com/profile/org)';
    guide.title = 'Free allowances';
    guide.gridPos = { x: 0, y: 0, w: 24, h: 3 };
    // Reserve space for the concise guide before the first budget row.
    const budgets = line(['Metric series / 10,000', 'Logs / 50 GB', 'Traces / 50 GB'], 3);
    const checks = line(['Browser sessions / 50,000', 'API check executions / 100,000', 'Browser checks / 10,000'], 3);
    const rest = [
      ...section('Ingestion pace', ['Logs · 31-day pace estimate', 'Traces · 31-day pace estimate'], { paired: true, height: 4 }),
      ...line(['Logs · received bytes per second', 'Traces · received bytes per second'], 7),
      ...section('Collection details', ['Active series · current', 'Browser sessions · per second', 'Metric samples rejected · per second', 'Trace spans received · per second'], { collapsed: true, paired: true, height: 7 }),
    ];
    for (const panel of [...budgets, ...checks, ...rest]) {
      panel.gridPos.y += 3;
      for (const child of panel.panels ?? []) child.gridPos.y += 3;
    }
    for (const panel of [...budgets, ...checks]) {
      panel.type = 'bargauge';
      panel.fieldConfig.defaults.max = panel.fieldConfig.defaults.thresholds.steps.at(-1).value;
      panel.options = { orientation: 'horizontal', displayMode: 'basic', showUnfilled: true, sizing: 'manual', minVizHeight: 24, maxVizHeight: 32, text: { valueSize: 20 }, reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } };
    }
    return [guide, ...budgets, ...checks, ...rest];
  });
  return dashboards;
}

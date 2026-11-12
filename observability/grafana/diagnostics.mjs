// Native Grafana tables over existing, redacted Loki events. No new collection.
const datasource = { type: 'loki', uid: '${loki}' };
const field = (name, properties) => ({ matcher: { id: 'byName', options: name }, properties: Object.entries(properties).map(([id, value]) => ({ id, value })) });
const columnNames = { service_name: 'Service', event_name: 'Event', route: 'Route', method: 'Method', provider: 'Provider', model: 'Model', job: 'Job', service_version: 'Release', error_origin: 'Origin', error_kind: 'Category', error_code: 'Code', error_name: 'Error', error_digest: 'Fingerprint', status_code: 'HTTP', timestamp: 'Time (UTC)', request_id: 'Request ID', trace_id: 'Trace ID', outcome: 'Outcome', duration_ms: 'Duration', ttft_ms: 'First token', provider_ttft_ms: 'Provider first token', attempt_count: 'Attempts', attempt_number: 'Attempt', error_stack: 'Source frames', signal: 'Source', reason: 'Reason', failed_count: 'Failed items', processed_count: 'Processed items', scheduled_at: 'Scheduled at' };
const incidentTime = 'var-environment=$environment&from=$__from&to=$__to';
const drilldown = (dashboard, variable, column) => ({ title: 'Investigate', url: `/d/phaseo-${dashboard}?${incidentTime}&var-${variable}=\${__data.fields["${column}"]}` });

function table(title, metrics, dimensions, description, { sort = Object.keys(metrics)[0], overrides = [] } = {}) {
  const metricColumns = Object.keys(metrics).map((name, index) => [`Value #${String.fromCharCode(65 + index)}`, name]);
  const columns = [...dimensions, ...metricColumns.map(([source]) => source)];
  // Loki's browser adapter converts each instant query into a table with a
  // Value #refId column before panel transformations. Rename those columns and
  // merge on dimensions; labelsToFields cannot pivot these adapted frames.
  return {
    title, type: 'table', datasource, description,
    targets: Object.entries(metrics).map(([name, expr], index) => ({ refId: String.fromCharCode(65 + index), datasource, queryType: 'instant', instant: true, range: false, expr, legendFormat: name })),
    transformations: [
      { id: 'filterFieldsByName', options: { exclude: { names: ['Time'] } } },
      { id: 'merge', options: {} },
      { id: 'organize', options: { indexByName: Object.fromEntries(columns.map((name, index) => [name, index])), renameByName: Object.fromEntries(metricColumns) } },
      { id: 'sortBy', options: { sort: [{ field: sort, desc: true }] } },
    ],
    fieldConfig: { defaults: { unit: 'short', decimals: 0, noValue: '—', custom: { filterable: true, cellOptions: { type: 'auto' } } }, overrides: [
      ...dimensions.map(name => field(name, { displayName: columnNames[name] ?? name })),
      field('Failure %', { unit: 'percent', decimals: 2 }),
      field('p95 ms', { unit: 'ms', decimals: 1 }),
      ...overrides,
    ] },
    options: { showHeader: true, cellHeight: 'sm', footer: { show: false } },
  };
}

function exploreUrl(source, queries) {
  const panes = encodeURIComponent(JSON.stringify({ investigate: { datasource: source, queries, range: { from: '${__from}', to: '${__to}' } } }))
    .replace(/%24%7B(.*?)%7D/g, (_match, variable) => `\${${decodeURIComponent(variable)}}`)
    .replaceAll('%24environment', '$environment');
  return `/explore?schemaVersion=1&panes=${panes}`;
}

export function records(title, expression, columns, description) {
  const traceUrl = exploreUrl('${tempo}', [{ refId: 'A', queryType: 'traceId', query: '${__value.raw}' }]);
  return {
    title, type: 'table', datasource, description,
    targets: [{ refId: 'A', datasource, expr: expression, queryType: 'range', instant: false, range: true, maxLines: 100, direction: 'backward' }],
    transformations: [
      { id: 'extractFields', options: { source: 'labels', format: 'json', replace: false } },
      { id: 'filterFieldsByName', options: { include: { names: ['Line', 'service_name', 'service_version'] } } },
      { id: 'extractFields', options: { source: 'Line', format: 'json', replace: false } },
      { id: 'filterFieldsByName', options: { include: { names: columns } } },
      { id: 'organize', options: { indexByName: Object.fromEntries(columns.map((name, index) => [name, index])) } },
      { id: 'sortBy', options: { sort: [{ field: 'timestamp', desc: true }] } },
    ],
    fieldConfig: { defaults: { noValue: '—', custom: { filterable: true, cellOptions: { type: 'auto' } } }, overrides: [
      ...columns.map(name => field(name, { displayName: columnNames[name] ?? name })),
      field('duration_ms', { unit: 'ms', decimals: 1 }),
      field('ttft_ms', { unit: 'ms', decimals: 1 }),
      field('provider_ttft_ms', { unit: 'ms', decimals: 1 }),
      field('outcome', { mappings: [{ type: 'value', options: { success: { text: 'Succeeded' }, error: { text: 'Failed' }, completed: { text: 'Completed' }, skipped: { text: 'Skipped' }, cancelled: { text: 'Cancelled' } } }] }),
      field('scheduled_at', { unit: 'dateTimeAsIso' }),
      field('error_stack', { 'custom.width': 480, 'custom.inspect': true }),
      field('request_id', { links: [drilldown('gateway', 'request', 'request_id')] }),
      field('trace_id', { links: [{ title: 'Open trace', url: traceUrl }] }),
    ] },
    options: { showHeader: true, cellHeight: 'sm', footer: { show: false } },
  };
}

export function addDiagnostics(dashboards, logs) {
  const originalCounts = new Map(dashboards.map(dashboard => [dashboard, dashboard.panels.length]));
  const by = (service, event, dimensions, filter = '', fields = []) => `sum by (${dimensions.join(', ')}) (count_over_time(${logs(service, event, [...dimensions.filter(name => name !== 'service_name'), ...fields])}${filter} | __error__="" [$__range]))`;
  const profile = (title, service, event, dimensions, failureFilter, extraFields, filter = '', link) => {
    const population = event === 'provider.attempt' ? 'Attempts' : 'Requests';
    const total = by(service, event, dimensions, filter, extraFields);
    const failed = by(service, event, dimensions, filter + failureFilter, extraFields);
    const failures = `((${failed}) or (0 * (${total})))`;
    // Include both failing and busy groups so a small failing route isn't hidden
    // behind healthy catalogue traffic. At most twenty rows per table.
    const selection = `(topk(10, ${failed}) or topk(10, ${total}))`;
    const selected = expr => `(${expr}) and on (${dimensions.join(', ')}) ${selection}`;
    const timings = `quantile_over_time(0.95, ${logs(service, event, [...dimensions.filter(name => name !== 'service_name'), ...extraFields, 'duration_ms'])}${filter} | unwrap duration_ms | __error__="" [$__range]) by (${dimensions.join(', ')})`;
    return table(title, { [population]: selected(total), Failures: selected(failures), 'Failure %': selected(`100 * ${failures} / (${total})`), 'p95 ms': selected(timings) }, dimensions,
      `Selected-range received events. Up to 10 failing and 10 busiest groups; sorted by failures. Failure % uses the displayed ${population.toLowerCase()} population. p95 uses available timings; sparse samples are unstable. A dash means unavailable, not zero.${event === 'provider.attempt' ? ' Attempt failures can recover through fallback. Model is the provider model slug; stealth attempts are excluded.' : ' Web API duration measures response headers; gateway duration measures terminal completion.'}`,
      { sort: 'Failures', overrides: link ? [field(dimensions.at(-1), { links: [link] })] : [] });
  };
  const route = ' | route=~".*${route:regex}.*"';
  const provider = ' | provider=~".*${provider:regex}.*" | model=~".*${model:regex}.*"';
  const job = ' | job=~".*${job:regex}.*"';
  const [overview, gateway, web, jobs, telemetry] = dashboards;
  const extend = (dashboard, additions, variables = []) => {
    let y = Math.max(...dashboard.panels.map(p => p.gridPos.y + p.gridPos.h));
    for (const item of additions) {
      dashboard.panels.push({ ...item, id: dashboard.panels.length + 1, gridPos: { x: 0, y, w: 24, h: 9 } });
      y += 9;
    }
    dashboard.templating.list.push({ name: 'tempo', label: 'Traces', type: 'datasource', query: 'tempo', refresh: 1, hide: 2 }, ...variables.map(name => ({ name, label: `${name[0].toUpperCase() + name.slice(1)} contains`, type: 'textbox', query: '', current: { text: '', value: '' } })));
  };
  const issues = (service, event = '', filter = '', fields = []) => table('Grouped failures', {
    Events: `topk(20, ${by(service, event, ['service_name', 'route', 'event_name', 'error_kind', 'error_code', 'error_name', 'error_digest', 'status_code', 'job'], `${filter} | actionable="true"`, [...fields, 'actionable'])})`,
  }, ['service_name', 'route', 'event_name', 'error_kind', 'error_code', 'error_name', 'error_digest', 'status_code', 'job'], 'Up to 20 most frequent failure groups in the selected range. Inspect category, code, digest and route, then expand matching logs for source frames. Event counts are not distinct incidents or affected users. Error messages and customer content are not collected.');
  extend(overview, [
    profile('Service request health', 'phaseo-gateway|phaseo-web-api', '', ['service_name'], ' | actionable="true"', ['actionable', 'event_name'], ' | event_name=~"gateway.request|web.request"'),
    issues('phaseo-gateway|phaseo-web-api|phaseo-web|phaseo-jobs'),
  ]);
  extend(gateway, [
    profile('Provider and model attempts', 'phaseo-gateway', 'provider.attempt', ['provider', 'model'], ' | outcome="error"', ['outcome'], provider, drilldown('gateway', 'model', 'model')),
    table('Gateway failure reasons', { Events: `topk(20, ${by('phaseo-gateway', 'gateway.request', ['error_origin', 'error_kind', 'error_code', 'provider', 'model'], `${provider} | outcome="error"`, ['outcome'])})` }, ['error_origin', 'error_kind', 'error_code', 'provider', 'model'], 'Logical request failures grouped by classification, including non-actionable client rejections. Cancellations are excluded. Attempt failures can recover through fallback.'),
    records('Request records', `${logs('phaseo-gateway', 'gateway.request', ['request_id', 'provider', 'model'])}${provider} | request_id=~"\${request:regex}.*"`, ['timestamp', 'request_id', 'route', 'provider', 'model', 'outcome', 'status_code', 'error_kind', 'error_code', 'duration_ms', 'attempt_count', 'trace_id'], 'Newest 100 matching terminal requests. Search provider, model or request ID above. Click a trace ID to open it. Privacy exclusions, sampling settings and delivery failures can leave a trace unavailable.'),
  ], ['provider', 'model']);
  extend(web, [
    profile('Web API route health', 'phaseo-web-api', 'web.request', ['method', 'route'], ' | status_code >= 500', ['status_code'], route, drilldown('web', 'route', 'route')),
    issues('phaseo-web-api|phaseo-web', '', route, ['route']),
    records('Recent web API failures', `${logs('phaseo-web-api', 'web.request', ['route', 'status_code'])}${route} | status_code >= 500`, ['timestamp', 'method', 'route', 'status_code', 'duration_ms', 'trace_id'], 'Newest 100 matching 5xx responses. Click trace ID for a retained trace. Header timing does not measure streamed response completion.'),
    records('Slow web API requests', `${logs('phaseo-web-api', 'web.request', ['route', 'duration_ms'])}${route} | duration_ms >= 1000 | __error__=""`, ['timestamp', 'method', 'route', 'status_code', 'duration_ms', 'trace_id'], 'Newest 100 requests taking at least one second to response headers. These are recent slow samples, not the slowest requests across the entire range.'),
    records('Website error records', `${logs('phaseo-web', 'web.server_error', ['route'])}${route}`, ['timestamp', 'route', 'signal', 'error_name', 'error_digest', 'error_stack', 'trace_id'], 'Newest 100 captured website errors with redacted source frames. Filter the digest column to inspect a fingerprint. Error messages are omitted, and private source-map upload is not enabled.'),
    table('Website errors by release', { Events: `topk(20, ${by('phaseo-web', 'web.server_error', ['service_version', 'error_name', 'error_digest'], route, ['route', 'error_name', 'error_digest'])})` }, ['service_version', 'error_name', 'error_digest'], 'Captured website server errors by deployed release and fingerprint. No website request denominator exists, so these counts cannot establish a release error rate. Release comes from OTLP service.version metadata.'),
  ], ['route']);
  const jobTotal = by('phaseo-jobs|phaseo-web-api', 'job.run', ['service_name', 'job'], job, ['job']);
  extend(jobs, [
    table('Job execution results', Object.fromEntries(['completed', 'error', 'skipped'].map(outcome => [outcome, `(${by('phaseo-jobs|phaseo-web-api', 'job.run', ['service_name', 'job'], `${job} | outcome="${outcome}"`, ['job', 'outcome'])}) or (0 * (${jobTotal}))`])), ['service_name', 'job'], 'Selected-range invocation counts by outcome. Zero means no observed events for that outcome among jobs with received runs. Completed means the handler returned; disabled/skipped jobs are distinct. This does not measure backlog or data freshness.', { sort: 'error', overrides: [field('job', { links: [drilldown('jobs', 'job', 'job')] })] }),
    records('Failed job records', `${logs('phaseo-jobs|phaseo-web-api', 'job.run', ['job', 'outcome'])}${job} | outcome="error"`, ['timestamp', 'job', 'outcome', 'duration_ms', 'failed_count', 'processed_count', 'scheduled_at'], 'Newest 100 failed invocations. Known item failures appear when the job explicitly emits them; arbitrary internally handled errors are not inferred.'),
  ], ['job']);
  extend(telemetry, [
    table('Collected event types', { Events: `topk(20, ${by('phaseo-.*', '', ['service_name', 'event_name'])})` }, ['service_name', 'event_name'], 'Received events in the selected range. Use this to see which services and event types are actually represented. Counts do not estimate billable bytes or prove uptime.'),
  ]);
  // Apply specialist filters to both original trends and investigative records.
  for (const dashboard of [gateway, web, jobs]) {
    const originalCount = originalCounts.get(dashboard);
    dashboard.templating.list.find(variable => variable.name === 'request').hide = dashboard === gateway ? 0 : 2;
    // Apply search controls at the existing JSON extraction stage so charts and
    // records use the same population. Grafana regex formatting supports literal
    // substring search rather than asking operators to write LogQL.
    const filters = dashboard === gateway ? [['provider', 'model'], provider] : dashboard === web ? [['route'], route] : [['job'], job];
    for (const item of dashboard.panels.slice(0, originalCount)) for (const target of item.targets ?? []) {
      target.expr = target.expr.replace(/ \| json ([^|]+) \| __error__=""/g, (_match, fields) => {
        const missing = filters[0].filter(name => !fields.includes(`${name}="${name}"`));
        return ` | json ${fields}${missing.map(name => `, ${name}="${name}"`).join('')} | __error__=""${filters[1]}`;
      });
    }
  }
  return dashboards;
}

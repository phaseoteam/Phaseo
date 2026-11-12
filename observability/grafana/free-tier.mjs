const datasource = { type: 'prometheus', uid: '${usage}' };
const monthlySeconds = 31 * 86400;

// Compare with permanent Free allowances even while the account has trial limits.
export const freeAllowances = { series: 10000, logsGB: 50, tracesGB: 50, sessions: 50000, apiChecks: 100000, browserChecks: 10000 };

function queryPanel(title, expr, gridPos, { unit = 'short', description, type = 'stat', maximum, legend = title } = {}) {
  return {
    title, type, gridPos, datasource, description,
    targets: [{ refId: 'A', expr, datasource, instant: type === 'stat', range: type !== 'stat', legendFormat: legend }],
    fieldConfig: { defaults: { unit, decimals: 2, min: 0, noValue: 'Unavailable',
      color: { mode: maximum ? 'thresholds' : 'palette-classic' },
      thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, ...(maximum ? [{ color: 'yellow', value: maximum * 0.8 }, { color: 'red', value: maximum }] : [])] },
    }, overrides: [] },
    options: type === 'stat'
      ? { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none', textMode: 'auto' }
      : { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
  };
}

export function freeTierDashboard() {
  const scope = 'Organization-wide, across all stacks and environments. Grafana-reported current monthly billable usage, matching Billing/Usage. Not an invoice or a counter to increase(); delayed updates and fractional estimates are possible. The dashboard time range does not reset the billing period. Missing data stays unavailable.';
  const budgets = [
    ['Metric series / 10,000', 'grafanacloud_org_metrics_billable_series', freeAllowances.series, 'short', 'Billable series account for both active series and data points per minute.'],
    ['Logs / 50 GB', 'grafanacloud_org_logs_usage', freeAllowances.logsGB, 'suffix: GB', 'Includes Grafana billable log usage; query overage may also contribute on older billing models.'],
    ['Traces / 50 GB', 'grafanacloud_org_traces_usage', freeAllowances.tracesGB, 'suffix: GB', 'Grafana-reported billable trace ingestion.'],
    ['Browser sessions / 50,000', 'grafanacloud_org_fe_o11y_billable_sessions', freeAllowances.sessions, 'short', 'Only collected sessions count; browser sampling and consent exclude sessions.'],
    ['API check executions / 100,000', 'grafanacloud_org_sm_billable_check_executions', freeAllowances.apiChecks, 'short', 'Each probe execution contributes; HTTP monitoring also produces logs and metrics.'],
    ['Browser checks / 10,000', 'grafanacloud_org_sm_browser_billable_check_executions', freeAllowances.browserChecks, 'short', 'Separate synthetic browser allowance; this is not real-user monitoring.'],
  ];
  const panels = [
    { title: 'Stay on Free', type: 'text', gridPos: { x: 0, y: 0, w: 24, h: 5 }, options: { mode: 'markdown', content: '**Permanent Free budgets:** 10,000 metric series, 50 GB logs, 50 GB traces, 50,000 browser sessions, 100,000 API checks and 10,000 browser checks per month. Metrics, logs and traces retain 14 days. Grafana and IRM each allow 3 active users. [Current pricing](https://grafana.com/pricing/).\n\nYellow means 80% of an allowance; red means 100%. These are visibility thresholds, not ingestion caps or notifications. A trial can expose higher limits. Keep the account on Free; check the account plan and trial end in [Cloud Portal](https://grafana.com/profile/org). No data means unavailable, not unused. Usage is organization-wide, without environment filters.' } },
    ...budgets.map(([title, metric, maximum, unit, detail], index) => queryPanel(title, `sum(${metric})`, { x: index % 3 * 8, y: 5 + Math.floor(index / 3) * 4, w: 8, h: 4 }, { unit, maximum, description: `${scope} Permanent Free allowance: ${maximum.toLocaleString('en-US')}. ${detail}` })),
  ];
  for (const [index, [title, metric, maximum]] of [
    ['Logs', 'grafanacloud_logs_instance_bytes_received_per_second', freeAllowances.logsGB],
    ['Traces', 'grafanacloud_traces_instance_bytes_received_per_second', freeAllowances.tracesGB],
  ].entries()) {
    panels.push(queryPanel(`${title} · 31-day pace estimate`, `sum(avg_over_time(${metric}[24h])) * ${monthlySeconds} / 1e9`, { x: index * 12, y: 13, w: 12, h: 4 }, {
      unit: 'suffix: GB', maximum,
      description: 'Estimate only: mean received bytes/second over available samples in the preceding 24 hours × 31 days ÷ 1e9. Conservative month length; not a forecast or month-to-date usage. Includes all visible stacks. Short or interrupted history can bias the estimate. Ingestion may differ from billable usage after credits, filtering or query charges.',
    }));
    panels.push(queryPanel(`${title} · received bytes per second`, `sum by (stack_id) (${metric})`, { x: index * 12, y: 17, w: 12, h: 7 }, { type: 'timeseries', unit: 'Bps', legend: 'Stack {{stack_id}}', description: 'Grafana-reported ingestion rate by stack. All environments are included. Missing measurements remain gaps.' }));
  }
  panels.push(
    queryPanel('Active series · current', 'sum by (stack_id) (grafanacloud_instance_active_series)', { x: 0, y: 24, w: 12, h: 7 }, { type: 'timeseries', legend: 'Stack {{stack_id}}', description: 'Current active metric series per stack. Billable series can be higher due to sample frequency; compare the billable budget above.' }),
    queryPanel('Browser sessions · per second', 'sum by (appName) (grafanacloud_frontend_observability_instance_sessions_per_second)', { x: 12, y: 24, w: 12, h: 7 }, { type: 'timeseries', unit: 'ops', legend: '{{appName}}', description: 'Collected sessions per second, grouped by browser app. Consent and whole-session sampling apply. Not total website visits.' }),
    queryPanel('Metric samples rejected · per second', 'sum by (reason) (grafanacloud_instance_samples_discarded_per_second)', { x: 0, y: 31, w: 12, h: 7 }, { type: 'timeseries', unit: 'ops', legend: '{{reason}}', description: 'Grafana ingestion rejections by reason. A missing series is unavailable; do not interpret it as proof of zero rejections.' }),
    queryPanel('Trace spans received · per second', 'sum by (stack_id) (grafanacloud_traces_instance_spans_received_total:rate5m)', { x: 12, y: 31, w: 12, h: 7 }, { type: 'timeseries', unit: 'ops', legend: 'Stack {{stack_id}}', description: 'Grafana supplied five-minute span ingestion rate; already a rate, do not apply rate() again. This is the sampled span population, not total requests.' }),
    { title: 'Increase coverage deliberately', type: 'text', gridPos: { x: 0, y: 38, w: 24, h: 6 }, options: { mode: 'markdown', content: '**Current collection policy:** compact backend summaries are unsampled; traces default to 5%; browser sessions default to 10% after analytics consent. This is the repository policy, not a readback of deployment settings. See [Telemetry health](/d/phaseo-telemetry) for actual event arrival.\n\n**Best next coverage:** external HTTP checks for website, gateway and web API health; retained traces for request diagnosis; private source maps for readable browser errors. Two public probes checking three endpoints every five minutes use at most **53,568 API executions in 31 days**, plus logs and metrics. Avoid generation endpoints, customer calls and high-cardinality metric labels such as request IDs.\n\nCheck usage before and after raising collection, leaving about 20% headroom. Budget colors do not stop exporters. Alerts and mobile/Slack delivery must be configured separately.' } },
  );
  return {
    uid: 'phaseo-free-tier', title: 'Phaseo · Free tier', description: 'Permanent Free allowances, current billable usage, ingestion pace and collection gaps. Organization-wide, with missing data preserved.',
    schemaVersion: 39, version: 1, editable: true, tags: ['phaseo', 'observability'], timezone: 'browser', refresh: '5m', time: { from: 'now-24h', to: 'now' },
    links: [{ title: 'Overview', type: 'link', url: '/d/phaseo-overview' }, { title: 'Telemetry health', type: 'link', url: '/d/phaseo-telemetry' }, { title: 'Billing/Usage', type: 'link', url: '/dashboards?query=Billing%2FUsage' }],
    templating: { list: [{ name: 'usage', label: 'Cloud usage', type: 'datasource', query: 'prometheus', regex: '/^grafanacloud-usage$/', refresh: 1, current: { text: 'grafanacloud-usage', value: 'grafanacloud-usage' } }] },
    annotations: { list: [] }, panels: panels.map((panel, index) => ({ id: index + 1, ...panel })),
  };
}

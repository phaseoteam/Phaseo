import { emitLogs, randomHex, sendOtlp, telemetryConfig, telemetryEndpoint } from '../../packages/shared/observability/index.mjs';
const config = telemetryConfig(process.env, 'phaseo-observability-check');
if (!process.argv.includes('--send')) {
  console.log('Dry-run. Use --send with private staging OTLP configuration to send one test log and trace. No model calls.');
} else if (!telemetryEndpoint(config, 'logs')) {
  throw new Error('Enable platform telemetry with valid production/staging OTLP configuration first');
} else {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const now = String(BigInt(Date.now()) * 1000000n);
  const deliveries = await Promise.all([
    emitLogs(config, [{ event_name: 'telemetry.smoke', outcome: 'success', trace_id: traceId, span_id: spanId }]),
    sendOtlp(config, 'traces', { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: config.service } }] }, scopeSpans: [{ scope: { name: 'phaseo.platform' }, spans: [{ traceId, spanId, name: 'observability smoke', kind: 1, startTimeUnixNano: now, endTimeUnixNano: now, status: { code: 1 } }] }] }] }),
  ]);
  console.log(JSON.stringify({ traceId, deliveries }));
  if (deliveries.some(result => result.state !== 'delivered')) process.exitCode = 1;
}

import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "@/env";
import { emitLogs, randomHex, safeError, sampled, sendOtlp, telemetryConfig, telemetryEndpoint, traceContext } from "../../../packages/shared/observability/index.mjs";

type RequestFailure = ReturnType<typeof safeError>;
declare module "hono" {
  interface ContextVariableMap {
    platformFailure?: RequestFailure;
  }
}

// Handled failures return a deliberate 503 and never reach Hono's error handler.
// Attach only redacted diagnostics to the existing request event, not another log.
export function recordSettingsFailure(c: Context, error: unknown, operation: string) {
  try {
    c.set("platformFailure", { ...safeError(error), error_origin: "database", error_kind: operation });
  } catch { /* Recording must not change the response. */ }
}

// Measures response headers only. Gateway finalization owns streaming outcomes.
export const platformObservability: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const config = telemetryConfig(c.env, "phaseo-web-api");
  if (!telemetryEndpoint(config, "logs")) return next();
  const started = Date.now();
  const parent = traceContext(c.req.header("traceparent"));
  let traceId: string;
  let spanId: string;
  let keepTrace: boolean;
  try {
    traceId = parent?.traceId ?? randomHex(16);
    spanId = randomHex(8);
    keepTrace = sampled(traceId, c.env.PLATFORM_TRACE_SAMPLE_RATE ?? 0.05);
    const headers = new Headers(c.req.raw.headers);
    headers.set("traceparent", `00-${traceId}-${spanId}-${keepTrace ? "01" : "00"}`);
    c.req.raw = new Request(c.req.raw, { headers });
  } catch { return next(); }
  await next();
  try {
  const completed = Date.now();
  // A matched template, never a raw path containing customer identifiers.
  const route = c.req.routePath || "unmatched";
  const status = c.res.status;
  const stream = c.res.headers.get("content-type")?.includes("text/event-stream") ?? false;
  const failure: RequestFailure = status >= 500 ? (c.get("platformFailure") ?? (c.error ? safeError(c.error) : {})) : {};
  const event = {
    ...failure,
    event_name: "web.request", method: c.req.method, route, stream,
    status_code: status, duration_ms: completed - started, signal: "response_headers",
    outcome: status >= 500 ? "error" : status >= 400 ? "rejected" : stream ? "started" : "success",
    actionable: status >= 500, trace_id: traceId, span_id: spanId,
  };
  const work = [emitLogs(config, [event])];
  if (keepTrace) work.push(sendOtlp(config, "traces", {
    resourceSpans: [{ resource: { attributes: [
      { key: "service.name", value: { stringValue: config.service } },
      { key: "deployment.environment.name", value: { stringValue: config.environment } },
      ...(config.release ? [{ key: "service.version", value: { stringValue: config.release } }] : []),
    ] }, scopeSpans: [{ scope: { name: "phaseo.platform" }, spans: [{
      traceId, spanId, ...(parent ? { parentSpanId: parent.parentSpanId } : {}),
      name: `${c.req.method} ${route}`, kind: 2,
      startTimeUnixNano: String(BigInt(started) * 1000000n),
      endTimeUnixNano: String(BigInt(completed) * 1000000n),
      attributes: [
        { key: "http.route", value: { stringValue: route } },
        { key: "http.response.status_code", value: { intValue: String(status) } },
        { key: "phaseo.completion", value: { stringValue: "response_headers" } },
        ...["error_name", "error_code", "error_origin", "error_kind"].flatMap(key =>
          typeof failure[key] === "string" ? [{ key: `phaseo.${key}`, value: { stringValue: failure[key] } }] : []),
      ], status: { code: status >= 500 ? 2 : 1 },
    }] }] }],
  }));
  c.executionCtx.waitUntil(Promise.all(work).then(results => {
    if (results.some(result => result.state === "failed")) console.warn("[platform-telemetry] web-api delivery failed");
  }).catch(() => {}));
  } catch { /* Preserve the response if recording or background dispatch fails. */ }
};

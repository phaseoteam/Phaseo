import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRuntime, configureRuntime, setWaitUntil } from "@/runtime/env";
import { emitGatewayPlatformEvent } from "./platform";
import { emitGatewayRequestEvent } from "./events";
import type { EventArgs } from "./events";
import type { GatewayBindings } from "@/runtime/env";
import type { PipelineContext } from "@pipeline/before/types";

vi.mock("./axiom", () => ({ sendAxiomWideEvent: vi.fn() }));
const endpoint = "https://otlp-gateway-prod-eu-west-0.grafana.net/otlp";
const classification = { origin: "provider", kind: "upstream", operationallyActionable: true };
function setup(extra = {}) {
  configureRuntime({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "private", GATEWAY_CACHE: {} as KVNamespace,
    ENV: "staging", PLATFORM_TELEMETRY_ENABLED: "true", GRAFANA_OTLP_ENDPOINT: endpoint, GRAFANA_OTLP_AUTHORIZATION: "Basic dGVzdA==", PLATFORM_TRACE_SAMPLE_RATE: "1",
    AXIOM_SUCCESS_SAMPLE_RATE: "0", AXIOM_DETAIL_SAMPLE_RATE: "0", ...extra } as unknown as GatewayBindings);
  const work: Promise<unknown>[] = [];
  setWaitUntil(promise => work.push(promise));
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
  vi.stubGlobal("fetch", fetcher);
  return { work, fetcher, payloads: () => fetcher.mock.calls.map(call => ({ url: String(call[0]), body: JSON.parse((call[1] as RequestInit).body as string) })) };
}
function args(extra: Partial<EventArgs> = {}): EventArgs & { ctx: PipelineContext } {
  return { success: true, statusCode: 200, endpoint: "chat.completions", requestId: "req_observability",
    ctx: { requestId: "req_observability", model: "openai/gpt", stream: true, meta: { startedAtMs: 100, completedAtMs: 200, gateway_ttft_ms: 20, provider_ttft_ms: 10,
      otelTraceContext: { traceId: "a".repeat(32), parentSpanId: "b".repeat(16), traceFlags: 1 } }, providerAttempts: [] } as unknown as PipelineContext, ...extra } as EventArgs & { ctx: PipelineContext };
}
afterEach(() => { clearRuntime(); vi.unstubAllGlobals(); });
describe("platform gateway telemetry", () => {
  it("uses the gateway's current operational classification for actionable errors", async () => {
    const { work, payloads } = setup();
    await emitGatewayRequestEvent(args({ success: false, statusCode: 503, gatewayResponse: { error_operational_kind: "upstream_server_error", error_origin: "upstream" } }));
    await Promise.all(work);
    const record = payloads().find(item => item.url.endsWith("/logs"))!.body.resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(JSON.parse(record.body.stringValue)).toMatchObject({ actionable: true, error_origin: "upstream", error_kind: "upstream_server_error" });
  });
  it("emits once independently of Axiom success sampling and links logs to the retained root span", async () => {
    const { work, payloads } = setup();
    const event = args();
    await emitGatewayRequestEvent(event);
    await emitGatewayRequestEvent(event);
    await Promise.all(work);
    const sent = payloads();
    expect(sent).toHaveLength(2);
    const record = sent.find(item => item.url.endsWith("/logs"))!.body.resourceLogs[0].scopeLogs[0].logRecords[0];
    const root = sent.find(item => item.url.endsWith("/traces"))!.body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(record.traceId).toBe(root.traceId);
    expect(record.spanId).toBe(root.spanId);
    expect(JSON.parse(record.body.stringValue)).toMatchObject({ outcome: "success", ttft_ms: 20, provider_ttft_ms: 10, duration_ms: 100 });
  });
  it.each([false, true])("marks a post-200 logical failure or disconnect without copying private data (disconnect=%s)", async disconnected => {
    const { work, payloads } = setup();
    const event = args({ success: false, requestPayload: { prompt: "secret prompt" }, errorMessage: "secret error" });
    event.ctx.meta.downstreamDisconnected = disconnected;
    emitGatewayPlatformEvent(event, classification);
    await Promise.all(work);
    const encoded = JSON.stringify(payloads());
    expect(encoded).not.toContain("secret");
    const log = payloads()[0].body.resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(JSON.parse(log.body.stringValue)).toMatchObject({ status_code: 200, outcome: disconnected ? "cancelled" : "error", actionable: !disconnected });
    expect(payloads()[1].body.resourceSpans[0].scopeSpans[0].spans[0].status.code).toBe(2);
  });
  it("caps attempts, suppresses stealth provider data and sends nothing when disabled", async () => {
    const { work, payloads } = setup();
    const event = args();
    event.ctx.model = "stealth/private-model";
    event.ctx.providerAttempts = Array.from({ length: 30 }, () => ({ provider: "private-provider" }));
    emitGatewayPlatformEvent(event, classification);
    await Promise.all(work);
    expect(payloads()).toHaveLength(1);
    expect(JSON.stringify(payloads())).not.toContain("private-provider");
    expect(JSON.stringify(payloads())).not.toContain("private-model");
    clearRuntime();
    configureRuntime({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "private" } as GatewayBindings);
    emitGatewayPlatformEvent(args(), classification);
    expect(payloads()).toHaveLength(1);
  });
});

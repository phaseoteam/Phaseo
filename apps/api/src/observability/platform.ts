import { dispatchBackground, getBindings, getBindingsIfConfigured } from "@/runtime/env";
import { isStealthRequest } from "@/pipeline/stealth";
import { emitLogs, randomHex, safeEvent, sampled, sendOtlp, telemetryConfig, telemetryEndpoint, type PlatformEvent } from "../../../../packages/shared/observability/index.mjs";
import { buildGatewayGenAiOtlpPayload } from "./otel-genai";
import type { EventArgs } from "./events";
import type { ProviderAttemptLog } from "@pipeline/before/types";

function number(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function emitGatewayPlatformEvent(args: EventArgs, error: { origin: string | null; kind: string | null; operationallyActionable: boolean | null }) {
    const bindings = getBindings();
    const config = telemetryConfig(bindings, "phaseo-gateway");
    if (!telemetryEndpoint(config, "logs")) return;
    const ctx = args.ctx;
    const requestId = args.requestId ?? ctx?.requestId;
    if (!requestId || requestId === "unknown") return;
    const stealth = isStealthRequest({ model: args.model ?? ctx?.model, requestedModel: args.requestedModel ?? ctx?.requestedModel });
    const allAttempts = ctx?.providerAttempts ?? (args.errorDetails as { provider_attempts?: ProviderAttemptLog[] } | null)?.provider_attempts ?? [];
    const attempts = allAttempts.slice(0, 16);
    const traceId = ctx?.meta?.otelTraceContext?.traceId ?? randomHex(16);
    let spanId = randomHex(8);
    const endpoint = args.endpoint ?? ctx?.endpoint ?? "unknown";
    const route = ({ "video.generation": "/v1/videos", "audio.transcription": "/v1/audio/transcriptions", "audio.realtime": "/v1/realtime", batch: "/v1/batches" } as Record<string, string>)[endpoint]
        ?? `/v1/${endpoint.replaceAll(".", "/")}`;
    const identifiers = safeEvent({ provider: stealth ? null : args.result?.provider ?? args.provider,
        model: stealth ? null : args.model ?? ctx?.model ?? args.requestedModel });
    const provider = typeof identifiers.provider === "string" ? identifiers.provider : null;
    const model = typeof identifiers.model === "string" ? identifiers.model : null;
    const start = number(ctx?.meta?.startedAtMs);
    const end = number(ctx?.meta?.completedAtMs) ?? Date.now();
    const disconnected = ctx?.meta?.downstreamDisconnected === true;
    const events: PlatformEvent[] = [{
        event_name: "gateway.request", event_id: `gateway:${requestId}:terminal`, request_id: requestId,
        trace_id: traceId, span_id: spanId, route,
        modality: endpoint.startsWith("video") ? "video" : endpoint.startsWith("audio") ? "audio" : endpoint.startsWith("image") ? "image" : ["embeddings", "rerank", "moderations", "batch", "ocr", "parse"].includes(endpoint) ? endpoint : endpoint.startsWith("music") ? "music" : "text",
        method: args.requestMethod ?? ctx?.meta?.requestMethod ?? "POST", stream: ctx?.stream ?? false,
        status_code: args.statusCode, outcome: disconnected ? "cancelled" : args.success ? "success" : "error",
        disconnected, error_origin: error.origin, error_kind: error.kind,
        actionable: !disconnected && error.operationallyActionable === true, error_code: args.errorCode,
        provider, model, duration_ms: start === null ? number(ctx?.meta?.end_to_end_ms) : Math.max(0, end - start),
        ttft_ms: ctx?.stream ? number(ctx.meta.gateway_ttft_ms) : null,
        provider_ttft_ms: ctx?.stream ? number(ctx.meta.provider_ttft_ms) : null,
        attempt_count: allAttempts.length,
        attempts_truncated: Math.max(0, allAttempts.length - attempts.length),
    }];
    if (!stealth) for (const attempt of attempts) events.push({
        event_name: "provider.attempt", event_id: `attempt:${requestId}:${attempt.attempt_number}`,
        request_id: requestId, trace_id: traceId, provider: attempt.provider,
        model: attempt.provider_model_slug ?? attempt.model, attempt_number: attempt.attempt_number,
        outcome: attempt.outcome === "success" ? "success" : "error", status_code: attempt.status,
        duration_ms: number(attempt.duration_ms), retryable: attempt.retryable,
        error_code: attempt.upstream_error_code,
    });
    let traces: unknown;
    // Request-wide deterministic sampling retains the same traces across processes.
    if (!stealth && sampled(traceId, bindings.PLATFORM_TRACE_SAMPLE_RATE ?? 0.05)) {
        const payload = buildGatewayGenAiOtlpPayload({
            requestId, workspaceId: "redacted", endpoint: endpoint as import("@core/types").Endpoint,
            requestedModel: model ?? "unknown", provider, providerModel: model,
            providerAttempts: attempts.map(attempt => ({
                ...safeEvent({ provider: attempt.provider, model: attempt.provider_model_slug ?? attempt.model,
                    attempt_number: attempt.attempt_number, outcome: attempt.outcome, status_code: attempt.status,
                    duration_ms: attempt.duration_ms, retryable: attempt.retryable }),
                started_at_unix_ms: number(attempt.started_at_unix_ms), status: number(attempt.status),
            })) as unknown as ProviderAttemptLog[],
            stream: ctx?.stream ?? false, statusCode: args.statusCode ?? 500, success: args.success && !disconnected,
            errorType: args.errorType, startedAtMs: start ?? end, completedAtMs: end,
            requestPath: route, requestMethod: args.requestMethod ?? ctx?.meta?.requestMethod ?? "POST",
            traceContext: { traceId, parentSpanId: ctx?.meta?.otelTraceContext?.parentSpanId ?? "", traceFlags: 1 },
        }, { includeSensitiveContent: false, serviceName: config.service, environment: config.environment, serviceVersion: config.release });
        const root = payload.resourceSpans[0].scopeSpans[0].spans[0];
        // GenAI builders preserve HTTP semantics. Platform traces also mark logical
        // generation failures, including a failure after streaming HTTP 200.
        if (!args.success || disconnected) root.status = { code: 2 };
        spanId = String(root.spanId);
        events[0].span_id = spanId;
        traces = payload;
    }
    dispatchBackground((async () => {
        const deliveries = await Promise.all([
            emitLogs(config, events),
            ...(traces ? [sendOtlp(config, "traces", traces)] : []),
        ]);
        if (deliveries.some(delivery => delivery.state === "failed")) {
            console.warn("[platform-telemetry] delivery failed");
        }
    })());
}

export function emitPlatformOperationalEvent(event: PlatformEvent) {
    try {
        const bindings = getBindingsIfConfigured();
        if (!bindings) return;
        const config = telemetryConfig(bindings, "phaseo-gateway");
        if (telemetryEndpoint(config, "logs")) dispatchBackground(emitLogs(config, [event]));
    } catch { /* Preserve the operation even if background dispatch is unavailable. */ }
}

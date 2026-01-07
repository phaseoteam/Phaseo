import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { ensureRuntimeForBackground, getBindings } from "@/runtime/env";
import { sendAxiomWideEvent } from "./axiom";

type EventArgs = {
    ctx?: PipelineContext;
    result?: RequestResult;
    statusCode?: number | null;
    success: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorStage?: "before" | "execute" | null;
    internalReason?: string | null;
    finishReason?: string | null;
    usage?: any;
    pricing?: {
        total_cents?: number | null;
        total_nanos?: number | null;
        currency?: string | null;
    } | null;
    protocolOverride?: string | null;
    requestId?: string | null;
    teamId?: string | null;
    model?: string | null;
    endpoint?: string | null;
};

function toNum(value: any) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageSummary(usage: any) {
    if (!usage || typeof usage !== "object") return {};
    const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? null;
    const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? null;
    const total = usage.total_tokens ?? (typeof input === "number" && typeof output === "number" ? input + output : null);
    return {
        usage_input_tokens: toNum(input),
        usage_output_tokens: toNum(output),
        usage_total_tokens: toNum(total),
    };
}

export async function emitGatewayRequestEvent(args: EventArgs) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const ctx = args.ctx;
        const bindings = getBindings();
        const requestId = args.requestId ?? ctx?.requestId ?? null;
        const teamId = args.teamId ?? ctx?.teamId ?? null;
        if (!requestId || !teamId) return;

        const event = {
            event_type: "gateway.request",
            request_id: requestId,
            team_id: teamId,
            protocol_in: args.protocolOverride ?? ctx?.protocol ?? null,
            request_path: ctx?.requestPath ?? null,
            endpoint: args.endpoint ?? ctx?.endpoint ?? null,
            model: args.model ?? ctx?.model ?? null,
            stream: ctx?.stream ?? false,
            strictness: ctx?.strictness ?? null,
            status_code: args.statusCode ?? null,
            success: args.success,
            error_code: args.errorCode ?? null,
            error_message: args.errorMessage ?? null,
            error_stage: args.errorStage ?? null,
            error_internal_reason: args.internalReason ?? null,
            provider: args.result?.provider ?? null,
            chosen_surface: ctx?.endpoint ?? null,
            provider_candidates_count: ctx?.providers?.length ?? null,
            routing_candidates_json: ctx && (ctx as any).routingSnapshot
                ? JSON.stringify((ctx as any).routingSnapshot)
                : null,
            attempt_errors_json: ctx && (ctx as any).attemptErrors
                ? JSON.stringify((ctx as any).attemptErrors)
                : null,
            latency_ms: toNum(ctx?.meta?.latency_ms),
            generation_ms: toNum(ctx?.meta?.generation_ms),
            timing_json: ctx?.timing ? JSON.stringify(ctx.timing) : null,
            finish_reason: args.finishReason ?? null,
            ...usageSummary(args.usage),
            cost_total_cents: toNum(args.pricing?.total_cents),
            cost_total_nanos: toNum(args.pricing?.total_nanos),
            cost_currency: args.pricing?.currency ?? null,
            env: bindings.NODE_ENV ?? null,
            gateway_version: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
        };

        await sendAxiomWideEvent(event);
    } finally {
        releaseRuntime();
    }
}

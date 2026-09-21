import { dispatchBackground, ensureRuntimeForBackground } from "@/runtime/env";
import type { IRChatResponse } from "@core/ir";
import type { PipelineContext } from "../before/types";
import type { IRRequestResult } from "./index";
import { classifyProviderHealthImpact, maybeOpenOnRecentErrors, onCallEnd, reportProbeResult } from "./health";

/** Internal streams consumed before after/stream still own one health completion. */
export function reportBufferedStreamHealth(args: {
    ctx: PipelineContext;
    result: IRRequestResult;
    response?: IRChatResponse;
    latencyMs: number;
    generationMs: number;
    streamFailed?: boolean;
    aborted?: boolean;
    materializationFailed?: boolean;
}): void {
    const health = args.result.healthContext;
    if (!health || health.completed) return;
    // A later synthetic client stream must not report this provider attempt again.
    health.completed = true;
    const impact = classifyProviderHealthImpact({
        upstreamStatus: args.result.upstream.status,
        credentialSource: args.result.keySource,
        finishReason: args.response?.choices?.[0]?.finishReason,
        midStreamError: args.streamFailed,
        aborted: args.aborted,
        // An unknown parser/callback exception is not provider health evidence.
        failureOrigin: args.materializationFailed && !args.streamFailed ? "gateway" : undefined,
    });
    if (impact === "neutral") return;
    let release: () => void;
    try { release = ensureRuntimeForBackground(); }
    catch { console.warn("routing_health_buffered_runtime_unavailable"); return; }
    dispatchBackground((async () => {
        try {
            const update = await onCallEnd(args.ctx.endpoint, {
                observationId: health.observationId, startedAt: health.startedAt, probe: health.isProbe,
                provider: health.provider, model: health.model, ok: impact === "success", healthImpact: impact,
                upstreamStatus: args.result.upstream.status,
                latency_ms: args.latencyMs, generation_ms: args.generationMs,
                tokens_in: args.response?.usage?.inputTokens,
                tokens_out: args.response?.usage?.outputTokens,
            });
            if (health.isProbe && !update?.rateLimited) {
                await reportProbeResult(args.ctx.endpoint, health.provider, health.model, impact === "success");
            } else if (impact === "failure" && !update?.rateLimited) {
                await maybeOpenOnRecentErrors(args.ctx.endpoint, health.provider, health.model);
            }
        } finally { release(); }
    })());
}

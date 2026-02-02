// lib/gateway/execute/guards.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Provides routing, health, and attempt helpers used by the execute stage.

import type { PipelineContext } from "../before/types";
import type { PipelineTiming } from "./index";
import type { ProviderCandidate } from "../before/types";
import { err } from "./http";
import { captureTimingSnapshot } from "./utils";
import { handleError } from "@core/error-handler";
import { auditFailure } from "../audit";

export type ExecuteGuardOk<T> = { ok: true; value: T };
export type ExecuteGuardErr = { ok: false; response: Response };
export type ExecuteGuardResult<T> = ExecuteGuardOk<T> | ExecuteGuardErr;

export async function guardCandidates(
    ctx: PipelineContext,
    timing: PipelineTiming
): Promise<ExecuteGuardResult<ProviderCandidate[]>> {
    const candidates = ctx.providers ?? [];

    if (!candidates.length) {
        captureTimingSnapshot(ctx, timing);
        const res = err("unsupported_model_or_endpoint", {
            model: ctx.model,
            endpoint: ctx.endpoint,
            request_id: ctx.requestId,
        });

        await handleError({
            stage: "execute",
            res,
            endpoint: ctx.endpoint,
            ctx,
            auditFailure
        });

        return { ok: false, response: res };
    }

    return { ok: true, value: candidates };
}

export async function guardPricingFound(
    anyPricingFound: boolean,
    ctx: PipelineContext,
    timing: PipelineTiming
): Promise<ExecuteGuardResult<void>> {
    if (!anyPricingFound) {
        if (timing.internal.adapterMarked && timing.timer.snapshot().adapter_roundtrip_ms === undefined) {
            timing.timer.between("adapter_roundtrip_ms", "adapter_start");
        }

        captureTimingSnapshot(ctx, timing);
        const res = err("pricing_not_configured", {
            reason: "no_provider_pricing",
            model: ctx.model,
            endpoint: ctx.endpoint,
            request_id: ctx.requestId,
        });

        await handleError({
            stage: "execute",
            res,
            endpoint: ctx.endpoint,
            ctx,
            auditFailure
        });

        return { ok: false, response: res };
    }

    return { ok: true, value: undefined };
}

export async function guardAllFailed(
    ctx: PipelineContext,
    timing: PipelineTiming
): Promise<ExecuteGuardResult<never>> {
    if (timing.internal.adapterMarked && timing.timer.snapshot().adapter_roundtrip_ms === undefined) {
        timing.timer.between("adapter_roundtrip_ms", "adapter_start");
    }

    captureTimingSnapshot(ctx, timing);
    const res = err("upstream_error", {
        reason: "all_candidates_failed",
        model: ctx.model,
        endpoint: ctx.endpoint,
        request_id: ctx.requestId,
    });

    await handleError({
        stage: "execute",
        res,
        endpoint: ctx.endpoint,
        ctx,
        auditFailure
    });

    return { ok: false, response: res };
}










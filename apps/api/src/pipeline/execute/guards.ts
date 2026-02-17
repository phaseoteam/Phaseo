// lib/gateway/execute/guards.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Provides routing, health, and attempt helpers used by the execute stage.

import type { PipelineContext } from "../before/types";
import type { PipelineTiming } from "./index";
import type { ProviderCandidate } from "../before/types";
import { err } from "./http";
import { captureTimingSnapshot } from "./utils";

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

    const attemptErrors: Array<Record<string, unknown>> = Array.isArray((ctx as any)?.attemptErrors)
        ? ((ctx as any).attemptErrors as Array<Record<string, unknown>>)
        : [];
    const failedProviders = Array.from(
        new Set(
            attemptErrors
                .map((entry) => (typeof entry?.provider === "string" ? entry.provider : null))
                .filter((value): value is string => Boolean(value)),
        ),
    );
    const failedStatuses = Array.from(
        new Set(
            attemptErrors
                .map((entry) => {
                    const status = Number(entry?.status ?? NaN);
                    return Number.isFinite(status) ? status : null;
                })
                .filter((value): value is number => value != null),
        ),
    );
    const failureSample = attemptErrors.slice(0, 3).map((entry) => ({
        provider: typeof entry?.provider === "string" ? entry.provider : null,
        type: typeof entry?.type === "string" ? entry.type : null,
        status: Number.isFinite(Number(entry?.status)) ? Number(entry?.status) : null,
        upstream_error_code:
            typeof entry?.upstream_error_code === "string" ? entry.upstream_error_code : null,
        upstream_error_message:
            typeof entry?.upstream_error_message === "string"
                ? entry.upstream_error_message
                : null,
        upstream_error_description:
            typeof entry?.upstream_error_description === "string"
                ? entry.upstream_error_description
                : null,
    }));
    const routingDiagnostics = (ctx as any)?.routingDiagnostics ?? null;
    const providerEnablement = (ctx as any)?.providerEnablementDiagnostics ?? null;
    const candidateBuild = (ctx as any)?.providerCandidateBuildDiagnostics ?? null;

    captureTimingSnapshot(ctx, timing);
    const res = err("upstream_error", {
        reason: "all_candidates_failed",
        description: "All provider candidates failed. Inspect failure_sample for upstream diagnostics.",
        model: ctx.model,
        endpoint: ctx.endpoint,
        request_id: ctx.requestId,
        attempt_count: attemptErrors.length || null,
        failed_providers: failedProviders.length ? failedProviders : null,
        failed_statuses: failedStatuses.length ? failedStatuses : null,
        failure_sample: failureSample.length ? failureSample : null,
        routing_diagnostics: routingDiagnostics,
        provider_enablement: providerEnablement,
        provider_candidate_diagnostics: candidateBuild,
    });

    return { ok: false, response: res };
}










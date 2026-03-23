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

function normalizeText(value: unknown, max = 180): string | null {
    if (typeof value !== "string") return null;
    const compact = value.trim().replace(/\s+/g, " ");
    if (!compact) return null;
    if (compact.length <= max) return compact;
    return `${compact.slice(0, max - 1)}...`;
}

function normalizeStatus(value: unknown): number | null {
    const status = Number(value ?? NaN);
    return Number.isFinite(status) ? status : null;
}

function failureHintFromStatuses(statuses: number[]): string | null {
    if (statuses.some((status) => status === 401 || status === 403)) {
        return "Verify provider credentials/BYOK keys and account permissions.";
    }
    if (statuses.includes(404)) {
        return "The provider may not expose this model on this endpoint yet.";
    }
    if (statuses.includes(429)) {
        return "The provider is rate limiting requests; retry with backoff.";
    }
    if (statuses.some((status) => status === 408 || status === 504)) {
        return "The provider timed out; retrying may succeed.";
    }
    if (statuses.some((status) => status >= 500)) {
        return "The provider returned a server error; retrying may succeed.";
    }
    if (statuses.some((status) => status === 400 || status === 422)) {
        return "The upstream provider rejected request parameters.";
    }
    return null;
}

function summarizeProviderStatuses(attemptErrors: Array<Record<string, unknown>>): string | null {
    const byProvider = new Map<string, Set<number>>();
    for (const entry of attemptErrors) {
        const provider = normalizeText(entry?.provider, 60) ?? "unknown";
        const status = normalizeStatus(entry?.status);
        const current = byProvider.get(provider) ?? new Set<number>();
        if (status != null) current.add(status);
        byProvider.set(provider, current);
    }

    if (!byProvider.size) return null;

    const entries = Array.from(byProvider.entries());
    const visible = entries.slice(0, 3).map(([provider, statuses]) => {
        const statusList = Array.from(statuses).sort((a, b) => a - b);
        if (!statusList.length) return provider;
        return `${provider}:${statusList.join("/")}`;
    });
    if (entries.length > visible.length) {
        visible.push(`+${entries.length - visible.length} more`);
    }
    return visible.join(", ");
}

function buildAllCandidatesFailedDescription(args: {
    attemptErrors: Array<Record<string, unknown>>;
    failedProviders: string[];
    failedStatuses: number[];
    model: string;
    endpoint: string;
}): string {
    const { attemptErrors, failedProviders, failedStatuses, model, endpoint } = args;
    const primary = attemptErrors[0] ?? null;
    const primaryProvider = normalizeText(primary?.provider, 60) ?? failedProviders[0] ?? "unknown";
    const primaryStatus = normalizeStatus(primary?.status);
    const primaryCode = normalizeText(primary?.upstream_error_code, 80);
    const primaryMessage =
        normalizeText(primary?.upstream_error_message) ??
        normalizeText(primary?.message);
    const primaryDetail = normalizeText(primary?.upstream_error_description);
    const primaryParam = normalizeText(primary?.upstream_error_param, 240);
    const providerSummary = summarizeProviderStatuses(attemptErrors);
    const hint = failureHintFromStatuses(failedStatuses);

    const lines: string[] = [];
    if (failedProviders.length <= 1) {
        if (primaryStatus != null) {
            lines.push(
                `Provider "${primaryProvider}" failed with HTTP ${primaryStatus} for endpoint "${endpoint}" on model "${model}".`,
            );
        } else {
            lines.push(
                `Provider "${primaryProvider}" failed for endpoint "${endpoint}" on model "${model}".`,
            );
        }
    } else {
        lines.push(
            `All ${attemptErrors.length || failedProviders.length} provider attempts failed for endpoint "${endpoint}" on model "${model}".`,
        );
        if (providerSummary) {
            lines.push(`Provider/status summary: ${providerSummary}.`);
        }
    }

    if (primaryCode) {
        lines.push(`Upstream code: ${primaryCode}.`);
    }
    if (primaryMessage) {
        lines.push(`Upstream message: ${primaryMessage}.`);
    }
    if (primaryDetail && primaryDetail !== primaryMessage) {
        lines.push(`Upstream detail: ${primaryDetail}.`);
    }
    if (
        primaryParam &&
        primaryParam !== primaryMessage &&
        primaryParam !== primaryDetail
    ) {
        lines.push(`Upstream param: ${primaryParam}.`);
    }
    if (hint) {
        lines.push(`Hint: ${hint}`);
    }
    if (attemptErrors.length > 0) {
        lines.push("Inspect failure_sample for per-attempt diagnostics.");
    } else {
        lines.push("No per-attempt diagnostics were captured.");
    }
    return lines.join(" ");
}

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
                : (typeof entry?.message === "string" ? entry.message : null),
        upstream_error_description:
            typeof entry?.upstream_error_description === "string"
                ? entry.upstream_error_description
                : null,
        upstream_error_param:
            typeof entry?.upstream_error_param === "string" ? entry.upstream_error_param : null,
        upstream_payload_preview:
            typeof entry?.upstream_payload_preview === "string"
                ? entry.upstream_payload_preview
                : null,
        retryable:
            typeof entry?.retryable === "boolean"
                ? entry.retryable
                : null,
    }));
    const routingDiagnostics = (ctx as any)?.routingDiagnostics ?? null;
    const providerEnablement = (ctx as any)?.providerEnablementDiagnostics ?? null;
    const candidateBuild = (ctx as any)?.providerCandidateBuildDiagnostics ?? null;
    const hasUpstreamPaymentRequired = failedStatuses.includes(402);
    const paymentRequiredProvider = hasUpstreamPaymentRequired
        ? (attemptErrors.find((entry) => Number(entry?.status ?? NaN) === 402)?.provider ?? null)
        : null;
    const paymentRequiredDescription = hasUpstreamPaymentRequired
        ? `Oops, we forgot to pay our provider bills${typeof paymentRequiredProvider === "string" ? ` (${paymentRequiredProvider})` : ""}. Please let us know on GitHub or Discord if you see this error.`
        : buildAllCandidatesFailedDescription({
            attemptErrors,
            failedProviders,
            failedStatuses,
            model: ctx.model,
            endpoint: ctx.endpoint,
        });

    captureTimingSnapshot(ctx, timing);
    const res = err(hasUpstreamPaymentRequired ? "provider_payment_required" : "upstream_error", {
        reason: hasUpstreamPaymentRequired
            ? "upstream_provider_payment_required"
            : "all_candidates_failed",
        description: paymentRequiredDescription,
        model: ctx.model,
        endpoint: ctx.endpoint,
        request_id: ctx.requestId,
        attempt_count: attemptErrors.length || null,
        failed_providers: failedProviders.length ? failedProviders : null,
        failed_statuses: failedStatuses.length ? failedStatuses : null,
        failure_sample: failureSample.length ? failureSample : null,
        provider_payment_required_provider:
            typeof paymentRequiredProvider === "string" ? paymentRequiredProvider : null,
        provider_payment_required_support_notice: hasUpstreamPaymentRequired
            ? "Please let us know on GitHub or Discord if you see this error."
            : null,
        routing_diagnostics: routingDiagnostics,
        provider_enablement: providerEnablement,
        provider_candidate_diagnostics: candidateBuild,
    });

    return { ok: false, response: res };
}










// lib/gateway/execute/guards.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Provides routing, health, and attempt helpers used by the execute stage.

import type { PipelineContext } from "../before/types";
import { buildSafeStealthUpstreamError, isStealthRequest } from "../stealth";
import { applyDownstreamRateLimitHeaders } from "../upstream-rate-limit-headers";
import type { PipelineTiming } from "./index";
import type { ProviderCandidate } from "../before/types";
import { err, json } from "./http";
import { captureTimingSnapshot } from "./utils";
import {
    normalizeGatewayErrorPayload,
    parseRetryAfterSeconds,
} from "../error-contract";

export type ExecuteGuardOk<T> = { ok: true; value: T };
export type ExecuteGuardErr = { ok: false; response: Response };
export type ExecuteGuardResult<T> = ExecuteGuardOk<T> | ExecuteGuardErr;

export type ProviderFailureDiagnostics = {
    category:
        | "credentials_not_configured"
        | "credentials_invalid_or_forbidden"
        | "provider_access_missing"
        | "region_or_project_restriction"
        | "model_unavailable_for_endpoint"
        | "rate_limited"
        | "server_error";
    hint: string;
    provider: string | null;
};

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

function normalizedProviderErrorCode(entry: Record<string, unknown>): string {
    const normalizedCode = typeof entry.normalized_error_code === "string"
        ? entry.normalized_error_code.trim().toLowerCase()
        : "";
    if (normalizedCode) return normalizedCode;
    return typeof entry.upstream_error_code === "string"
        ? entry.upstream_error_code.trim().toUpperCase().replace(/[\s-]+/g, "_")
        : "";
}

function hasProviderErrorCode(entry: Record<string, unknown>, codes: readonly string[]): boolean {
    return codes.includes(normalizedProviderErrorCode(entry));
}

function isProviderBalanceError(entry: Record<string, unknown>): boolean {
    return normalizedProviderErrorCode(entry) === "provider_payment_required" ||
        normalizeStatus(entry.status) === 402 ||
        hasProviderErrorCode(entry, ["NOT_ENOUGH_BALANCE", "INSUFFICIENT_BALANCE", "INSUFFICIENT_FUNDS"]);
}

function isProviderRateLimitError(entry: Record<string, unknown>): boolean {
    return normalizedProviderErrorCode(entry) === "provider_capacity_exhausted" ||
        entry.type === "provider_rate_limited" ||
        normalizeStatus(entry.status) === 429 ||
        hasProviderErrorCode(entry, ["RATE_LIMIT_EXCEEDED", "TOKEN_LIMIT_EXCEEDED"]);
}

function isProviderUnavailableError(entry: Record<string, unknown>): boolean {
    return normalizedProviderErrorCode(entry) === "provider_service_unavailable" ||
        normalizeStatus(entry.status) === 503 ||
        hasProviderErrorCode(entry, ["SERVICE_NOT_AVAILABLE", "SERVICE_UNAVAILABLE", "SERVER_IS_OVERLOADED"]);
}

function isProviderRequestRejected(entry: Record<string, unknown>): boolean {
    const status = normalizeStatus(entry.status);
    return normalizedProviderErrorCode(entry) === "provider_request_rejected" ||
        status === 400 || status === 422;
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

export function classifyProviderFailureDiagnostics(
    attemptErrors: Array<Record<string, unknown>>
): ProviderFailureDiagnostics | null {
    const primary = attemptErrors[0] ?? null;
    if (!primary) return null;

    const provider = normalizeText(primary?.provider, 60);
    const status = normalizeStatus(primary?.status);
    const normalizedCode = normalizeText(primary?.normalized_error_code, 80)?.toLowerCase() ?? null;
    const upstreamCode = normalizeText(primary?.upstream_error_code, 160)?.toLowerCase() ?? null;
    const haystack = [
        upstreamCode,
        normalizeText(primary?.upstream_error_message, 240),
        normalizeText(primary?.upstream_error_description, 320),
        normalizeText(primary?.upstream_error_param, 240),
        normalizeText(primary?.message, 240),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (normalizedCode === "provider_capacity_exhausted") {
        return {
            category: "rate_limited",
            hint: "The provider is rate limiting this request. Retry with backoff or another provider.",
            provider,
        };
    }

    if (normalizedCode === "provider_service_unavailable") {
        return {
            category: "server_error",
            hint: "The provider returned a server-side failure. Retrying later may succeed.",
            provider,
        };
    }

    if (
        upstreamCode === "google-vertex_project_missing" ||
        upstreamCode === "google-vertex_access_token_missing" ||
        upstreamCode === "google-vertex_oauth_access_token_missing"
    ) {
        return {
            category: "credentials_not_configured",
            hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
            provider,
        };
    }

    if (upstreamCode?.endsWith("_key_missing")) {
        return {
            category: "credentials_not_configured",
            hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
            provider,
        };
    }

    if (upstreamCode?.endsWith("_base_url_missing")) {
        return {
            category: "credentials_not_configured",
            hint: "Provider configuration is incomplete for this route. Verify the provider base URL and related gateway settings before retrying.",
            provider,
        };
    }

    if (
        upstreamCode === "invalidsignatureexception" ||
        upstreamCode === "incompletesignatureexception" ||
        upstreamCode === "unrecognizedclientexception" ||
        upstreamCode === "expiredtokenexception"
    ) {
        return {
            category: "credentials_invalid_or_forbidden",
            hint: "The provider rejected the supplied credentials or permissions. Verify the gateway key or BYOK secret and retry.",
            provider,
        };
    }

    if (upstreamCode === "accessdeniedexception") {
        return {
            category: "provider_access_missing",
            hint: "The provider account appears not to have access to this model or feature yet. Verify account entitlements and provider-side access.",
            provider,
        };
    }

    if (upstreamCode === "throttlingexception") {
        return {
            category: "rate_limited",
            hint: "The provider is rate limiting this request. Retry with backoff or another provider.",
            provider,
        };
    }

    if (upstreamCode === "unauthenticated") {
        return {
            category: "credentials_invalid_or_forbidden",
            hint: "The provider rejected the supplied credentials or permissions. Verify the gateway key or BYOK secret and retry.",
            provider,
        };
    }

    if (upstreamCode === "permission_denied") {
        return {
            category: "provider_access_missing",
            hint: "The provider account appears not to have access to this model or feature yet. Verify account entitlements and provider-side access.",
            provider,
        };
    }

    if (upstreamCode === "resource_exhausted") {
        return {
            category: "rate_limited",
            hint: "The provider is rate limiting this request. Retry with backoff or another provider.",
            provider,
        };
    }

    if (upstreamCode?.startsWith("google-vertex_oauth_error_")) {
        return {
            category: "credentials_invalid_or_forbidden",
            hint: "The provider rejected the supplied credentials or permissions. Verify the gateway key or BYOK secret and retry.",
            provider,
        };
    }

    if (
        haystack.includes("missing byok key") ||
        haystack.includes("missing credentials") ||
        haystack.includes("api key not configured") ||
        haystack.includes("google-vertex_project_missing") ||
        haystack.includes("no api key") ||
        haystack.includes("no credentials") ||
        haystack.includes("requires access key")
    ) {
        return {
            category: "credentials_not_configured",
            hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
            provider,
        };
    }

    if (
        haystack.includes("not available in your region") ||
        haystack.includes("unsupported region") ||
        haystack.includes("region") ||
        haystack.includes("location") ||
        haystack.includes("project") ||
        haystack.includes("publisher")
    ) {
        return {
            category: "region_or_project_restriction",
            hint: "The provider appears to be restricted by region, location, or project configuration. Verify the provider region and project access for this model.",
            provider,
        };
    }

    if (
        haystack.includes("permission denied") ||
        haystack.includes("access denied") ||
        haystack.includes("not enabled") ||
        haystack.includes("allowlist") ||
        haystack.includes("allow list") ||
        haystack.includes("not available to your account") ||
        haystack.includes("account does not have access")
    ) {
        return {
            category: "provider_access_missing",
            hint: "The provider account appears not to have access to this model or feature yet. Verify account entitlements and provider-side access.",
            provider,
        };
    }

    if (
        status === 401 ||
        (status === 403 &&
            (haystack.includes("api key") ||
                haystack.includes("unauthorized") ||
                haystack.includes("forbidden") ||
                haystack.includes("credential") ||
                haystack.includes("auth")))
    ) {
        return {
            category: "credentials_invalid_or_forbidden",
            hint: "The provider rejected the supplied credentials or permissions. Verify the gateway key or BYOK secret and retry.",
            provider,
        };
    }

    if (status === 404 || haystack.includes("not available for endpoint")) {
        return {
            category: "model_unavailable_for_endpoint",
            hint: "The provider does not appear to expose this model on the requested endpoint yet.",
            provider,
        };
    }

    if (status === 429) {
        return {
            category: "rate_limited",
            hint: "The provider is rate limiting this request. Retry with backoff or another provider.",
            provider,
        };
    }

    if (status != null && status >= 500) {
        return {
            category: "server_error",
            hint: "The provider returned a server-side failure. Retrying later may succeed.",
            provider,
        };
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
        ...(typeof entry?.normalized_error_code === "string"
            ? { normalized_error_code: entry.normalized_error_code }
            : {}),
        ...(typeof entry?.normalized_error_message === "string"
            ? { normalized_error_message: entry.normalized_error_message }
            : {}),
        ...(typeof entry?.normalized_error_action === "string"
            ? { normalized_error_action: entry.normalized_error_action }
            : {}),
        ...(typeof entry?.normalized_error_help_url === "string"
            ? { normalized_error_help_url: entry.normalized_error_help_url }
            : {}),
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
    const providerFailureDiagnostics = classifyProviderFailureDiagnostics(attemptErrors);
    const geographicAvailabilityStage = Array.isArray(routingDiagnostics?.filterStages)
        ? routingDiagnostics.filterStages.find((stage: any) =>
            stage?.stage === "geographic_availability_gate" &&
            Number(stage?.beforeCount ?? 0) > 0 &&
            Number(stage?.afterCount ?? 0) === 0
        )
        : null;
    const allProviderCapacityLimited = attemptErrors.length > 0 && attemptErrors.every(
        (entry) => isProviderRateLimitError(entry),
    );
    const allProviderFeaturesUnsupported = attemptErrors.length > 0 && attemptErrors.every(
        (entry) => entry.normalized_error_code === "provider_feature_unsupported",
    );
    const allProviderRequestsRejected = attemptErrors.length > 0 && attemptErrors.every((entry) => {
        return isProviderRequestRejected(entry);
    });
    const allProviderServicesUnavailable = attemptErrors.length > 0 && attemptErrors.every(
        (entry) => isProviderUnavailableError(entry),
    );
    if (allProviderCapacityLimited) {
        captureTimingSnapshot(ctx, timing);
        const retryAfter = attemptErrors
            .map((entry) => {
                const value = entry?.upstream_rate_limit_headers?.["Retry-After"];
                return typeof value === "string" ? parseRetryAfterSeconds(value) : null;
            })
            .filter((value): value is number => value != null)
            .sort((a, b) => a - b)[0] ?? null;
        const isStealth = isStealthRequest(ctx);
        const response = err("provider_capacity_exhausted", {
            reason: "all_candidates_rate_limited",
            description: "All attempted upstream routes were rate limited.",
            model: ctx.model,
            endpoint: ctx.endpoint,
            request_id: ctx.requestId,
            attempt_count: attemptErrors.length || null,
            failed_providers: !isStealth && failedProviders.length ? failedProviders : null,
            failed_statuses: !isStealth && failedStatuses.length ? failedStatuses : null,
            retry_after_seconds: retryAfter,
            failure_sample: !isStealth && failureSample.length ? failureSample : null,
            provider_failure_diagnostics: !isStealth ? providerFailureDiagnostics : null,
        });
        if (retryAfter != null) response.headers.set("Retry-After", String(retryAfter));
        return { ok: false, response };
    }
    if (geographicAvailabilityStage) {
        captureTimingSnapshot(ctx, timing);
        if (isStealthRequest(ctx)) {
            const response = json(
                normalizeGatewayErrorPayload({
                    error: "model_region_unavailable",
                    status_code: 403,
                    error_type: "user",
                    error_origin: "gateway",
                    responsibility: "user",
                    retryable: false,
                    description: "This model is not available from the request's geographic location.",
                    action: "Use the model from a supported location or select another model.",
                    request_id: ctx.requestId,
                    model: ctx.model,
                    endpoint: ctx.endpoint,
                    request_country: ctx.meta?.edgeCountry ?? null,
                    request_subdivision: ctx.meta?.edgeRegionCode ?? null,
                }, {
                    statusCode: 403,
                    requestId: ctx.requestId,
                    errorType: "user",
                    errorOrigin: "gateway",
                }),
                403,
            );
            if (ctx.requestId) response.headers.set("X-Request-Id", ctx.requestId);
            response.headers.set("X-Gateway-Error-Attribution", "user");
            response.headers.set("X-Gateway-Error-Origin", "gateway");
            return {
                ok: false,
                response,
            };
        }
        return {
            ok: false,
            response: err("model_region_unavailable", {
                reason: "all_routes_unavailable_in_request_country",
                description: "This model is not available from the request's geographic location.",
                model: ctx.model,
                endpoint: ctx.endpoint,
                request_id: ctx.requestId,
                request_country: ctx.meta?.edgeCountry ?? null,
                request_subdivision: ctx.meta?.edgeRegionCode ?? null,
                routing_diagnostics: routingDiagnostics,
            }),
        };
    }
    const hasUpstreamPaymentRequired = failedStatuses.includes(402) || attemptErrors.some(isProviderBalanceError);
    const paymentRequiredProvider = hasUpstreamPaymentRequired
        ? (attemptErrors.find(isProviderBalanceError)?.provider ?? null)
        : null;
    const paymentRequiredDescription = hasUpstreamPaymentRequired
        ? `The selected provider account${typeof paymentRequiredProvider === "string" ? ` (${paymentRequiredProvider})` : ""} has insufficient balance to complete this request. Try another provider or contact support.`
        : buildAllCandidatesFailedDescription({
            attemptErrors,
            failedProviders,
            failedStatuses,
            model: ctx.model,
            endpoint: ctx.endpoint,
        });

    captureTimingSnapshot(ctx, timing);
    if (isStealthRequest(ctx)) {
        const publicStatus = failedStatuses.length === 1 ? failedStatuses[0] : 502;
        const retryAfter = [...attemptErrors]
            .reverse()
            .map((entry) => entry?.upstream_rate_limit_headers?.["Retry-After"])
            .find((value): value is string => typeof value === "string") ?? null;
        const keySource = attemptErrors.some((entry) => entry?.key_source === "byok") ? "byok" : "gateway";
        const safePayload = buildSafeStealthUpstreamError({
            status: publicStatus,
            failedStatuses,
            model: ctx.model,
            endpoint: ctx.endpoint,
            requestId: ctx.requestId,
            keySource,
            retryAfter,
        });
        const response = json(
            normalizeGatewayErrorPayload(safePayload, {
                statusCode: publicStatus,
                requestId: ctx.requestId,
                errorType: publicStatus >= 500 ? "system" : "user",
                errorOrigin: "upstream",
                retryAfterSeconds: parseRetryAfterSeconds(retryAfter),
            }),
            publicStatus,
        );
        if (ctx.requestId) response.headers.set("X-Request-Id", ctx.requestId);
        response.headers.set("X-Gateway-Error-Attribution", "upstream");
        response.headers.set("X-Gateway-Error-Origin", "upstream");
        applyDownstreamRateLimitHeaders(response.headers, retryAfter ? { "Retry-After": retryAfter } : null);
        return {
            ok: false,
            response,
        };
    }
    const finalRateLimitHeaders = [...attemptErrors]
        .reverse()
        .map((entry) => entry?.upstream_rate_limit_headers)
        .find((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
    const finalRetryAfter =
        typeof finalRateLimitHeaders?.["Retry-After"] === "string"
            ? parseRetryAfterSeconds(finalRateLimitHeaders["Retry-After"])
            : null;
    const errorCode = hasUpstreamPaymentRequired
        ? "provider_payment_required"
        : allProviderFeaturesUnsupported
            ? "provider_feature_unsupported"
        : allProviderRequestsRejected
            ? "provider_request_rejected"
            : allProviderServicesUnavailable
                ? "provider_service_unavailable"
                : "upstream_error";
    const res = err(errorCode, {
        reason: hasUpstreamPaymentRequired
            ? "upstream_provider_payment_required"
            : allProviderFeaturesUnsupported
                ? "provider_feature_unsupported"
            : allProviderRequestsRejected
                ? "provider_rejected_request"
                : allProviderServicesUnavailable
                    ? "provider_service_unavailable"
                    : "all_candidates_failed",
        description: hasUpstreamPaymentRequired
            ? paymentRequiredDescription
            : allProviderFeaturesUnsupported
                ? "The requested feature is not supported by this model on the selected provider."
            : allProviderRequestsRejected
                ? buildAllCandidatesFailedDescription({ attemptErrors, failedProviders, failedStatuses, model: ctx.model, endpoint: ctx.endpoint })
                : allProviderServicesUnavailable
                    ? "The selected provider service is temporarily unavailable. Retry later or select another provider."
                    : buildAllCandidatesFailedDescription({ attemptErrors, failedProviders, failedStatuses, model: ctx.model, endpoint: ctx.endpoint }),
        ...(allProviderFeaturesUnsupported ? {
            message: attemptErrors[0]?.normalized_error_message,
            action: attemptErrors[0]?.normalized_error_action,
            help_url: attemptErrors[0]?.normalized_error_help_url,
        } : {}),
        model: ctx.model,
        endpoint: ctx.endpoint,
        request_id: ctx.requestId,
        attempt_count: attemptErrors.length || null,
        failed_providers: failedProviders.length ? failedProviders : null,
        failed_statuses: failedStatuses.length ? failedStatuses : null,
        retry_after_seconds: finalRetryAfter,
        failure_sample: failureSample.length ? failureSample : null,
        provider_payment_required_provider:
            typeof paymentRequiredProvider === "string" ? paymentRequiredProvider : null,
        provider_payment_required_support_notice: hasUpstreamPaymentRequired
            ? "Contact Phaseo support if the issue persists."
            : null,
        routing_diagnostics: routingDiagnostics,
        provider_enablement: providerEnablement,
        provider_candidate_diagnostics: candidateBuild,
        provider_failure_diagnostics: providerFailureDiagnostics,
    });
    applyDownstreamRateLimitHeaders(res.headers, finalRateLimitHeaders);

    return { ok: false, response: res };
}



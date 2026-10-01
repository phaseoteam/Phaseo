// Purpose: Persist normalized provider interactions beneath one gateway request.
// Why: Makes retries and failover queryable without inflating the parent request row.

import type { Endpoint } from "@core/types";
import { getSupabaseAdmin } from "@/runtime/env";

let tableAvailable: boolean | null = null;
let warnedMissingTable = false;

type ProviderAttempt = Record<string, unknown>;

export type PersistGatewayUpstreamRequestsArgs = {
    insertedRow: { id: string; created_at: string; workspace_id: string };
    requestId: string;
    workspaceId: string;
    appId?: string | null;
    keyId?: string | null;
    endpoint: Endpoint;
    modelId: string;
    provider?: string | null;
    providerApiModelId?: string | null;
    providerModelSlug?: string | null;
    providerAttempts?: ProviderAttempt[] | null;
    statusCode?: number | null;
    success: boolean;
    nativeResponseId?: string | null;
    finishReason?: string | null;
    usage?: unknown;
    totalNanos?: number | null;
    currency?: string | null;
    latencyMs?: number | null;
    generationMs?: number | null;
    totalMs?: number | null;
    context: string;
};

function normalizeJsonValue(value: unknown): unknown {
    if (value == null) return null;
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
}

function isMissingTableError(error: unknown): boolean {
    const candidate = error && typeof error === "object"
        ? error as Record<string, unknown>
        : null;
    const cause = candidate?.cause && typeof candidate.cause === "object"
        ? candidate.cause as Record<string, unknown>
        : null;
    const code = String(cause?.code ?? candidate?.code ?? "");
    const message = String(cause?.message ?? candidate?.message ?? "").toLowerCase();
    return (code === "PGRST205" || code === "42P01")
        && message.includes("gateway_upstream_requests");
}

function finiteInteger(value: unknown): number | null {
    if (value == null || (typeof value === "string" && value.trim() === "")) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function isSuccessfulAttempt(attempt: ProviderAttempt): boolean {
    const status = finiteInteger(attempt.status);
    return attempt.outcome === "success"
        || (status != null && status >= 200 && status < 300);
}

function buildAttempts(args: PersistGatewayUpstreamRequestsArgs): ProviderAttempt[] {
    const attempts = Array.isArray(args.providerAttempts)
        ? args.providerAttempts.filter((attempt) => attempt && typeof attempt === "object")
        : [];
    if (attempts.length > 0) return attempts;
    if (!args.provider) return [];
    return [{
        attempt_number: 1,
        provider: args.provider,
        model: args.modelId,
        api_model_id: args.providerApiModelId ?? null,
        provider_model_slug: args.providerModelSlug ?? null,
        outcome: args.success ? "success" : "error",
        status: args.statusCode ?? null,
        duration_ms: args.totalMs ?? args.latencyMs ?? null,
    }];
}

function buildRows(args: PersistGatewayUpstreamRequestsArgs) {
    const attempts = buildAttempts(args);
    const hasRecordedAttempts = Array.isArray(args.providerAttempts)
        && args.providerAttempts.some((attempt) => attempt && typeof attempt === "object");
    let finalAttemptIndex = -1;
    for (let index = attempts.length - 1; index >= 0; index -= 1) {
        if (isSuccessfulAttempt(attempts[index])) {
            finalAttemptIndex = index;
            break;
        }
    }
    if (finalAttemptIndex < 0 && attempts.length > 0) {
        finalAttemptIndex = attempts.length - 1;
    }
    const totalNanos = Number.isFinite(Number(args.totalNanos))
        ? Math.max(0, Math.round(Number(args.totalNanos)))
        : 0;

    return attempts.map((attempt, index) => {
        const isFinal = index === finalAttemptIndex;
        const statusCode = finiteInteger(attempt.status)
            ?? (!hasRecordedAttempts && isFinal ? finiteInteger(args.statusCode) : null);
        const success = isSuccessfulAttempt(attempt)
            || (isFinal && args.success);
        const outcome = typeof attempt.outcome === "string"
            ? attempt.outcome
            : success ? "success" : "error";
        const error = attempt.error && typeof attempt.error === "object"
            ? attempt.error as Record<string, unknown>
            : {};
        const durationMs = finiteInteger(attempt.duration_ms);
        const totalMs = isFinal
            ? finiteInteger(args.totalMs) ?? finiteInteger(args.latencyMs) ?? durationMs
            : durationMs;

        return {
            created_at: args.insertedRow.created_at,
            gateway_request_id: args.insertedRow.id,
            gateway_request_created_at: args.insertedRow.created_at,
            request_id: args.requestId,
            workspace_id: args.workspaceId,
            app_id: args.appId ?? null,
            key_id: args.keyId ?? null,
            sequence: index + 1,
            round_number: finiteInteger(attempt.round_number) ?? 1,
            attempt_number: finiteInteger(attempt.attempt_number) ?? index + 1,
            internal_attempt_number: finiteInteger(attempt.internal_attempt_number),
            stage: ["blocked", "no_pricing", "unsupported_executor"].includes(outcome)
                ? "routing"
                : "upstream",
            endpoint: args.endpoint,
            model_id: typeof attempt.model === "string" ? attempt.model : args.modelId,
            provider: typeof attempt.provider === "string" ? attempt.provider : args.provider ?? null,
            api_model_id: typeof attempt.api_model_id === "string"
                ? attempt.api_model_id
                : isFinal ? args.providerApiModelId ?? null : null,
            provider_model_slug: typeof attempt.provider_model_slug === "string"
                ? attempt.provider_model_slug
                : isFinal ? args.providerModelSlug ?? null : null,
            upstream_route: typeof attempt.upstream_route === "string" ? attempt.upstream_route : null,
            upstream_url: typeof attempt.upstream_url === "string" ? attempt.upstream_url : null,
            status_code: statusCode,
            status_text: typeof attempt.status_text === "string" ? attempt.status_text : null,
            success,
            outcome,
            retryable: typeof attempt.retryable === "boolean" ? attempt.retryable : null,
            fallback_attempted: attempt.fallback_attempted === true,
            was_probe: attempt.was_probe === true,
            key_source: attempt.key_source === "gateway" || attempt.key_source === "byok"
                ? attempt.key_source
                : null,
            native_response_id: isFinal ? args.nativeResponseId ?? null : null,
            provider_finish_reason: typeof attempt.provider_finish_reason === "string"
                ? attempt.provider_finish_reason
                : null,
            finish_reason: isFinal ? args.finishReason ?? null : null,
            duration_ms: durationMs,
            latency_ms: isFinal ? finiteInteger(args.latencyMs) : null,
            generation_ms: isFinal ? finiteInteger(args.generationMs) : null,
            total_ms: totalMs,
            request_build_ms: finiteInteger(attempt.request_build_ms),
            upstream_headers_ms: finiteInteger(attempt.upstream_headers_ms),
            retry_delay_ms: finiteInteger(attempt.retry_delay_ms),
            usage: isFinal ? normalizeJsonValue(args.usage) ?? {} : {},
            cost_nanos: isFinal && success ? totalNanos : 0,
            currency: args.currency ?? null,
            error_code: typeof attempt.upstream_error_code === "string"
                ? attempt.upstream_error_code
                : typeof error.code === "string" ? error.code : null,
            error_type: typeof attempt.upstream_error_type === "string"
                ? attempt.upstream_error_type
                : typeof error.type === "string" ? error.type : null,
            error_message: typeof attempt.upstream_error_message === "string"
                ? attempt.upstream_error_message
                : typeof error.message === "string" ? error.message : null,
            error_description: typeof attempt.upstream_error_description === "string"
                ? attempt.upstream_error_description
                : typeof error.description === "string" ? error.description : null,
            error_param: typeof attempt.upstream_error_param === "string"
                ? attempt.upstream_error_param
                : typeof error.param === "string" ? error.param : null,
            request_payload: null,
            response_payload: null,
            metadata: normalizeJsonValue({
                started_at_unix_ms: finiteInteger(attempt.started_at_unix_ms),
                response_kind: attempt.response_kind ?? null,
                upstream_request_count: attempt.upstream_request_count ?? null,
                upstream_poll_count: attempt.upstream_poll_count ?? null,
                upstream_auth_count: attempt.upstream_auth_count ?? null,
                upstream_preflight_count: attempt.upstream_preflight_count ?? null,
                upstream_media_count: attempt.upstream_media_count ?? null,
            }) ?? {},
        };
    });
}

export async function persistGatewayUpstreamRequests(
    args: PersistGatewayUpstreamRequestsArgs,
): Promise<void> {
    if (tableAvailable === false) return;
    const rows = buildRows(args);
    if (rows.length === 0) return;
    try {
        const { error } = await getSupabaseAdmin()
            .from("gateway_upstream_requests")
            .insert(rows);
        if (error) {
            const wrapped = new Error(
                `[audit] insert gateway_upstream_requests error: ${error.message ?? "unknown"}`,
            );
            (wrapped as Error & { cause?: unknown }).cause = error;
            throw wrapped;
        }
        tableAvailable = true;
    } catch (error) {
        if (isMissingTableError(error)) {
            tableAvailable = false;
            if (!warnedMissingTable) {
                warnedMissingTable = true;
                console.warn(
                    "[audit] gateway_upstream_requests is unavailable; skipping normalized child rows.",
                );
            }
            return;
        }
        console.error("[audit] failed to persist upstream requests", {
            context: args.context,
            requestId: args.requestId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

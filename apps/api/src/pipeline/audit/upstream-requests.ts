// Purpose: Persist normalized provider interactions beneath one gateway request.
// Why: Keeps high-cardinality upstream attempts queryable without bloating the parent JSONB row.

import type { Endpoint } from "@core/types";
import { getSupabaseAdmin } from "@/runtime/env";

let tableAvailable: boolean | null = null;
let warnedMissingTable = false;

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
    const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const cause = candidate?.cause && typeof candidate.cause === "object"
        ? candidate.cause as Record<string, unknown>
        : null;
    const code = String(cause?.code ?? candidate?.code ?? "");
    const message = String(cause?.message ?? candidate?.message ?? "").toLowerCase();
    return (code === "PGRST205" || code === "42P01") && message.includes("gateway_upstream_requests");
}

function readUsageWeight(usage: unknown): number {
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) return 0;
    const record = usage as Record<string, unknown>;
    for (const key of ["total_tokens", "totalTokens"]) {
        const value = Number(record[key]);
        if (Number.isFinite(value) && value > 0) return value;
    }
    const input = Number(record.input_tokens ?? record.inputTokens ?? record.prompt_tokens ?? 0);
    const output = Number(record.output_tokens ?? record.outputTokens ?? record.completion_tokens ?? 0);
    const total = (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
    return total > 0 ? total : 0;
}

function allocateCosts(exchanges: Array<Record<string, any>>, totalNanos: number): number[] {
    const safeTotal = Number.isFinite(totalNanos) ? Math.max(0, Math.round(totalNanos)) : 0;
    const weights = exchanges.map((exchange) =>
        exchange.outcome === "success" ? readUsageWeight(exchange.usage) : 0
    );
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let finalSuccessIndex = -1;
    for (let index = exchanges.length - 1; index >= 0; index -= 1) {
        if (exchanges[index]?.outcome === "success") {
            finalSuccessIndex = index;
            break;
        }
    }
    if (safeTotal === 0 || finalSuccessIndex < 0) return exchanges.map(() => 0);
    if (totalWeight <= 0) {
        return exchanges.map((_, index) => index === finalSuccessIndex ? safeTotal : 0);
    }
    let allocated = 0;
    return exchanges.map((_, index) => {
        if (index === finalSuccessIndex) return Math.max(0, safeTotal - allocated);
        const value = Math.max(0, Math.floor((safeTotal * weights[index]!) / totalWeight));
        allocated += value;
        return value;
    });
}

function buildRows(args: PersistGatewayUpstreamRequestsArgs, exchanges: Array<Record<string, any>>) {
    const costs = allocateCosts(exchanges, args.totalNanos ?? 0);
    return exchanges.map((exchange, index) => {
        const error = exchange.error && typeof exchange.error === "object"
            ? exchange.error as Record<string, unknown>
            : {};
        const statusCode = Number(exchange.status);
        const success = exchange.outcome === "success" ||
            (Number.isFinite(statusCode) && statusCode >= 200 && statusCode < 300);
        const finiteMs = (value: unknown) =>
            Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
        return {
            created_at: args.insertedRow.created_at,
            gateway_request_id: args.insertedRow.id,
            gateway_request_created_at: args.insertedRow.created_at,
            request_id: args.requestId,
            workspace_id: args.workspaceId,
            app_id: args.appId ?? null,
            key_id: args.keyId ?? null,
            sequence: Number(exchange.sequence) || index + 1,
            round_number: Number(exchange.round_number) || 1,
            attempt_number: Number(exchange.attempt_number) || null,
            internal_attempt_number: Number(exchange.internal_attempt_number) || null,
            stage: exchange.stage === "routing" ? "routing" : "upstream",
            endpoint: args.endpoint,
            model_id: typeof exchange.model === "string" && exchange.model ? exchange.model : args.modelId,
            provider: typeof exchange.provider === "string" ? exchange.provider : null,
            api_model_id: typeof exchange.api_model_id === "string" ? exchange.api_model_id : null,
            provider_model_slug: typeof exchange.provider_model_slug === "string" ? exchange.provider_model_slug : null,
            upstream_route: typeof exchange.upstream_route === "string" ? exchange.upstream_route : null,
            upstream_url: typeof exchange.upstream_url === "string" ? exchange.upstream_url : null,
            status_code: Number.isFinite(statusCode) ? statusCode : null,
            status_text: typeof exchange.status_text === "string" ? exchange.status_text : null,
            success,
            outcome: typeof exchange.outcome === "string" ? exchange.outcome : success ? "success" : "error",
            retryable: typeof exchange.retryable === "boolean" ? exchange.retryable : null,
            fallback_attempted: exchange.fallback_attempted === true,
            was_probe: exchange.was_probe === true,
            key_source: exchange.key_source === "gateway" || exchange.key_source === "byok" ? exchange.key_source : null,
            native_response_id: typeof exchange.native_response_id === "string" ? exchange.native_response_id : null,
            provider_finish_reason: typeof exchange.provider_finish_reason === "string" ? exchange.provider_finish_reason : null,
            finish_reason: typeof exchange.finish_reason === "string" ? exchange.finish_reason : null,
            duration_ms: finiteMs(exchange.duration_ms),
            latency_ms: finiteMs(exchange.latency_ms),
            generation_ms: finiteMs(exchange.generation_ms),
            total_ms: finiteMs(exchange.total_ms),
            request_build_ms: finiteMs(exchange.request_build_ms),
            upstream_headers_ms: finiteMs(exchange.upstream_headers_ms),
            retry_delay_ms: finiteMs(exchange.retry_delay_ms),
            usage: normalizeJsonValue(exchange.usage) ?? {},
            cost_nanos: costs[index] ?? 0,
            currency: args.currency ?? null,
            error_code: typeof error.code === "string" ? error.code : null,
            error_type: typeof error.type === "string" ? error.type : null,
            error_message: typeof error.message === "string" ? error.message : null,
            error_description: typeof error.description === "string" ? error.description : null,
            error_param: typeof error.param === "string" ? error.param : null,
            request_payload: normalizeJsonValue(exchange.upstream_request),
            response_payload: normalizeJsonValue(exchange.upstream_response),
            metadata: normalizeJsonValue({
                response_source: exchange.response_source ?? null,
                response_kind: exchange.response_kind ?? null,
                byok_key_id: exchange.byok_key_id ?? null,
            }) ?? {},
        };
    });
}

export type PersistGatewayUpstreamRequestsArgs = {
    insertedRow: { id: string; created_at: string; workspace_id: string };
    requestId: string;
    workspaceId: string;
    appId?: string | null;
    keyId?: string | null;
    endpoint: Endpoint;
    modelId: string;
    currency?: string | null;
    totalNanos?: number | null;
    detailMetadata?: Record<string, unknown> | null;
    context: string;
};

export async function persistGatewayUpstreamRequests(
    args: PersistGatewayUpstreamRequestsArgs,
): Promise<void> {
    if (tableAvailable === false) return;
    const exchanges = Array.isArray(args.detailMetadata?.upstream_exchanges)
        ? args.detailMetadata.upstream_exchanges as Array<Record<string, any>>
        : [];
    if (exchanges.length === 0) return;
    try {
        const { error } = await getSupabaseAdmin()
            .from("gateway_upstream_requests")
            .insert(buildRows(args, exchanges));
        if (error) {
            const wrapped = new Error(
                `[audit] insert gateway_upstream_requests error: ${error.message ?? "unknown"}`
            );
            (wrapped as any).cause = error;
            throw wrapped;
        }
        tableAvailable = true;
    } catch (error) {
        if (isMissingTableError(error)) {
            tableAvailable = false;
            if (!warnedMissingTable) {
                warnedMissingTable = true;
                console.warn("[audit] gateway_upstream_requests is unavailable; skipping normalized child rows.");
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

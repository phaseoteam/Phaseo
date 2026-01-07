// src/lib/gateway/audit/axiom.ts
import { getBindings } from "@/runtime/env";
import type { Endpoint } from "../../types";

export type AxiomArgs = {
    // Required identifiers
    dataset?: string;                 // defaults from env
    token?: string;                   // defaults from env

    // Core identifiers
    requestId: string;
    teamId: string;

    // Request facts
    provider: string;
    model: string;
    endpoint: Endpoint;
    stream: boolean;
    isByok: boolean;

    // App hints
    appTitle?: string | null;
    referer?: string | null;

    // Native / HTTP
    nativeResponseId?: string | null;
    statusCode?: number | null;
    success: boolean;
    errorCode?: string | null;        // use for failure paths if you log them here
    errorMessage?: string | null;

    // Timings (ms)
    // End-to-end (redundant but handy)
    generationMs?: number | null;     // adapter/provider time you surface
    latencyMs?: number | null;        // end-to-end total you want to show      
    throughput?: number | null;       // tokens/sec if you compute it
    internalLatencyMs?: number | null; // request->outbound dispatch time

    // Usage/cost
    usage?: {
        input_text_tokens?: number | null;
        output_text_tokens?: number | null;
        total_tokens?: number | null;
        cached_read_text_tokens?: number | null;
        reasoning_tokens?: number | null;
        // Optional multimodal usage signals
        input_image_count?: number | null;
        output_image_count?: number | null;
        input_audio_count?: number | null;
        output_audio_count?: number | null;
        input_video_count?: number | null;
        output_video_count?: number | null;
    } | null;

    pricing?: {
        total_cents?: number | null;
        total_nanos?: number | null;
        total_usd_str?: string | null;
        currency?: "USD" | string | null;
        // To avoid field explosion, we’ll stringify the line items.
        lines_json?: string | null;     // JSON.stringify(payload.usage.pricing.lines) or null
    } | null;

    // Completion
    finishReason?: string | null;

    // Misc
    env?: string | null;              // NODE_ENV, etc.
    apiVersion?: string | null;
};

/** Build the final event shape Axiom will receive.
 *  Keep fields FLAT to avoid exceeding plan limits.
 */
export function buildAxiomEvent(a: AxiomArgs) {
    // Derived metrics
    const tokensIn = a.usage?.input_text_tokens ?? 0;
    const tokensOut = a.usage?.output_text_tokens ?? 0;
    const tokensTot = a.usage?.total_tokens ?? 0;

    const genMs = a.generationMs ?? 0;
    const genSecs = genMs > 0 ? genMs / 1000 : 0;
    const derivedThroughputTps = genSecs > 0 ? tokensTot / genSecs : 0;
    const throughput_tps = a.throughput ?? derivedThroughputTps;

    const totalCents = a.pricing?.total_cents ?? 0;
    const totalUsd = (typeof a.pricing?.total_usd_str === "string")
        ? Number(a.pricing!.total_usd_str)
        : (typeof a.pricing?.total_nanos === "number"
            ? a.pricing.total_nanos / 1_000_000_000
            : (totalCents / 100));

    const tokens_per_dollar = totalUsd > 0 ? tokensTot / totalUsd : null;

    // A single flat object (Axiom-friendly)
    return {
        // identity
        request_id: a.requestId,
        team_id: a.teamId,

        // app
        app_title: a.appTitle ?? null,
        referer: a.referer ?? null,

        // request facts
        provider: a.provider,
        model: a.model,
        endpoint: a.endpoint,
        stream: !!a.stream,
        byok: !!a.isByok,

        // upstream/http
        native_response_id: a.nativeResponseId ?? null,
        status_code: a.statusCode ?? null,
        success: !!a.success,
        error_code: a.errorCode ?? null,
        error_message: a.errorMessage ?? null,

        // timing: surfaced
        generation_ms: a.generationMs ?? null,
        latency_ms: a.latencyMs ?? null,
        throughput_tps,
        internal_latency_ms: a.internalLatencyMs ?? null,

        // usage
        usage_tokens_in: tokensIn,
        usage_tokens_out: tokensOut,
        usage_tokens_total: tokensTot,
        usage_cached_tokens: a.usage?.cached_read_text_tokens ?? null,
        usage_reasoning_tokens: a.usage?.reasoning_tokens ?? null,
        usage_image_input_count: a.usage?.input_image_count ?? null,
        usage_image_output_count: a.usage?.output_image_count ?? (a.usage as any)?.output_image ?? null,
        usage_audio_input_count: a.usage?.input_audio_count ?? null,
        usage_audio_output_count: a.usage?.output_audio_count ?? null,
        usage_video_input_count: a.usage?.input_video_count ?? null,
        usage_video_output_count: a.usage?.output_video_count ?? (a.usage as any)?.output_video_seconds ?? null,

        // cost
        cost_total_cents: totalCents,
        cost_total_usd: totalUsd,
        cost_total_nanos: a.pricing?.total_nanos ?? null,
        cost_currency: a.pricing?.currency ?? "USD",
        pricing_lines_json: a.pricing?.lines_json ?? null,

        // completion
        finish_reason: a.finishReason ?? null,

        // derived metrics
        tps_total: throughput_tps,
        tokens_per_dollar: tokens_per_dollar,

        // misc
        env: a.env ?? getBindings().NODE_ENV ?? null,
        api_version: a.apiVersion ?? null,

        // ingestion time will be set by Axiom automatically
    };
}

/** Send one event to Axiom (JSON ingestion). */
export async function sendAxiomEvent(args: AxiomArgs) {
    const bindings = getBindings();
    const dataset = args.dataset ?? bindings.AXIOM_DATASET;
    const token = args.token ?? bindings.AXIOM_API_KEY;

    if (!dataset || !token) {
        throw new Error(`[ERROR Axiom] Missing configuration for requestId ${args.requestId}: dataset=${!!dataset}, token=${!!token}`);
    }

    const event = buildAxiomEvent(args);
    const eventJson = JSON.stringify([event]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
        const res = await fetch(`https://api.axiom.co/v1/datasets/${encodeURIComponent(dataset)}/ingest`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: eventJson,
            cache: "no-store",
            signal: controller.signal,
        });

        if (!res.ok) {
            const responseText = await res.text().catch(() => "unable to read response");
            const error = new Error(`[ERROR Axiom] Ingest failed for requestId ${args.requestId}: status ${res.status} ${res.statusText}`);
            (error as any).response = responseText.substring(0, 500);
            (error as any).status = res.status;
            throw error;
        }
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`[ERROR Axiom] Request timeout for requestId ${args.requestId}`);
        }
        if (err instanceof Error) throw err;
        throw new Error(`[ERROR Axiom] Ingest error for requestId ${args.requestId}: ${String(err)}`);
    } finally {
        clearTimeout(timeoutId);
    }
}

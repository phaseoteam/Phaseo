// src/lib/gateway/audit/axiom.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Builds a flattened event and sends it to Axiom.

import { getBindings } from "@/runtime/env";
import type { Endpoint } from "@core/types";

export type AxiomArgs = {
    // Required identifiers
    dataset?: string;                 // defaults from env
    token?: string;                   // defaults from env

    // Core identifiers
    requestId: string;
    teamId: string;
    keyId?: string | null;

    // Request facts
    provider: string;
    model: string;
    endpoint: Endpoint;
    stream: boolean;
    isByok: boolean;
    stage?: "before" | "execute" | "after";

    // App hints
    appTitle?: string | null;
    referer?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;

    // Native / HTTP
    nativeResponseId?: string | null;
    statusCode?: number | null;
    success: boolean;
    errorCode?: string | null;        // use for failure paths if you log them here
    errorMessage?: string | null;
    errorType?: "system" | "user" | null;

    // Timings (ms)
    // End-to-end (redundant but handy)
    generationMs?: number | null;     // adapter/provider time you record
    latencyMs?: number | null;        // end-to-end total you want to show
    throughput?: number | null;       // tokens/sec if you compute it
    internalLatencyMs?: number | null; // request->outbound dispatch time

    // Usage/cost
    usage?: {
        input_text_tokens?: number | null;
        output_text_tokens?: number | null;
        total_tokens?: number | null;
        request_tool_count?: number | null;
        request_tool_result_count?: number | null;
        output_tool_call_count?: number | null;
        tool_call_count?: number | null;
        tool_result_count?: number | null;
        cached_read_text_tokens?: number | null;
        reasoning_tokens?: number | null;
        input_audio_tokens?: number | null;
        output_audio_tokens?: number | null;
        input_video_tokens?: number | null;
        output_video_tokens?: number | null;
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
        // To avoid field explosion, we'll stringify the line items.
        lines_json?: string | null;     // JSON.stringify(payload.usage.pricing.lines) or null
        lines?: Array<{ dimension?: string; line_nanos?: number | null }> | null;
    } | null;

    // Completion
    finishReason?: string | null;

    // ============================================================================
    // TEAM & KEY ENRICHMENT (Wide Event Context for Observability)
    // Purpose: User/team context following loggingsucks.com pattern
    // ============================================================================
    teamEnrichment?: {
        tier?: string | null;
        created_at?: string | null;
        account_age_days?: number | null;
        balance_nanos?: number | null;
        balance_usd?: number | null;
        balance_is_low?: boolean | null;
        total_requests?: number | null;
        total_spend_nanos?: number | null;
        total_spend_usd?: number | null;
        spend_24h_nanos?: number | null;
        spend_24h_usd?: number | null;
        spend_7d_nanos?: number | null;
        spend_7d_usd?: number | null;
        spend_30d_nanos?: number | null;
        spend_30d_usd?: number | null;
        requests_1h?: number | null;
        requests_24h?: number | null;
    } | null;

    keyEnrichment?: {
        name?: string | null;
        created_at?: string | null;
        key_age_days?: number | null;
        total_requests?: number | null;
        total_spend_nanos?: number | null;
        total_spend_usd?: number | null;
        requests_today?: number | null;
        spend_today_nanos?: number | null;
        spend_today_usd?: number | null;
        daily_limit_pct?: number | null;
    } | null;

    // ============================================================================
    // REQUEST ENRICHMENT (Business Context)
    // ============================================================================
    requestEnrichment?: {
        has_tools?: boolean | null;
        tool_count?: number | null;
        has_images?: boolean | null;
        has_audio?: boolean | null;
        has_video?: boolean | null;
        message_count?: number | null;
        system_prompt_length?: number | null;
        max_tokens_requested?: number | null;
        temperature?: number | null;
        top_p?: number | null;
        presence_penalty?: number | null;
        frequency_penalty?: number | null;
    } | null;

    // ============================================================================
    // ROUTING & HEALTH CONTEXT (Flattened for queryability)
    // ============================================================================
    routingContext?: {
        candidates_count?: number | null;
        first_provider?: string | null;
        attempts?: number | null;
        failed_providers?: string[] | null;
        failure_reasons?: string[] | null;
        circuit_breaker_open?: boolean | null;
        was_probe?: boolean | null;
        requested_params_count?: number | null;
        requested_params?: string[] | null;
        param_provider_count_before?: number | null;
        param_provider_count_after?: number | null;
        param_dropped_provider_count?: number | null;
    } | null;

    // Misc
    env?: string | null;              // NODE_ENV, etc.
    apiVersion?: string | null;
    extraJson?: string | null;
};

/** Build the final event shape Axiom will receive.
 *  Keep fields FLAT to avoid exceeding plan limits.
 */
export function buildAxiomEvent(a: AxiomArgs) {
    const parseLines = () => {
        if (Array.isArray(a.pricing?.lines)) return a.pricing?.lines ?? [];
        if (typeof a.pricing?.lines_json === "string") {
            try {
                const parsed = JSON.parse(a.pricing.lines_json);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    };
    const lines = parseLines();
    const lineNanosByDim = new Map<string, number>();
    for (const line of lines) {
        const dim = typeof line?.dimension === "string" ? line.dimension : null;
        if (!dim) continue;
        const nanos = Number(line?.line_nanos ?? 0);
        if (!Number.isFinite(nanos)) continue;
        lineNanosByDim.set(dim, (lineNanosByDim.get(dim) ?? 0) + nanos);
    }
    const costInputText = lineNanosByDim.get("input_text_tokens") ?? 0;
    const costOutputText = lineNanosByDim.get("output_text_tokens") ?? 0;
    const costInputImage = lineNanosByDim.get("input_image_tokens") ?? 0;
    const costOutputImage = (lineNanosByDim.get("output_image_tokens") ?? 0) + (lineNanosByDim.get("output_image") ?? 0);
    const costInputAudio = lineNanosByDim.get("input_audio_tokens") ?? 0;
    const costOutputAudio = lineNanosByDim.get("output_audio_tokens") ?? 0;
    const costInputVideo = lineNanosByDim.get("input_video_tokens") ?? 0;
    const costOutputVideo = (lineNanosByDim.get("output_video_tokens") ?? 0) + (lineNanosByDim.get("output_video_seconds") ?? 0);
    const costCachedRead = lineNanosByDim.get("cached_read_text_tokens") ?? 0;
    const costCachedWrite = lineNanosByDim.get("cached_write_text_tokens") ?? 0;
    const costInputTotal = costInputText + costInputImage + costInputAudio + costInputVideo + costCachedRead;
    const costOutputTotal = costOutputText + costOutputImage + costOutputAudio + costOutputVideo + costCachedWrite;

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

    // A single flat object (Axiom-friendly) following loggingsucks.com wide event pattern
    return {
        event_type: "gateway.audit",
        // ====================================================================
        // IDENTITY & CORE
        // ====================================================================
        request_id: a.requestId,
        team_id: a.teamId,
        key_id: a.keyId ?? null,

        // app
        app_title: a.appTitle ?? null,
        referer: a.referer ?? null,

        // request facts
        provider: a.provider,
        model: a.model,
        endpoint: a.endpoint,
        stream: !!a.stream,
        byok: !!a.isByok,
        stage: a.stage ?? null,

        // upstream/http
        native_response_id: a.nativeResponseId ?? null,
        status_code: a.statusCode ?? null,
        success: !!a.success,
        error_code: a.errorCode ?? null,
        error_message: a.errorMessage ?? null,
        error_type: a.errorType ?? null,
        request_method: a.requestMethod ?? null,
        request_path: a.requestPath ?? null,
        request_url: a.requestUrl ?? null,
        user_agent: a.userAgent ?? null,
        client_ip: a.clientIp ?? null,
        cf_ray: a.cfRay ?? null,
        location: a.edgeColo ?? null,
        edge_city: a.edgeCity ?? null,
        edge_country: a.edgeCountry ?? null,
        edge_continent: a.edgeContinent ?? null,
        edge_asn: a.edgeAsn ?? null,

        // ====================================================================
        // TIMING
        // ====================================================================
        generation_ms: a.generationMs ?? null,
        latency_ms: a.latencyMs ?? null,
        throughput_tps,
        internal_latency_ms: a.internalLatencyMs ?? null,

        // ====================================================================
        // USAGE
        // ====================================================================
        usage_tokens_in: tokensIn,
        usage_tokens_out: tokensOut,
        usage_tokens_total: tokensTot,
        usage_request_tool_count: a.usage?.request_tool_count ?? null,
        usage_request_tool_result_count: a.usage?.request_tool_result_count ?? a.usage?.tool_result_count ?? null,
        usage_output_tool_call_count: a.usage?.output_tool_call_count ?? a.usage?.tool_call_count ?? null,
        usage_cached_tokens: a.usage?.cached_read_text_tokens ?? null,
        usage_reasoning_tokens: a.usage?.reasoning_tokens ?? null,
        usage_audio_tokens_in: a.usage?.input_audio_tokens ?? null,
        usage_audio_tokens_out: a.usage?.output_audio_tokens ?? null,
        usage_video_tokens_in: a.usage?.input_video_tokens ?? null,
        usage_video_tokens_out: a.usage?.output_video_tokens ?? null,
        usage_image_input_count: a.usage?.input_image_count ?? null,
        usage_image_output_count: a.usage?.output_image_count ?? (a.usage as any)?.output_image ?? null,
        usage_audio_input_count: a.usage?.input_audio_count ?? null,
        usage_audio_output_count: a.usage?.output_audio_count ?? null,
        usage_video_input_count: a.usage?.input_video_count ?? null,
        usage_video_output_count: a.usage?.output_video_count ?? (a.usage as any)?.output_video_seconds ?? null,

        // ====================================================================
        // COST
        // ====================================================================
        cost_total_cents: totalCents,
        cost_total_usd: totalUsd,
        cost_total_nanos: a.pricing?.total_nanos ?? null,
        cost_currency: a.pricing?.currency ?? "USD",
        pricing_lines_json: a.pricing?.lines_json ?? null,
        cost_input_tokens_nanos: costInputTotal,
        cost_output_tokens_nanos: costOutputTotal,
        cost_input_text_nanos: costInputText,
        cost_output_text_nanos: costOutputText,
        cost_input_image_nanos: costInputImage,
        cost_output_image_nanos: costOutputImage,
        cost_input_audio_nanos: costInputAudio,
        cost_output_audio_nanos: costOutputAudio,
        cost_input_video_nanos: costInputVideo,
        cost_output_video_nanos: costOutputVideo,
        cost_cached_read_nanos: costCachedRead,
        cost_cached_write_nanos: costCachedWrite,

        // completion
        finish_reason: a.finishReason ?? null,

        // derived metrics
        tps_total: throughput_tps,

        // ====================================================================
        // TEAM ENRICHMENT (Wide Event Context - "What type of user am I dealing with?")
        // ====================================================================
        team_tier: a.teamEnrichment?.tier ?? null,
        team_created_at: a.teamEnrichment?.created_at ?? null,
        team_account_age_days: a.teamEnrichment?.account_age_days ?? null,
        team_balance_nanos: a.teamEnrichment?.balance_nanos ?? null,
        team_balance_usd: a.teamEnrichment?.balance_usd ?? null,
        team_balance_is_low: a.teamEnrichment?.balance_is_low ?? null,
        team_total_requests: a.teamEnrichment?.total_requests ?? null,
        team_total_spend_nanos: a.teamEnrichment?.total_spend_nanos ?? null,
        team_total_spend_usd: a.teamEnrichment?.total_spend_usd ?? null,
        team_spend_24h_nanos: a.teamEnrichment?.spend_24h_nanos ?? null,
        team_spend_24h_usd: a.teamEnrichment?.spend_24h_usd ?? null,
        team_spend_7d_nanos: a.teamEnrichment?.spend_7d_nanos ?? null,
        team_spend_7d_usd: a.teamEnrichment?.spend_7d_usd ?? null,
        team_spend_30d_nanos: a.teamEnrichment?.spend_30d_nanos ?? null,
        team_spend_30d_usd: a.teamEnrichment?.spend_30d_usd ?? null,
        team_requests_1h: a.teamEnrichment?.requests_1h ?? null,
        team_requests_24h: a.teamEnrichment?.requests_24h ?? null,

        // ====================================================================
        // KEY ENRICHMENT (API Key Context)
        // ====================================================================
        key_name: a.keyEnrichment?.name ?? null,
        key_created_at: a.keyEnrichment?.created_at ?? null,
        key_age_days: a.keyEnrichment?.key_age_days ?? null,
        key_total_requests: a.keyEnrichment?.total_requests ?? null,
        key_total_spend_nanos: a.keyEnrichment?.total_spend_nanos ?? null,
        key_total_spend_usd: a.keyEnrichment?.total_spend_usd ?? null,
        key_requests_today: a.keyEnrichment?.requests_today ?? null,
        key_spend_today_nanos: a.keyEnrichment?.spend_today_nanos ?? null,
        key_spend_today_usd: a.keyEnrichment?.spend_today_usd ?? null,
        key_daily_limit_pct: a.keyEnrichment?.daily_limit_pct ?? null,

        // ====================================================================
        // REQUEST ENRICHMENT (Business Context)
        // ====================================================================
        request_has_tools: a.requestEnrichment?.has_tools ?? null,
        request_tool_count: a.requestEnrichment?.tool_count ?? null,
        request_has_images: a.requestEnrichment?.has_images ?? null,
        request_has_audio: a.requestEnrichment?.has_audio ?? null,
        request_has_video: a.requestEnrichment?.has_video ?? null,
        request_message_count: a.requestEnrichment?.message_count ?? null,
        request_system_prompt_length: a.requestEnrichment?.system_prompt_length ?? null,
        request_max_tokens: a.requestEnrichment?.max_tokens_requested ?? null,
        request_temperature: a.requestEnrichment?.temperature ?? null,
        request_top_p: a.requestEnrichment?.top_p ?? null,
        request_presence_penalty: a.requestEnrichment?.presence_penalty ?? null,
        request_frequency_penalty: a.requestEnrichment?.frequency_penalty ?? null,

        // ====================================================================
        // ROUTING & HEALTH CONTEXT (Flattened for queryability)
        // ====================================================================
        routing_candidates_count: a.routingContext?.candidates_count ?? null,
        routing_first_provider: a.routingContext?.first_provider ?? null,
        routing_attempts: a.routingContext?.attempts ?? null,
        routing_failed_providers: a.routingContext?.failed_providers ?? null,
        routing_failure_reasons: a.routingContext?.failure_reasons ?? null,
        routing_circuit_breaker_open: a.routingContext?.circuit_breaker_open ?? null,
        routing_was_probe: a.routingContext?.was_probe ?? null,
        routing_requested_params_count: a.routingContext?.requested_params_count ?? null,
        routing_requested_params: a.routingContext?.requested_params ?? null,
        routing_param_provider_count_before: a.routingContext?.param_provider_count_before ?? null,
        routing_param_provider_count_after: a.routingContext?.param_provider_count_after ?? null,
        routing_param_dropped_provider_count: a.routingContext?.param_dropped_provider_count ?? null,

        // ====================================================================
        // MISC
        // ====================================================================
        env: a.env ?? getBindings().NODE_ENV ?? null,
        api_version: a.apiVersion ?? null,
        extra_json: a.extraJson ?? null,

        // ingestion time will be set by Axiom automatically
    };
}

/** Send one event to Axiom (JSON ingestion) with tail sampling. */
export async function sendAxiomEvent(args: AxiomArgs) {
    // ============================================================================
    // TAIL SAMPLING (loggingsucks.com pattern)
    // ============================================================================
    // Tail Sampling %: 100% (adjust to reduce log volume if needed)
    const TAIL_SAMPLE_RATE = 1.0; // 1.0 = 100%, 0.05 = 5%, etc.

    // Always log these (regardless of sample rate):
    const alwaysLog = (
        !args.success ||                                    // All errors
        (args.statusCode && args.statusCode >= 500) ||      // All 5xx
        args.teamEnrichment?.tier === "enterprise" ||       // Enterprise customers
        (args.teamEnrichment?.spend_30d_usd ?? 0) > 100 ||  // High spenders ($100+/month)
        args.routingContext?.circuit_breaker_open ||        // Circuit breaker open
        (args.latencyMs && args.latencyMs > 10000)          // Very slow requests (>10s)
    );

    // Sample based on rate if not in "always log" category
    if (!alwaysLog && Math.random() > TAIL_SAMPLE_RATE) {
        return; // Skip this event (sampled out)
    }

    const bindings = getBindings();
    const dataset = args.dataset ?? bindings.AXIOM_DATASET;
    const token = args.token ?? bindings.AXIOM_API_KEY;

    if (!dataset || !token) {
        // Non-blocking by design: silently skip when Axiom is not configured.
        return;
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
            (error as any).code = "axiom_http_error";
            throw error;
        }
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            const timeoutError = new Error(`[ERROR Axiom] Request timeout for requestId ${args.requestId}`);
            (timeoutError as any).code = "axiom_timeout";
            throw timeoutError;
        }
        if (err instanceof Error) throw err;
        const wrapped = new Error(`[ERROR Axiom] Ingest error for requestId ${args.requestId}: ${String(err)}`);
        (wrapped as any).code = "axiom_ingest_error";
        throw wrapped;
    } finally {
        clearTimeout(timeoutId);
    }
}











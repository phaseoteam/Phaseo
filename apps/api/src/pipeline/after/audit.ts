// lib/gateway/after/audit.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Emits audit events for success/failure requests.

import { auditSuccess, auditFailure } from "../audit";
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { sanitizeForAxiom, sanitizeJsonStringForAxiom, stringifyForAxiom } from "@observability/privacy";
import { emitGatewayRequestEvent } from "@observability/events";
import { attachToolUsageMetrics, summarizeToolUsage } from "./tool-usage";

// ============================================================================
// REQUEST & ROUTING ENRICHMENT (Wide Event Context)
// ============================================================================

/**
 * Extract request enrichment from pipeline context
 * Following loggingsucks.com: capture business context for this request
 */
function extractRequestEnrichment(ctx: PipelineContext): any {
    try {
        const body: any = ctx.body ?? {};

        // Extract tools
        const tools = Array.isArray(body.tools) ? body.tools : [];
        const has_tools = tools.length > 0;
        const tool_count = tools.length;

        // Extract messages
        const messages: any[] = Array.isArray(body.messages) ? body.messages :
                                 Array.isArray(body.input) ? body.input :
                                 Array.isArray(body.input_items) ? body.input_items : [];
        const message_count = messages.length;

        // Count multimodal content
        let has_images = false;
        let has_audio = false;
        let has_video = false;
        let system_prompt_length = 0;

        for (const msg of messages) {
            if (!msg) continue;

            // System prompt
            if (msg.role === "system" && typeof msg.content === "string") {
                system_prompt_length += msg.content.length;
            }

            // Check multimodal content
            const content = msg.content;
            if (Array.isArray(content)) {
                for (const part of content) {
                    if (!part) continue;
                    if (part.type === "image_url" || part.type === "input_image") has_images = true;
                    if (part.type === "input_audio") has_audio = true;
                    if (part.type === "input_video") has_video = true;
                }
            }
        }

        return {
            has_tools,
            tool_count,
            has_images,
            has_audio,
            has_video,
            message_count,
            system_prompt_length: system_prompt_length > 0 ? system_prompt_length : null,
            max_tokens_requested: body.max_tokens ?? body.max_output_tokens ?? null,
            temperature: body.temperature ?? null,
            top_p: body.top_p ?? null,
            presence_penalty: body.presence_penalty ?? null,
            frequency_penalty: body.frequency_penalty ?? null,
        };
    } catch (err) {
        console.error("extractRequestEnrichment error", err);
        return null;
    }
}

/**
 * Extract routing context from pipeline context
 * Flattens routing decisions for queryability
 */
function extractRoutingContext(ctx: PipelineContext, result?: RequestResult): any {
    try {
        const candidates = ctx.providers ?? [];
        const paramDiagnostics = ctx.paramRoutingDiagnostics ?? null;
        const requestedParams = Array.isArray(ctx.requestedParams) ? ctx.requestedParams : [];
        const attemptErrors: any[] = Array.isArray((ctx as any).attemptErrors)
            ? (ctx as any).attemptErrors
            : [];
        const routingSnapshot: any[] = Array.isArray((ctx as any).routingSnapshot)
            ? (ctx as any).routingSnapshot
            : [];
        const now = Date.now();
        const attempts = attemptErrors.length || null;
        const failed_providers = attemptErrors
            .map((e: any) => e?.provider)
            .filter((value: unknown) => typeof value === "string");
        const failure_reasons = attemptErrors
            .map((e: any) => e?.reason ?? e?.type ?? null)
            .filter((value: unknown) => typeof value === "string");
        const circuitBreakerOpenFromSnapshot = routingSnapshot.some((entry: any) => {
            if (!entry || typeof entry !== "object") return false;
            if (entry.breaker !== "open") return false;
            return Number(entry.breaker_until_ms ?? 0) > now;
        });
        const circuitBreakerBlocked = attemptErrors.some(
            (e: any) => (e?.type ?? e?.reason) === "blocked",
        );
        const healthContext = (result as any)?.healthContext;

        return {
            candidates_count: candidates.length,
            first_provider: result?.provider ?? candidates[0]?.providerId ?? null,
            attempts,
            failed_providers: failed_providers.length > 0 ? failed_providers : null,
            failure_reasons: failure_reasons.length > 0 ? failure_reasons : null,
            circuit_breaker_open: circuitBreakerOpenFromSnapshot || circuitBreakerBlocked,
            was_probe: Boolean(healthContext?.isProbe),
            requested_params_count: requestedParams.length || null,
            requested_params: requestedParams.length ? requestedParams : null,
            param_provider_count_before: paramDiagnostics?.providerCountBefore ?? null,
            param_provider_count_after: paramDiagnostics?.providerCountAfter ?? null,
            param_dropped_provider_count: paramDiagnostics?.droppedProviders?.length ?? null,
        };
    } catch (err) {
        console.error("extractRoutingContext error", err);
        return null;
    }
}

function buildTransformSnapshot(ctx: PipelineContext, result?: RequestResult) {
	const attemptErrors = Array.isArray((ctx as any).attemptErrors) ? (ctx as any).attemptErrors : null;
	const routingSnapshot = Array.isArray((ctx as any).routingSnapshot) ? (ctx as any).routingSnapshot : null;
	const requestedParams = Array.isArray(ctx.requestedParams) ? ctx.requestedParams : null;
	const paramRoutingDiagnostics = ctx.paramRoutingDiagnostics ? sanitizeForAxiom(ctx.paramRoutingDiagnostics) : null;
	const sanitizedGatewayRequest = sanitizeForAxiom(ctx.rawBody ?? ctx.body ?? null);
	const sanitizedUpstreamRequest = sanitizeJsonStringForAxiom(result?.mappedRequest ?? null);

	return {
		protocol: ctx.protocol ?? null,
		endpoint: ctx.endpoint,
		model: ctx.model,
		provider: result?.provider ?? null,
		stream: ctx.stream,
		request_surface_sanitized: sanitizedGatewayRequest,
		upstream_request_sanitized: sanitizedUpstreamRequest,
		upstream_request_present: Boolean(result?.mappedRequest),
		requested_params: requestedParams,
		param_routing_diagnostics: paramRoutingDiagnostics,
		attempt_errors: sanitizeForAxiom(attemptErrors),
		routing_snapshot: sanitizeForAxiom(routingSnapshot),
	};
}

export async function handleFailureAudit(
    ctx: PipelineContext,
    result: RequestResult,
    upstreamStatus: number,
    attribution: string,
    errorCode: string,
    errorMessage: string,
    errorDetails?: unknown
) {
    const beforeMs = (ctx as any)?.timing?.before?.total_ms ?? 0;
    const execMs = (ctx as any)?.timing?.execute?.total_ms ?? 0;
    const genMs = (ctx as any)?.timing?.execute?.adapter_ms ?? null;
    const internalLatencyMs = (ctx as any)?.timing?.internal_latency_ms ?? null;

    // Use meta values if available, otherwise fall back to timing calculations
    const generationMs = ctx.meta.generation_ms ?? (genMs ? Math.round(genMs) : null);
    const latencyMs = ctx.meta.latency_ms ?? Math.round(beforeMs + execMs);

    const extraJson = (() => {
        try {
            return stringifyForAxiom({
                stage: "execute",
                request: {
                    method: ctx.meta.requestMethod ?? null,
                    path: ctx.meta.requestPath ?? ctx.requestPath ?? null,
                    url: ctx.meta.requestUrl ?? null,
                    user_agent: ctx.meta.userAgent ?? null,
                    client_ip: ctx.meta.clientIp ?? null,
                    cf_ray: ctx.meta.cfRay ?? null,
                    edge: {
                        colo: ctx.meta.edgeColo ?? null,
                        city: ctx.meta.edgeCity ?? null,
                        country: ctx.meta.edgeCountry ?? null,
                        continent: ctx.meta.edgeContinent ?? null,
                        asn: ctx.meta.edgeAsn ?? null,
                    },
                },
                timing: (ctx as any)?.timing ?? null,
                providers: ctx.providers?.map((p) => ({
                    provider_id: p.providerId,
                    base_weight: p.baseWeight,
                    byok_keys: p.byokMeta?.length ?? 0,
                    has_pricing: Boolean(p.pricingCard),
                })),
                transform: buildTransformSnapshot(ctx, result),
                error_details: sanitizeForAxiom(errorDetails ?? null),
            });
        } catch {
            return null;
        }
    })();

    try {
        await auditFailure({
            stage: "execute",
            requestId: ctx.requestId,
            teamId: ctx.teamId,
            endpoint: ctx.endpoint,
            model: ctx.model,
            provider: result.provider ?? null,
            stream: ctx.stream,
            statusCode: upstreamStatus,
            errorCode: `${attribution}:${errorCode}`,
            errorMessage,
            latencyMs,
            generationMs,
            internalLatencyMs,
            byok: (result?.keySource ?? ctx.meta.keySource) === "byok",
            keyId: ctx.meta.apiKeyId,
            appTitle: ctx.meta.appTitle ?? null,
            referer: ctx.meta.referer ?? null,
            requestMethod: ctx.meta.requestMethod ?? null,
            requestPath: ctx.meta.requestPath ?? ctx.requestPath ?? null,
            requestUrl: ctx.meta.requestUrl ?? null,
            userAgent: ctx.meta.userAgent ?? null,
            clientIp: ctx.meta.clientIp ?? null,
            cfRay: ctx.meta.cfRay ?? null,
            edgeColo: ctx.meta.edgeColo ?? null,
            edgeCity: ctx.meta.edgeCity ?? null,
            edgeCountry: ctx.meta.edgeCountry ?? null,
            edgeContinent: ctx.meta.edgeContinent ?? null,
            edgeAsn: ctx.meta.edgeAsn ?? null,
            extraJson,
        });
        await emitGatewayRequestEvent({
            ctx,
            result,
            statusCode: upstreamStatus,
            success: false,
            errorCode: `${attribution}:${errorCode}`,
            errorMessage,
            errorStage: "execute",
            internalReason: errorCode,
            mappedRequest: result.mappedRequest ?? null,
            errorDetails,
        });
    } catch (auditErr) {
        console.error("auditFailure failed", auditErr);
    }
}

export async function handleSuccessAudit(
    ctx: PipelineContext,
    result: RequestResult,
    isStream: boolean,
    usagePriced: any,
    totalCents: number,
    totalNanos: number,
    currency: string,
    finishReason: string | null,
    statusCode: number,
    nativeResponseId?: string | null
) {
    const byok = (result?.keySource ?? ctx.meta.keySource) === "byok";
    const execTiming = (ctx as any)?.timing?.execute ?? {};
    const internalLatencyMs = (ctx as any)?.timing?.internal_latency_ms ?? null;

    // Use meta values if available, otherwise fall back to timing calculations
    const generationMs = ctx.meta.generation_ms ?? Math.round(execTiming?.adapter_ms ?? result.generationTimeMs ?? 0);
    const latencyMs = ctx.meta.latency_ms ?? (isStream
        ? Math.round(execTiming?.total_ms ?? 0) + Math.round((ctx as any)?.timing?.before?.total_ms ?? 0)
        : Math.round(execTiming?.total_ms ?? generationMs));

    // Enrich usage with multimodal signals visible at the gateway layer (e.g., image/audio/video inputs).
    const usageWithMultimodal = enrichUsageWithMultimodal(ctx, result, usagePriced);

    // Calculate throughput (tokens/sec) using output tokens only to reflect generation speed.
    if (ctx.meta.throughput_tps === undefined && generationMs > 0) {
        const usage = usageWithMultimodal ?? {};
        const tokensOut = Number(usage.output_tokens ?? usage.output_text_tokens ?? usage.completion_tokens ?? 0);
        ctx.meta.throughput_tps = tokensOut / (generationMs / 1000);
    }

    // console.log("[DEBUG handleSuccessAudit] Calling auditSuccess with:", {
    //     usagePriced: usageWithMultimodal,
    //     totalCents,
    //     totalNanos,
    //     currency,
    //     throughput: ctx.meta.throughput_tps,
    //     keyId: ctx.meta.apiKeyId,
    //     nativeResponseId: nativeResponseId ?? null,
    // });

    const extraJson = (() => {
        try {
            return stringifyForAxiom({
                stage: "execute",
                request: {
                    method: ctx.meta.requestMethod ?? null,
                    path: ctx.meta.requestPath ?? ctx.requestPath ?? null,
                    url: ctx.meta.requestUrl ?? null,
                    user_agent: ctx.meta.userAgent ?? null,
                    client_ip: ctx.meta.clientIp ?? null,
                    cf_ray: ctx.meta.cfRay ?? null,
                    edge: {
                        colo: ctx.meta.edgeColo ?? null,
                        city: ctx.meta.edgeCity ?? null,
                        country: ctx.meta.edgeCountry ?? null,
                        continent: ctx.meta.edgeContinent ?? null,
                        asn: ctx.meta.edgeAsn ?? null,
                    },
                },
                timing: (ctx as any)?.timing ?? null,
                providers: ctx.providers?.map((p) => ({
                    provider_id: p.providerId,
                    base_weight: p.baseWeight,
                    byok_keys: p.byokMeta?.length ?? 0,
                    has_pricing: Boolean(p.pricingCard),
                })),
                gating: ctx.gating ?? null,
                transform: buildTransformSnapshot(ctx, result),
            });
        } catch {
            return null;
        }
    })();

    // Extract enrichment data for wide event logging
    const requestEnrichment = extractRequestEnrichment(ctx);
    const routingContext = extractRoutingContext(ctx, result);

    try {
        console.log(`[audit] storing model_id="${ctx.model}" requestId=${ctx.requestId}`);
        await auditSuccess({
            requestId: ctx.requestId,
            teamId: ctx.teamId,
            provider: result.provider,
            model: ctx.model,
            endpoint: ctx.endpoint,
            stream: isStream,
            byok,
            nativeResponseId: nativeResponseId ?? null,
            appTitle: ctx.meta.appTitle ?? null,
            referer: ctx.meta.referer ?? null,
            requestMethod: ctx.meta.requestMethod ?? null,
            requestPath: ctx.meta.requestPath ?? ctx.requestPath ?? null,
            requestUrl: ctx.meta.requestUrl ?? null,
            userAgent: ctx.meta.userAgent ?? null,
            clientIp: ctx.meta.clientIp ?? null,
            cfRay: ctx.meta.cfRay ?? null,
            edgeColo: ctx.meta.edgeColo ?? null,
            edgeCity: ctx.meta.edgeCity ?? null,
            edgeCountry: ctx.meta.edgeCountry ?? null,
            edgeContinent: ctx.meta.edgeContinent ?? null,
            edgeAsn: ctx.meta.edgeAsn ?? null,
            generationMs,
            latencyMs,
            internalLatencyMs,
            usagePriced: usageWithMultimodal,
            totalCents,
            totalNanos,
            currency,
            finishReason,
            statusCode,
            throughput: ctx.meta.throughput_tps ?? null,
            keyId: ctx.meta.apiKeyId ?? ctx.keyId ?? null,
            extraJson,
            // Wide event enrichment
            teamEnrichment: ctx.teamEnrichment ?? null,
            keyEnrichment: ctx.keyEnrichment ?? null,
            requestEnrichment,
            routingContext,
        });
    } catch (auditErr) {
        console.error("auditSuccess failed", auditErr);
    }
}

function enrichUsageWithMultimodal(ctx: PipelineContext, result: RequestResult, usagePriced: any): any {
    try {
        let base = usagePriced && typeof usagePriced === "object" ? { ...usagePriced } : {};
        base = attachToolUsageMetrics(
            base,
            summarizeToolUsage({
                body: ctx.body,
                ir: result.ir,
                payload: result.rawResponse,
            }),
        );

        if (ctx.endpoint === "chat.completions") {
            const body: any = ctx.body ?? {};
            const messages: any[] = Array.isArray(body.messages) ? body.messages : [];

            let inputImages = 0;
            let inputAudio = 0;
            let inputVideo = 0;

            for (const msg of messages) {
                const content = (msg && msg.content) as any;
                if (!content) continue;

                if (Array.isArray(content)) {
                    for (const part of content) {
                        if (!part) continue;
                        switch (part.type) {
                            case "image_url":
                                inputImages += 1;
                                break;
                            case "input_audio":
                                inputAudio += 1;
                                break;
                            case "input_video":
                                inputVideo += 1;
                                break;
                            default:
                                break;
                        }
                    }
                }
            }

            if (inputImages > 0 && base.input_image_count == null) base.input_image_count = inputImages;
            if (inputAudio > 0 && base.input_audio_count == null) base.input_audio_count = inputAudio;
            if (inputVideo > 0 && base.input_video_count == null) base.input_video_count = inputVideo;
        }

        if (ctx.endpoint === "responses") {
            const body: any = ctx.body ?? {};
            const items: any[] = Array.isArray(body.input) ? body.input : (Array.isArray(body.input_items) ? body.input_items : []);
            let inputImages = 0;
            let inputAudio = 0;
            let inputVideo = 0;

            const inspectContent = (content: any) => {
                if (!content) return;
                if (Array.isArray(content)) {
                    for (const part of content) inspectContent(part);
                    return;
                }
                switch (content.type) {
                    case "input_image":
                    case "image_url":
                        inputImages += 1;
                        break;
                    case "input_audio":
                        inputAudio += 1;
                        break;
                    case "input_video":
                        inputVideo += 1;
                        break;
                    case "message":
                        inspectContent((content as any).content);
                        break;
                    default:
                        break;
                }
            };

            for (const item of items) {
                inspectContent(item);
                if (item && Array.isArray((item as any).content)) {
                    inspectContent((item as any).content);
                }
            }

            if (inputImages > 0 && base.input_image_count == null) base.input_image_count = inputImages;
            if (inputAudio > 0 && base.input_audio_count == null) base.input_audio_count = inputAudio;
            if (inputVideo > 0 && base.input_video_count == null) base.input_video_count = inputVideo;
        }

        return base;
    } catch (err) {
        console.error("enrichUsageWithMultimodal error", err);
        return usagePriced;
    }
}











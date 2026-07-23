// lib/gateway/after/audit.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Emits audit events for success/failure requests.

import { auditSuccess, auditFailure } from "../audit";
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { sanitizeForAxiom, sanitizeJsonStringForAxiom, stringifyForAxiom } from "@observability/privacy";
import { sanitizeUrlForLogging } from "@/lib/security/sanitizeUrl";
import { emitGatewayRequestEvent } from "@observability/events";
import { emitGatewayTelemetryDeliveryFailure } from "@observability/axiom";
import { runGatewayTelemetryPipelines } from "@observability/gateway-telemetry";
import { attachToolUsageMetrics, summarizeToolUsage } from "./tool-usage";
import { extractSearchObservability } from "./search-observability";
import { mergeWebFetchObservability } from "./fetch-observability";
import {
	resolveBeforeLatencyMs,
	resolveExecuteTotalLatencyMs,
	resolveNonStreamLatencyMs,
} from "./timing";

function getProviderAttempts(ctx: PipelineContext): Array<Record<string, unknown>> {
    return Array.isArray(ctx.providerAttempts) ? ctx.providerAttempts : [];
}

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
        const providerAttempts = getProviderAttempts(ctx);
        const attemptErrors: any[] = Array.isArray((ctx as any).attemptErrors)
            ? (ctx as any).attemptErrors
            : [];
        const routingSnapshot: any[] = Array.isArray((ctx as any).routingSnapshot)
            ? (ctx as any).routingSnapshot
            : [];
        const now = Date.now();
        const attempts = providerAttempts.length || attemptErrors.length || null;
        const failedAttempts = providerAttempts.filter(
            (entry: any) => entry?.outcome !== "success",
        );
        const failed_providers = (failedAttempts.length > 0 ? failedAttempts : attemptErrors)
            .map((e: any) => e?.provider)
            .filter((value: unknown) => typeof value === "string");
        const failure_reasons = (failedAttempts.length > 0 ? failedAttempts : attemptErrors)
            .map((e: any) => e?.outcome ?? e?.reason ?? e?.type ?? null)
            .filter((value: unknown) => typeof value === "string");
        const circuitBreakerOpenFromSnapshot = routingSnapshot.some((entry: any) => {
            if (!entry || typeof entry !== "object") return false;
            if (entry.breaker !== "open") return false;
            return Number(entry.breaker_until_ms ?? 0) > now;
        });
        const circuitBreakerBlocked = (providerAttempts.length > 0 ? providerAttempts : attemptErrors).some(
            (e: any) => (e?.outcome ?? e?.type ?? e?.reason) === "blocked",
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
            response_cache_status: ctx.responseCache?.status ?? null,
            response_cache_key: ctx.responseCache?.key ?? null,
            response_cache_ttl_seconds: ctx.responseCache?.ttlSeconds ?? null,
            response_cache_provider: ctx.responseCache?.providerId ?? null,
        };
    } catch (err) {
        console.error("extractRoutingContext error", err);
        return null;
    }
}

type BuildTransformSnapshotOptions = {
	gatewayResponse?: unknown;
	providerResponse?: unknown;
	errorDetails?: unknown;
};

function headersToRecord(headers: Headers | null | undefined): Record<string, string> | null {
	if (!headers) return null;
	const out: Record<string, string> = {};
	let count = 0;
	for (const [key, value] of headers.entries()) {
		if (!key) continue;
		out[key] = value;
		count += 1;
		if (count >= 128) break;
	}
	return Object.keys(out).length > 0 ? out : null;
}

function buildTransformSnapshot(
	ctx: PipelineContext,
	result?: RequestResult,
	options?: BuildTransformSnapshotOptions,
) {
	const attemptErrors = Array.isArray((ctx as any).attemptErrors) ? (ctx as any).attemptErrors : null;
	const providerAttempts = Array.isArray(ctx.providerAttempts) ? ctx.providerAttempts : null;
	const routingSnapshot = Array.isArray((ctx as any).routingSnapshot) ? (ctx as any).routingSnapshot : null;
	const routingDiagnostics = (ctx as any).routingDiagnostics ?? null;
	const requestedParams = Array.isArray(ctx.requestedParams) ? ctx.requestedParams : null;
	const pluginExecutions = Array.isArray(ctx.pluginExecutions) ? ctx.pluginExecutions : null;
	const paramRoutingDiagnostics = ctx.paramRoutingDiagnostics ? sanitizeForAxiom(ctx.paramRoutingDiagnostics) : null;
	const providerEnablementDiagnostics = ctx.providerEnablementDiagnostics
		? sanitizeForAxiom(ctx.providerEnablementDiagnostics)
		: null;
	const providerCandidateBuildDiagnostics = ctx.providerCandidateBuildDiagnostics
		? sanitizeForAxiom(ctx.providerCandidateBuildDiagnostics)
		: null;
	const sanitizedGatewayRequest = sanitizeForAxiom(ctx.rawBody ?? ctx.body ?? null);
	const sanitizedUpstreamRequest = sanitizeJsonStringForAxiom(result?.mappedRequest ?? null);
	const sanitizedGatewayResponse = sanitizeForAxiom(options?.gatewayResponse ?? null);
	const sanitizedProviderResponse = sanitizeForAxiom(options?.providerResponse ?? result?.rawResponse ?? null);
	const sanitizedProviderHeaders = sanitizeForAxiom(headersToRecord(result?.upstream?.headers));
	const sanitizedErrorDetails = sanitizeForAxiom(options?.errorDetails ?? null);
	const searchObservability = sanitizeForAxiom(
		extractSearchObservability({
			body: ctx.body,
			gatewayResponse: options?.gatewayResponse ?? null,
			providerResponse: options?.providerResponse ?? result?.rawResponse ?? null,
			managedSearch: ctx.searchObservability ?? null,
		}),
	);
	const webFetchObservability = sanitizeForAxiom(
		mergeWebFetchObservability(ctx.webFetchObservability ?? null),
	);

	return {
		protocol: ctx.protocol ?? null,
		endpoint: ctx.endpoint,
		model: ctx.model,
		provider: result?.provider ?? null,
		stream: ctx.stream,
		request_surface_sanitized: sanitizedGatewayRequest,
		upstream_request_sanitized: sanitizedUpstreamRequest,
		upstream_request_present: Boolean(result?.mappedRequest),
		gateway_response_sanitized: sanitizedGatewayResponse,
		gateway_response_present: options?.gatewayResponse != null,
		upstream_response_sanitized: sanitizedProviderResponse,
		upstream_response_present: (options?.providerResponse ?? result?.rawResponse) != null,
		upstream_response_headers: sanitizedProviderHeaders,
		upstream_status_code: result?.upstream?.status ?? null,
		upstream_status_text: result?.upstream?.statusText ?? null,
		upstream_url: sanitizeUrlForLogging(result?.upstream?.url),
		requested_params: requestedParams,
		plugin_executions: sanitizeForAxiom(pluginExecutions),
		param_routing_diagnostics: paramRoutingDiagnostics,
		provider_enablement_diagnostics: providerEnablementDiagnostics,
		provider_candidate_build_diagnostics: providerCandidateBuildDiagnostics,
		provider_attempts: sanitizeForAxiom(providerAttempts),
		attempt_errors: sanitizeForAxiom(attemptErrors),
		routing_snapshot: sanitizeForAxiom(routingSnapshot),
		routing_diagnostics: sanitizeForAxiom(routingDiagnostics),
		response_cache: sanitizeForAxiom(ctx.responseCache ?? null),
		search_observability: searchObservability,
		web_fetch_observability: webFetchObservability,
		error_details: sanitizedErrorDetails,
	};
}

function resolveExecuteAdapterMs(ctx: PipelineContext): number | null {
    const nested = (ctx as any)?.timing?.execute?.adapter_ms;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    const flat = (() => {
        const timing = (ctx as any)?.timing;
        if (!timing || typeof timing !== "object") return 0;
        const value = timing["adapter_roundtrip_ms"];
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
    })();
    return flat > 0 ? flat : null;
}

export function shouldPersistGatewayAudit(ctx: Pick<PipelineContext, "testingMode">): boolean {
	return !ctx.testingMode;
}

export async function handleFailureAudit(
    ctx: PipelineContext,
    result: RequestResult,
    upstreamStatus: number,
    attribution: string,
    errorCode: string,
    errorMessage: string,
    errorDetails?: unknown,
    gatewayErrorPayload?: Record<string, unknown> | null,
) {
    const beforeMs = resolveBeforeLatencyMs(ctx);
    const execMs = resolveExecuteTotalLatencyMs(ctx) ?? 0;
    const genMs = resolveExecuteAdapterMs(ctx);
    const internalLatencyMs = (ctx as any)?.timing?.internal_latency_ms ?? null;

    // Use meta values if available, otherwise fall back to timing calculations
	const generationMs = ctx.meta.generation_ms ?? null;
    const latencyMs = resolveNonStreamLatencyMs(ctx, generationMs);
    const gatewayFailurePayload = {
        generation_id: ctx.requestId,
        status_code: upstreamStatus,
        error: errorCode,
        description: errorMessage,
    };

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
                transform: buildTransformSnapshot(ctx, result, {
                    gatewayResponse: gatewayFailurePayload,
                    providerResponse: errorDetails ?? result.rawResponse ?? null,
                    errorDetails,
                }),
                error_details: sanitizeForAxiom(errorDetails ?? null),
                gateway_response_sanitized: sanitizeForAxiom(gatewayFailurePayload),
            });
        } catch {
            return null;
        }
    })();

    await runGatewayTelemetryPipelines({
        requestId: ctx.requestId,
        workspaceId: ctx.workspaceId,
        writeSupabase: shouldPersistGatewayAudit(ctx) ? () => auditFailure({
            stage: "execute",
            requestId: ctx.requestId,
            workspaceId: ctx.workspaceId,
            endpoint: ctx.endpoint,
            model: ctx.model,
            requestedModel: ctx.requestedModel ?? ctx.model,
            provider: result.provider ?? null,
            providerApiModelId: result.apiModelId ?? null,
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
            appId: ctx.meta.appId ?? null,
            appName: ctx.meta.appName ?? null,
            authMethod: ctx.meta.authMethod ?? "api_key",
            oauthClientId: ctx.meta.oauthClientId ?? null,
            oauthUserId: ctx.meta.oauthUserId ?? null,
            requestUserId: ctx.meta.requestUserId ?? null,
            sessionId: ctx.meta.sessionId ?? null,
            traceData: ctx.meta.trace ?? null,
            providerAttempts: Array.isArray(ctx.providerAttempts) ? ctx.providerAttempts : null,
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
            errorPayload:
                sanitizeForAxiom(gatewayErrorPayload ?? gatewayFailurePayload) as
                    | Record<string, unknown>
                    | null,
            extraJson,
            requestPayload: ctx.rawBody ?? ctx.body ?? null,
            gatewayResponse: gatewayErrorPayload ?? gatewayFailurePayload,
            providerRequest: result.mappedRequest ?? null,
            providerResponse: errorDetails ?? result.rawResponse ?? null,
            detailMetadata: {
                stage: "execute",
                routing_snapshot: sanitizeForAxiom((ctx as any).routingSnapshot ?? null),
                routing_diagnostics: sanitizeForAxiom((ctx as any).routingDiagnostics ?? null),
                provider_enablement_diagnostics: sanitizeForAxiom(
                    ctx.providerEnablementDiagnostics ?? null,
                ),
                provider_candidate_diagnostics: sanitizeForAxiom(
                    ctx.providerCandidateBuildDiagnostics ?? null,
                ),
                web_fetch_observability: sanitizeForAxiom(
                    mergeWebFetchObservability(ctx.webFetchObservability ?? null),
                ),
                replay_supported: true,
            },
            usage: (result.bill?.usage && typeof result.bill.usage === "object")
                ? result.bill.usage as Record<string, unknown>
                : {},
            currency: result.bill?.currency ?? null,
			pricingLines: Array.isArray((result.bill?.usage as any)?.pricing?.lines)
				? (result.bill?.usage as any).pricing.lines
				: [],
        }) : null,
        writeAxiom: () => emitGatewayRequestEvent({
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
            providerResponse: errorDetails ?? result.rawResponse ?? null,
            gatewayResponse: gatewayErrorPayload ?? gatewayFailurePayload,
        }),
        onDeliveryFailure: emitGatewayTelemetryDeliveryFailure,
    });
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
    nativeResponseId?: string | null,
    gatewayResponse?: unknown,
) {
    const byok = (result?.keySource ?? ctx.meta.keySource) === "byok";
    const execTiming = (ctx as any)?.timing?.execute ?? {};
    const beforeMs = resolveBeforeLatencyMs(ctx);
    const execTotalMs = resolveExecuteTotalLatencyMs(ctx) ?? 0;
    const execAdapterMs = resolveExecuteAdapterMs(ctx);
    const internalLatencyMs = (ctx as any)?.timing?.internal_latency_ms ?? null;
    const endToEndMs = typeof ctx.meta.end_to_end_ms === "number"
        ? ctx.meta.end_to_end_ms
        : null;

    // Use meta values if available, otherwise fall back to timing calculations
    const generationMs = ctx.meta.generation_ms ?? null;
    const latencyMs = isStream
        ? (ctx.meta.latency_ms ?? null)
        : resolveNonStreamLatencyMs(ctx, generationMs);

    // Enrich usage with multimodal signals visible at the gateway layer (e.g., image/audio/video inputs).
    const usageWithMultimodal = enrichUsageWithMultimodal(ctx, result, usagePriced);

    // Calculate throughput (tokens/sec) using output tokens only to reflect generation speed.
    if (ctx.meta.throughput_tps === undefined && typeof generationMs === "number" && generationMs > 0) {
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
                usage: sanitizeForAxiom(usageWithMultimodal ?? null),
                pricing: sanitizeForAxiom((usageWithMultimodal as any)?.pricing ?? null),
                transform: buildTransformSnapshot(ctx, result, {
                    gatewayResponse: gatewayResponse ?? null,
                    providerResponse: result.rawResponse ?? null,
                }),
            });
        } catch {
            return null;
        }
    })();

    // Extract enrichment data for wide event logging
    const requestEnrichment = extractRequestEnrichment(ctx);
    const routingContext = extractRoutingContext(ctx, result);
    const guardrailEnforcementPayload = ctx.guardrailEnforcement
        ? sanitizeForAxiom({
            guardrail_enforcement: ctx.guardrailEnforcement,
        })
        : null;
    const searchObservability = sanitizeForAxiom(
        extractSearchObservability({
            body: ctx.body,
            gatewayResponse: gatewayResponse ?? null,
            providerResponse: result.rawResponse ?? null,
            managedSearch: ctx.searchObservability ?? null,
        }),
    );
    const webFetchObservability = sanitizeForAxiom(
        mergeWebFetchObservability(ctx.webFetchObservability ?? null),
    );

    await runGatewayTelemetryPipelines({
        requestId: ctx.requestId,
        workspaceId: ctx.workspaceId,
        writeSupabase: shouldPersistGatewayAudit(ctx) ? () => auditSuccess({
            requestId: ctx.requestId,
            workspaceId: ctx.workspaceId,
            provider: result.provider,
            providerApiModelId: result.apiModelId ?? null,
            model: ctx.model,
            requestedModel: ctx.requestedModel ?? ctx.model,
            endpoint: ctx.endpoint,
            stream: isStream,
            byok,
            nativeResponseId: nativeResponseId ?? null,
            appTitle: ctx.meta.appTitle ?? null,
            referer: ctx.meta.referer ?? null,
            appId: ctx.meta.appId ?? null,
            appName: ctx.meta.appName ?? null,
            authMethod: ctx.meta.authMethod ?? "api_key",
            oauthClientId: ctx.meta.oauthClientId ?? null,
            oauthUserId: ctx.meta.oauthUserId ?? null,
            requestUserId: ctx.meta.requestUserId ?? null,
            sessionId: ctx.meta.sessionId ?? null,
            traceData: ctx.meta.trace ?? null,
            providerAttempts: Array.isArray(ctx.providerAttempts) ? ctx.providerAttempts : null,
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
            endToEndMs,
            usagePriced: usageWithMultimodal,
            totalCents,
            totalNanos,
            currency,
            finishReason,
            statusCode,
            throughput: ctx.meta.throughput_tps ?? null,
            downstreamDisconnected: ctx.meta.downstreamDisconnected === true,
            streamCancellationSupport: ctx.meta.streamCancellationSupport ?? "unknown",
            streamProviderBillingOnCancel: ctx.meta.streamProviderBillingOnCancel ?? "unknown",
            streamDisconnectAction: ctx.meta.streamDisconnectAction ?? "drain_upstream",
            keyId: ctx.meta.apiKeyId ?? ctx.keyId ?? null,
            extraJson,
            errorPayload: guardrailEnforcementPayload as Record<string, unknown> | null,
            requestPayload: ctx.rawBody ?? ctx.body ?? null,
            gatewayResponse: gatewayResponse ?? null,
            providerRequest: result.mappedRequest ?? null,
            providerResponse: result.rawResponse ?? null,
            detailMetadata: {
                stage: "execute",
                finish_reason: finishReason ?? null,
                plugin_executions: sanitizeForAxiom(ctx.pluginExecutions ?? null),
                routing_snapshot: sanitizeForAxiom((ctx as any).routingSnapshot ?? null),
                routing_diagnostics: sanitizeForAxiom((ctx as any).routingDiagnostics ?? null),
                response_cache: sanitizeForAxiom(ctx.responseCache ?? null),
                provider_enablement_diagnostics: sanitizeForAxiom(
                    ctx.providerEnablementDiagnostics ?? null,
                ),
                provider_candidate_diagnostics: sanitizeForAxiom(
                    ctx.providerCandidateBuildDiagnostics ?? null,
                ),
                search_observability: searchObservability,
                web_fetch_observability: webFetchObservability,
                replay_supported: true,
                guardrail_enforcement_present: Boolean(ctx.guardrailEnforcement),
            },
            // Wide event enrichment
            teamEnrichment: ctx.teamEnrichment ?? null,
            keyEnrichment: ctx.keyEnrichment ?? null,
            requestEnrichment,
            routingContext,
        }) : null,
        writeAxiom: () => emitGatewayRequestEvent({
            ctx,
            result,
            statusCode,
            success: true,
            finishReason,
            usage: usageWithMultimodal ?? null,
            pricing: {
                total_cents: totalCents,
                total_nanos: totalNanos,
                currency,
            },
            mappedRequest: result.mappedRequest ?? null,
            providerResponse: result.rawResponse ?? null,
            gatewayResponse: gatewayResponse ?? null,
        }),
        onDeliveryFailure: emitGatewayTelemetryDeliveryFailure,
    });
}

function enrichUsageWithMultimodal(ctx: PipelineContext, result: RequestResult, usagePriced: any): any {
    try {
        let base = usagePriced && typeof usagePriced === "object" ? { ...usagePriced } : {};
        const inputDetails = base.input_tokens_details && typeof base.input_tokens_details === "object"
            ? { ...base.input_tokens_details }
            : {};
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

            if (inputImages > 0 && inputDetails.input_images == null) inputDetails.input_images = inputImages;
            if (inputAudio > 0 && inputDetails.input_audio == null) inputDetails.input_audio = inputAudio;
            if (inputVideo > 0 && inputDetails.input_videos == null) inputDetails.input_videos = inputVideo;
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

            if (inputImages > 0 && inputDetails.input_images == null) inputDetails.input_images = inputImages;
            if (inputAudio > 0 && inputDetails.input_audio == null) inputDetails.input_audio = inputAudio;
            if (inputVideo > 0 && inputDetails.input_videos == null) inputDetails.input_videos = inputVideo;
        }

        if (Object.keys(inputDetails).length > 0) {
            base.input_tokens_details = inputDetails;
        }

        return base;
    } catch (err) {
        console.error("enrichUsageWithMultimodal error", err);
        return usagePriced;
    }
}











// file: lib/gateway/execute/index.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Ranks candidates, attempts providers with failover, and records timing/usage.

import type { GatewayResponsePayload } from "@core/types";
import type { PipelineContext } from "../before/types";
import { Timer } from "../telemetry/timer";

export type PipelineTiming = {
	timer: Timer;
	internal: {
		adapterMarked: boolean;
	};
};

import { guardCandidates, guardPricingFound, guardAllFailed } from "./guards";
import { err } from "./http";
import { getBaseModel, calculateMaxTries } from "./utils";
import { rankProviders } from "./providers";
import { resolveProviderExecutor } from "../../executors";
import { admitThroughBreaker, onCallEnd, onCallStart, maybeOpenOnRecentErrors, reportProbeResult } from "./health";
import { logDebugEvent, previewValue, parseJsonLoose } from "../debug";

export type Bill = {
	cost_cents: number;
	currency: string;
	usage?: Record<string, any>;
	upstream_id?: string | null;
	finish_reason?: string | null;
};

// NOTE: Legacy RequestResult removed. Use IRRequestResult everywhere.

// ============================================================================
// IR-AWARE EXECUTION (NEW)
// ============================================================================

import type {
	IRChatRequest,
	IRChatResponse,
	IREmbeddingsRequest,
	IREmbeddingsResponse,
	IRImageGenerationRequest,
	IRImageGenerationResponse,
	IRAudioSpeechRequest,
	IRAudioSpeechResponse,
	IRAudioTranscriptionRequest,
	IRAudioTranscriptionResponse,
	IRAudioTranslationRequest,
	IRAudioTranslationResponse,
	IRModerationsRequest,
	IRModerationsResponse,
	IROcrRequest,
	IROcrResponse,
	IRMusicGenerateRequest,
	IRMusicGenerateResponse,
	IRVideoGenerationRequest,
	IRVideoGenerationResponse,
} from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { normalizeIRForProvider } from "./normalize";
import { normalizeCapability } from "@/executors";
import { filterCandidatesByModalities } from "./modalities";

function shouldFallbackFromByok(status: number | null | undefined): boolean {
	const code = Number(status ?? 0);
	if (!Number.isFinite(code)) return false;
	if (code === 401 || code === 403 || code === 408 || code === 429) return true;
	return code >= 500;
}

const ATTEMPT_PREVIEW_LIMIT = 320;

function truncateAttemptText(value: unknown, limit = ATTEMPT_PREVIEW_LIMIT): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= limit) return trimmed;
	return `${trimmed.slice(0, limit)}...[truncated ${trimmed.length - limit} chars]`;
}

function extractUpstreamErrorSummary(payload: unknown): {
	upstream_error_code: string | null;
	upstream_error_type: string | null;
	upstream_error_message: string | null;
	upstream_error_description: string | null;
} {
	if (!payload || typeof payload !== "object") {
		return {
			upstream_error_code: null,
			upstream_error_type: null,
			upstream_error_message: null,
			upstream_error_description: null,
		};
	}

	const obj = payload as Record<string, unknown>;
	const innerError =
		obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null;
	const fallbackCode =
		typeof obj.error === "string"
			? obj.error
			: typeof obj.code === "string"
				? obj.code
				: typeof obj.error_code === "string"
					? obj.error_code
					: null;
	const fallbackType =
		typeof obj.error_type === "string"
			? obj.error_type
			: typeof obj.type === "string"
				? obj.type
				: null;
	const fallbackMessage = truncateAttemptText(
		typeof obj.message === "string" ? obj.message : null,
	);
	const fallbackDescription = truncateAttemptText(
		typeof obj.description === "string" ? obj.description : null,
	);

	return {
		upstream_error_code:
			typeof innerError?.code === "string"
				? innerError.code
				: typeof innerError?.type === "string"
					? innerError.type
					: fallbackCode,
		upstream_error_type:
			typeof innerError?.type === "string" ? innerError.type : fallbackType,
		upstream_error_message:
			truncateAttemptText(
				typeof innerError?.message === "string" ? innerError.message : null,
			) ?? fallbackMessage,
		upstream_error_description:
			truncateAttemptText(
				typeof innerError?.description === "string" ? innerError.description : null,
			) ?? fallbackDescription,
	};
}

async function readUpstreamFailurePayload(result: {
	upstream: Response;
	rawResponse?: unknown;
}): Promise<{ payload: unknown; payload_preview: string | null }> {
	if (result.rawResponse !== undefined) {
		const rawPreview = truncateAttemptText(
			typeof result.rawResponse === "string"
				? result.rawResponse
				: JSON.stringify(result.rawResponse),
		);
		return { payload: result.rawResponse, payload_preview: rawPreview };
	}

	try {
		const clone = result.upstream.clone();
		const text = await clone.text();
		if (!text) {
			return { payload: null, payload_preview: null };
		}
		try {
			const parsed = JSON.parse(text);
			return {
				payload: parsed,
				payload_preview: truncateAttemptText(JSON.stringify(parsed)),
			};
		} catch {
			return { payload: text, payload_preview: truncateAttemptText(text) };
		}
	} catch {
		return { payload: null, payload_preview: null };
	}
}

/**
 * IR-aware request result
 * Similar to RequestResult but works with IR
 */
export type IRRequestResult = {
	kind: "completed" | "stream";
	ir?:
		| IRChatResponse
		| IREmbeddingsResponse
		| IRModerationsResponse
		| IRImageGenerationResponse
		| IRAudioSpeechResponse
		| IRAudioTranscriptionResponse
		| IRAudioTranslationResponse
		| IRVideoGenerationResponse
		| IROcrResponse
		| IRMusicGenerateResponse; // IR response (for completed requests)
	normalized?: GatewayResponsePayload;
	upstream: Response;
	stream?: ReadableStream<Uint8Array> | null;
	usageFinalizer?: (() => Promise<Bill | null>) | null;
	provider: string;
	generationTimeMs: number;
	bill: Bill;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	mappedRequest?: string;
	rawResponse?: any;
};

export type RequestResult = IRRequestResult;

/**
 * Execute request using IR pipeline
 * @param ctx - Pipeline context
 * @param ir - IR chat request
 * @param timing - Timing tracker
 * @returns IR request result or error response
 */
export async function doRequestWithIR(
	ctx: PipelineContext,
	ir:
		| IRChatRequest
		| IREmbeddingsRequest
		| IRModerationsRequest
		| IRImageGenerationRequest
		| IRAudioSpeechRequest
		| IRAudioTranscriptionRequest
		| IRAudioTranslationRequest
		| IRVideoGenerationRequest
		| IROcrRequest
		| IRMusicGenerateRequest,
	timing: PipelineTiming,
): Promise<Response | { ok: true; result: IRRequestResult }> {
	const baseModel = getBaseModel(ctx.model);

	// 1) Guard: Check candidates exist
	const candidatesGuard = await guardCandidates(ctx, timing);
	if (!candidatesGuard.ok) return (candidatesGuard as { ok: false; response: Response }).response;
	let candidates = candidatesGuard.value;

	// 1.5) Filter providers by requested input/output modalities (text.generate only)
	const normalizedCapability = normalizeCapability(ctx.capability);
	if (normalizedCapability === "text.generate") {
		const filtered = filterCandidatesByModalities(candidates, ir as IRChatRequest);
		if (!filtered.length) {
			return err("unsupported_modalities", {
				model: ctx.model,
				endpoint: ctx.endpoint,
				request_id: ctx.requestId,
				reason: "unsupported_modalities",
			});
		}
		candidates = filtered;
	}

	// 1.6) Guard: Ensure at least one provider has pricing configured
	const anyPricingAvailable = candidates.some((entry) => Boolean(entry.pricingCard));
	if (!anyPricingAvailable) {
		const pricingGuard = await guardPricingFound(false, ctx, timing);
		if (!pricingGuard.ok) return (pricingGuard as { ok: false; response: Response }).response;
	}

	// 2) Rank providers (health-aware)
	const ranked = await rankProviders(candidates, ctx);

	// 3) Try providers in order (failover up to 5)
	const maxTries = calculateMaxTries(ranked.length);
	let anyPricingFound = anyPricingAvailable;

	for (let attempt = 0; attempt < maxTries; attempt++) {
		const choice = ranked[attempt];

		// Use IR-aware attempt function
		const result = await attemptProviderWithIR(choice, ctx, ir, timing, baseModel);

		if (result.ok) {
			return result;
		}

		if ("skip" in result && result.skip === "no_pricing") {
			continue;
		}

		if ("skip" in result && result.skip === "blocked") {
			continue;
		}

		anyPricingFound = true;
	}

	// 4) Guard: Check if any pricing was found
	const pricingGuard = await guardPricingFound(anyPricingFound, ctx, timing);
	if (!pricingGuard.ok) return (pricingGuard as { ok: false; response: Response }).response;

	// 5) All providers failed
	const failureGuard = await guardAllFailed(ctx, timing);
	return (failureGuard as { ok: false; response: Response }).response;
}

/**
 * Attempt to execute IR request with a specific provider
 * Execute a single provider attempt for IR requests
 */
async function attemptProviderWithIR(
	routed: any, // RoutedCandidate type
	ctx: PipelineContext,
	ir:
		| IRChatRequest
		| IREmbeddingsRequest
		| IRModerationsRequest
		| IRImageGenerationRequest
		| IRAudioSpeechRequest
		| IRAudioTranscriptionRequest
		| IRAudioTranslationRequest
		| IRVideoGenerationRequest
		| IROcrRequest
		| IRMusicGenerateRequest,
	timing: PipelineTiming,
	baseModel: string,
): Promise<{ ok: true; result: IRRequestResult } | { ok: false; skip?: string }> {
	const attemptErrors: Array<Record<string, unknown>> = ((ctx as any).attemptErrors ??= []);

	// Extract candidate from RoutedCandidate
	const candidate = routed.candidate;

	const admission = await admitThroughBreaker(
		ctx.endpoint,
		candidate.providerId,
		baseModel,
		ctx.teamId,
		ctx.requestId,
		routed.health,
	);
	if (admission === "blocked") {
		attemptErrors.push({
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			type: "blocked",
		});
		return { ok: false, skip: "blocked" };
	}
	const isProbe = admission === "probe";
	const allowByokFallback = ctx.teamSettings?.byokFallbackEnabled !== false;
	const byokAlwaysUse = Array.isArray(candidate.byokMeta)
		? candidate.byokMeta.some((meta) => meta?.alwaysUse === true)
		: false;
	const providerModelSlug = typeof candidate.providerModelSlug === "string"
		? candidate.providerModelSlug.trim()
		: candidate.providerModelSlug;

	// Get pricing card
	const pricingCard = candidate.pricingCard;
	if (!pricingCard) {
		attemptErrors.push({
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			type: "no_pricing",
		});
		return { ok: false, skip: "no_pricing" };
	}

	// Execute using provider-capability executor
	let t0 = performance.now();
	try {
		timing.timer.mark("adapter_start");
		if (!timing.internal.adapterMarked) {
			timing.timer.between("internal_latency_ms", "request_start", "adapter_start");
			timing.internal.adapterMarked = true;
		}
		await onCallStart(ctx.endpoint, candidate.providerId, baseModel);
		t0 = performance.now();

		ctx.meta.upstreamStartMs = Date.now();
		const executor = resolveProviderExecutor(candidate.providerId, ctx.capability);
		if (!executor) {
			attemptErrors.push({
				provider: candidate.providerId,
				endpoint: ctx.endpoint,
				type: "unsupported_executor",
			});
			return { ok: false, skip: "unsupported_executor" };
		}

		const normalizedCapability = normalizeCapability(ctx.capability);
		const isTextGenerate = normalizedCapability === "text.generate";

		const normalizedIr = isTextGenerate
			? normalizeIRForProvider(
				ir as IRChatRequest,
				candidate.providerId,
				ctx.protocol as any,
				{
					capabilityParams: candidate.capabilityParams,
					providerMaxOutputTokens: candidate.maxOutputTokens,
					modelForReasoning: providerModelSlug ?? baseModel,
				},
			)
			: ir;
		const buildExecutorArgs = (forceGatewayKey: boolean, byokMeta: any[]) =>
			({
				ir: normalizedIr,
				requestId: ctx.requestId,
				teamId: ctx.teamId,
				providerId: candidate.providerId,
				endpoint: ctx.endpoint,
				protocol: ctx.protocol as any,
				capability: ctx.capability,
				providerModelSlug,
				capabilityParams: candidate.capabilityParams,
				maxInputTokens: candidate.maxInputTokens,
				maxOutputTokens: candidate.maxOutputTokens,
				byokMeta,
				pricingCard,
				meta: {
					debug: ctx.meta.debug,
					returnMeta: ctx.meta.returnMeta,
					echoUpstreamRequest: Boolean(ctx.meta.debug?.return_upstream_request),
					returnUpstreamRequest: Boolean(ctx.meta.debug?.return_upstream_request),
					returnUpstreamResponse: Boolean(ctx.meta.debug?.return_upstream_response),
					upstreamStartMs: ctx.meta.upstreamStartMs, // Pass timing to executor
					forceGatewayKey,
				},
			}) as ExecutorExecuteArgs;

		let executorResult = await executor(buildExecutorArgs(false, candidate.byokMeta || []));

		if (
			allowByokFallback &&
			!byokAlwaysUse &&
			executorResult.keySource === "byok" &&
			!executorResult.upstream.ok &&
			shouldFallbackFromByok(executorResult.upstream.status)
		) {
			(executorResult as any).fallbackAttempted = true;
			executorResult = await executor(buildExecutorArgs(true, []));
		}

		if (executorResult.timing) {
			if (typeof executorResult.timing.latencyMs === "number") {
				ctx.meta.latency_ms = executorResult.timing.latencyMs;
			}
			if (typeof executorResult.timing.generationMs === "number") {
				ctx.meta.generation_ms = executorResult.timing.generationMs;
			}
		}
		timing.timer.end("adapter_start");
		const generationTimeMs = Math.round(performance.now() - t0);

		const endToEndMs = Math.round(timing.timer.elapsed("request_start"));
		const usageForMetrics = executorResult.kind === "completed"
			? (executorResult.ir as any)?.usage
			: null;
		const tokensIn = usageForMetrics
			? Number(
				usageForMetrics.inputTokens ??
					usageForMetrics.input_tokens ??
					usageForMetrics.promptTokens ??
					usageForMetrics.prompt_tokens ??
					usageForMetrics.embeddingTokens ??
					0
			)
			: 0;
		const tokensOut = usageForMetrics
			? Number(
				usageForMetrics.outputTokens ??
					usageForMetrics.output_tokens ??
					usageForMetrics.completionTokens ??
					usageForMetrics.completion_tokens ??
					0
			)
			: 0;

		if (executorResult.kind === "completed") {
			await onCallEnd(ctx.endpoint, {
				provider: candidate.providerId,
				model: baseModel,
				ok: executorResult.upstream.ok,
				latency_ms: endToEndMs,
				generation_ms: ctx.meta.generation_ms ?? generationTimeMs,
				tokens_in: tokensIn,
				tokens_out: tokensOut,
			});
			if (isProbe) {
				await reportProbeResult(ctx.endpoint, candidate.providerId, baseModel, executorResult.upstream.ok);
			} else {
				await maybeOpenOnRecentErrors(ctx.endpoint, candidate.providerId, baseModel);
			}
		}
		if (!executorResult.upstream.ok) {
			const upstreamFailure = await readUpstreamFailurePayload(executorResult);
			const upstreamSummary = extractUpstreamErrorSummary(upstreamFailure.payload);
			attemptErrors.push({
				provider: candidate.providerId,
				endpoint: ctx.endpoint,
				model: baseModel,
				provider_model_slug: providerModelSlug ?? null,
				attempt_number: attemptErrors.length + 1,
				type: "upstream_non_2xx",
				status: executorResult.upstream.status,
				status_text: executorResult.upstream.statusText || null,
				upstream_url: executorResult.upstream.url || null,
				key_source: executorResult.keySource ?? null,
				byok_key_id: executorResult.byokKeyId ?? null,
				upstream_payload_preview: upstreamFailure.payload_preview,
				...upstreamSummary,
			});
		}

		// Build result
		const result: IRRequestResult = {
			kind: executorResult.kind,
			ir: executorResult.kind === "completed" ? executorResult.ir : undefined,
			upstream: executorResult.upstream,
			stream: executorResult.kind === "stream" ? executorResult.stream : undefined,
			usageFinalizer: executorResult.kind === "stream" ? executorResult.usageFinalizer : undefined,
			provider: candidate.providerId,
			generationTimeMs,
			bill: executorResult.bill,
			keySource: executorResult.keySource,
			byokKeyId: executorResult.byokKeyId,
			mappedRequest: executorResult.mappedRequest,
			rawResponse: executorResult.rawResponse,
		};
		(result as any).healthContext = {
			provider: candidate.providerId,
			model: baseModel,
			isProbe,
		};

		if (ctx.meta.debug?.enabled) {
			const mappedRequestValue = parseJsonLoose(executorResult.mappedRequest);
			void logDebugEvent("executor.result", {
				requestId: ctx.requestId,
				endpoint: ctx.endpoint,
				provider: candidate.providerId,
				upstreamStatus: executorResult.upstream.status,
				upstreamUrl: executorResult.upstream.url || null,
				mappedRequest: typeof mappedRequestValue === "string"
					? previewValue(mappedRequestValue)
					: mappedRequestValue,
				rawResponse: previewValue(executorResult.rawResponse),
				ir: previewValue(executorResult.kind === "completed" ? executorResult.ir : null),
			});
		}

		return { ok: true, result };
	} catch (err) {
		console.error(`Executor execution failed for ${candidate.providerId}:`, err);
		attemptErrors.push({
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			type: "error",
			message: err instanceof Error ? err.message : String(err),
		});
		const endToEndMs = Math.round(timing.timer.elapsed("request_start"));
		await onCallEnd(ctx.endpoint, {
			provider: candidate.providerId,
			model: baseModel,
			ok: false,
			latency_ms: endToEndMs,
			generation_ms: ctx.meta.generation_ms ?? Math.round(performance.now() - t0),
		});
		if (isProbe) {
			await reportProbeResult(ctx.endpoint, candidate.providerId, baseModel, false);
		} else {
			await maybeOpenOnRecentErrors(ctx.endpoint, candidate.providerId, baseModel);
		}
		return { ok: false };
	}
}






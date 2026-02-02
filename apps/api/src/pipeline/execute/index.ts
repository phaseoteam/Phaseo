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
import { getBaseModel, calculateMaxTries } from "./utils";
import { rankProviders } from "./providers";
import { attemptProvider, type AttemptResult } from "./attempt";
import { resolveProviderExecutor } from "../../executors";
import { admitThroughBreaker, onCallEnd, onCallStart, maybeOpenOnRecentErrors, reportProbeResult } from "./health";
import { logDebugEvent, previewValue } from "../debug";
import { validateOpenAIReasoningEffort } from "./openai-quirks";

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

import type { IRChatRequest, IRChatResponse } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { normalizeIRForProvider } from "./normalize";

/**
 * IR-aware request result
 * Similar to RequestResult but works with IR
 */
export type IRRequestResult = {
	kind: "completed" | "stream";
	ir?: IRChatResponse; // IR response (for completed requests)
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
 * Same logic as doRequest() but works with IR and provider executors
 *
 * @param ctx - Pipeline context
 * @param ir - IR chat request
 * @param timing - Timing tracker
 * @returns IR request result or error response
 */
export async function doRequestWithIR(
	ctx: PipelineContext,
	ir: IRChatRequest,
	timing: PipelineTiming,
): Promise<Response | { ok: true; result: IRRequestResult }> {
	const baseModel = getBaseModel(ctx.model);

	// 1) Guard: Check candidates exist
	const candidatesGuard = await guardCandidates(ctx, timing);
	if (!candidatesGuard.ok) return (candidatesGuard as { ok: false; response: Response }).response;
	const candidates = candidatesGuard.value;

	// 2) Rank providers (health-aware)
	const ranked = await rankProviders(candidates, ctx);

	// 3) Try providers in order (failover up to 5)
	const maxTries = calculateMaxTries(ranked.length);
	let anyPricingFound = false;

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
 * IR-aware version of attemptProvider()
 */
async function attemptProviderWithIR(
	routed: any, // RoutedCandidate type
	ctx: PipelineContext,
	ir: IRChatRequest,
	timing: PipelineTiming,
	baseModel: string,
): Promise<{ ok: true; result: IRRequestResult } | { ok: false; skip?: string }> {
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
		return { ok: false, skip: "blocked" };
	}
	const isProbe = admission === "probe";

	// Get pricing card
	const pricingCard = candidate.pricingCard;
	if (!pricingCard) {
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
			return { ok: false, skip: "unsupported_executor" };
		}

		// OpenAI-specific quirks: validate reasoning effort
		if (candidate.providerId === "openai" && ir.reasoning?.effort) {
			const validationError = validateOpenAIReasoningEffort(ir.model, ir.reasoning.effort);
			if (validationError) {
				return {
					ok: false,
					error: new Error(validationError),
					errorType: "unsupported_reasoning_effort",
				};
			}
		}

		const normalizedIr = normalizeIRForProvider(ir, candidate.providerId, ctx.protocol as any, candidate);
		const executorResult = await executor({
			ir: normalizedIr,
			requestId: ctx.requestId,
			teamId: ctx.teamId,
			providerId: candidate.providerId,
			endpoint: ctx.endpoint,
			protocol: ctx.protocol as any,
			capability: ctx.capability,
			providerModelSlug: candidate.providerModelSlug,
			capabilityParams: candidate.capabilityParams,
			maxInputTokens: candidate.maxInputTokens,
			maxOutputTokens: candidate.maxOutputTokens,
			byokMeta: candidate.byokMeta || [],
			pricingCard,
			meta: {
				debug: ctx.meta.debug,
				returnMeta: ctx.meta.returnMeta,
				echoUpstreamRequest: ctx.meta.echoUpstreamRequest,
				upstreamStartMs: ctx.meta.upstreamStartMs, // Pass timing to executor
			},
		} as ExecutorExecuteArgs);

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
		const tokensIn = executorResult.kind === "completed"
			? Number(executorResult.ir?.usage?.inputTokens ?? 0)
			: 0;
		const tokensOut = executorResult.kind === "completed"
			? Number(executorResult.ir?.usage?.outputTokens ?? 0)
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

		if (ctx.meta.debug) {
			void logDebugEvent("executor.result", {
				requestId: ctx.requestId,
				endpoint: ctx.endpoint,
				provider: candidate.providerId,
				upstreamStatus: executorResult.upstream.status,
				mappedRequest: previewValue(executorResult.mappedRequest),
				rawResponse: previewValue(executorResult.rawResponse),
				ir: previewValue(executorResult.kind === "completed" ? executorResult.ir : null),
			});
		}

		if (executorResult.kind === "stream") {
			(result as any).healthContext = {
				provider: candidate.providerId,
				model: baseModel,
				isProbe,
			};
		}

		return { ok: true, result };
	} catch (err) {
		console.error(`Executor execution failed for ${candidate.providerId}:`, err);
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



/** EXECUTE STAGE (per-model scoped health, load-balanced by default) */
export async function doRequest(
	ctx: PipelineContext,
	timing: PipelineTiming,
): Promise<Response | { ok: true; result: RequestResult }> {

	const baseModel = getBaseModel(ctx.model);

	// 1) Guard: Check candidates exist
	const candidatesGuard = await guardCandidates(ctx, timing);
	if (!candidatesGuard.ok) return (candidatesGuard as { ok: false; response: Response }).response;
	const candidates = candidatesGuard.value;

	// 2) Rank providers (health-aware)
	const ranked = await rankProviders(candidates, ctx);

	// 3) Try providers in order (failover up to 5)
	const maxTries = calculateMaxTries(ranked.length);
	let anyPricingFound = false;

	for (let attempt = 0; attempt < maxTries; attempt++) {
		const choice = ranked[attempt];
		const result = await attemptProvider(choice, ctx, timing, baseModel);

		if (result.ok) {
			return result;
		}

		if ("skip" in result && result.skip === "no_pricing") {
			// Continue to next provider but don't mark pricing as found
			continue;
		}

		if ("skip" in result && result.skip === "blocked") {
			// Continue to next provider
			continue;
		}

		// If we got here, pricing was found but execution failed
		anyPricingFound = true;
	}

	// 4) Guard: Check if any pricing was found
	const pricingGuard = await guardPricingFound(anyPricingFound, ctx, timing);
	if (!pricingGuard.ok) return (pricingGuard as { ok: false; response: Response }).response;

	// 5) All providers failed
	const failureGuard = await guardAllFailed(ctx, timing);
	return (failureGuard as { ok: false; response: Response }).response;
}







// file: lib/gateway/execute/index.ts
import type { GatewayResponsePayload } from "@core/types";
import type { PipelineContext } from "../before/types";
import type { AdapterResult } from "@providers/types";
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

export type Bill = {
	cost_cents: number;
	currency: string;
	usage?: Record<string, any>;
	upstream_id?: string | null;
	finish_reason?: string | null;
};

export type RequestResult = {
	kind: AdapterResult["kind"];
	upstream: Response;
	stream?: ReadableStream<Uint8Array> | null;
	usageFinalizer?: (() => Promise<Bill | null>) | null;
	provider: string;
	generationTimeMs: number;
	bill: Bill;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	normalized?: GatewayResponsePayload;
	ir?: IRChatResponse;
	debugClone?: Response;
	mappedRequest?: any;
	rawResponse?: any;
};

// ============================================================================
// IR-AWARE EXECUTION (NEW)
// ============================================================================

import type { IRChatRequest, IRChatResponse } from "@core/ir";
import type { SurfaceId } from "@surfaces/types";
import { getSurface, getSurfaceIdForProvider } from "@surfaces/index";

/**
 * IR-aware request result
 * Similar to RequestResult but works with IR
 */
export type IRRequestResult = {
	kind: "completed" | "stream";
	ir?: IRChatResponse; // IR response (for completed requests)
	upstream: Response;
	stream?: ReadableStream<Uint8Array> | null;
	usageFinalizer?: (() => Promise<Bill | null>) | null;
	provider: string;
	surfaceId: SurfaceId;
	generationTimeMs: number;
	bill: Bill;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	mappedRequest?: string;
	rawResponse?: any;
};

/**
 * Execute request using IR pipeline
 * Same logic as doRequest() but works with IR and surfaces
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

	// Determine surface to use for this provider (based on provider capabilities)
	const surfaceId = getSurfaceIdForProvider(candidate.providerId);
	const surface = getSurface(surfaceId);

	// Get pricing card
	const pricingCard = candidate.pricingCard;
	if (!pricingCard) {
		return { ok: false, skip: "no_pricing" };
	}

	// Execute using surface
	try {
		timing.timer.mark("adapter_start");
		const t0 = performance.now();

        ctx.meta.upstreamStartMs = Date.now();
        const surfaceResult = await surface.execute({
			ir,
			requestId: ctx.requestId,
			teamId: ctx.teamId,
			providerId: candidate.providerId,
			providerModelSlug: candidate.providerModelSlug,
			byokMeta: candidate.byokMeta || [], // Pass BYOK metadata to surface
			pricingCard,
			meta: {
				debug: ctx.meta.debug,
				returnUsage: ctx.meta.returnUsage,
				returnMeta: ctx.meta.returnMeta,
				echoUpstreamRequest: ctx.meta.echoUpstreamRequest,
			},
		});

        if (surfaceResult.timing) {
            if (typeof surfaceResult.timing.latencyMs === "number") {
                ctx.meta.latency_ms = surfaceResult.timing.latencyMs;
            }
            if (typeof surfaceResult.timing.generationMs === "number") {
                ctx.meta.generation_ms = surfaceResult.timing.generationMs;
            }
        }
        timing.timer.end("adapter_start");
		const generationTimeMs = Math.round(performance.now() - t0);

		// Build result
		const result: IRRequestResult = {
			kind: surfaceResult.kind,
			ir: surfaceResult.kind === "completed" ? surfaceResult.ir : undefined,
			upstream: surfaceResult.upstream,
			stream: surfaceResult.kind === "stream" ? surfaceResult.stream : undefined,
			usageFinalizer: surfaceResult.kind === "stream" ? surfaceResult.usageFinalizer : undefined,
			provider: candidate.providerId,
			surfaceId,
			generationTimeMs,
			bill: surfaceResult.bill,
			keySource: surfaceResult.keySource,
			byokKeyId: surfaceResult.byokKeyId,
			mappedRequest: surfaceResult.mappedRequest,
			rawResponse: surfaceResult.rawResponse,
		};

		return { ok: true, result };
	} catch (err) {
		// Handle errors
		console.error(`Surface execution failed for ${candidate.providerId}:`, err);
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

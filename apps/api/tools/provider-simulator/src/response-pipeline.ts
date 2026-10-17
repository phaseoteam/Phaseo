// Purpose: Push a synthesised provider response back through the gateway's response path.
// Why: Prove what the client receives and what is billed, for streaming and buffered clients.
// How: Streaming clients: passthroughWithPricing with a frame rewriter copied from
//      pipeline/after/stream.ts:247-349 and the finalisation rules of :466-776. Buffered clients:
//      consumeTextProtocolStreamToIR (surfaces/text-generate.ts:558-612), encodeProtocol,
//      enrichSuccessPayload and the non-stream pricing of pipeline/after/index.ts:437-486.

import { passthroughWithPricing } from "@pipeline/after/streaming";
import { calculatePricing } from "@pipeline/after/pricing";
import { enrichSuccessPayload, formatClientPayload, normalizeAnthropicUsage, presentUsageForClient } from "@pipeline/after/payload";
import { shapeUsageForClient, stripUsagePricing } from "@pipeline/usage";
import { consumeTextProtocolStreamToIR } from "@pipeline/surfaces/server-tools.stream";
import { encodeProtocol } from "@protocols/index";
import type { PriceCard } from "@pipeline/pricing/types";
import type { ExecutorResult } from "@executors/types";
import { SURFACE_ENDPOINT, SURFACE_PROTOCOL, type Surface } from "./client-requests";
import { WORKSPACE_ID, buildCandidate, type RouteUnderTest } from "./request-pipeline";

export type PricingOutcome =
	| { ok: true; totalNanos: number; lines: Array<{ meter: string; quantity: number; nanos: number }>; pricedUsage: any }
	| { ok: false; error: string };

export type ClientOutcome = {
	mode: "stream" | "buffered";
	surface: Surface;
	/** Usage the client receives (final frame or JSON body). */
	clientUsage: any;
	/** Raw usage handed to billing, before shaping. */
	billingUsageRaw: any;
	shapedUsage: any;
	pricing: PricingOutcome | null;
	/** Usage frames whose inline pricing threw; production forwards them unrewritten. */
	framePricingErrors: string[];
	finishReason: string | null;
	clientText: string;
	clientJson: any;
	frames: any[];
	materialiseError?: string;
};

function makeCtx(surface: Surface, body: any, requestId: string, route: RouteUnderTest): any {
	return {
		endpoint: SURFACE_ENDPOINT[surface],
		protocol: SURFACE_PROTOCOL[surface],
		capability: "text.generate",
		requestId,
		billingRequestId: requestId,
		workspaceId: WORKSPACE_ID,
		teamId: WORKSPACE_ID,
		model: route.route.apiModelId,
		body,
		rawBody: body,
		stream: body?.stream === true,
		providers: [buildCandidate(route)],
		teamEnrichment: null,
		teamSettings: null,
		meta: { requestId, returnMeta: false, startedAtMs: Date.now(), apiKeyId: "key_sim_0001" },
	};
}

function pricingLines(priced: any): PricingOutcome {
	const lines = Array.isArray(priced?.pricing?.lines) ? priced.pricing.lines : [];
	return {
		ok: true,
		totalNanos: Number(priced?.pricing?.total_nanos ?? 0),
		lines: lines.map((line: any) => ({
			meter: String(line.dimension ?? line.meter ?? "?"),
			quantity: Number(line.quantity ?? 0),
			nanos: Number(line.line_nanos ?? 0),
		})),
		pricedUsage: priced,
	};
}

/** The pricing error, if any (the api tsconfig does not narrow boolean discriminants). */
export function pricingError(outcome: PricingOutcome | null | undefined): string | undefined {
	return outcome && !outcome.ok ? (outcome as { error: string }).error : undefined;
}

export function priceUsage(shapedUsage: any, card: PriceCard | null, body: any): PricingOutcome | null {
	if (!card) return null;
	try {
		const { pricedUsage } = calculatePricing(shapedUsage, card, body, "basic", null);
		return pricingLines(pricedUsage);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Copy of the usage-related part of handleStreamResponse's rewriteFrame (pipeline/after/stream.ts:247-349). */
function productionRewriteFrame(ctx: any, card: PriceCard | null, provider: string, framePricingErrors: string[]) {
	let cachedNativeId: string | undefined;
	const withProviderHint = (usage: any) => (usage && typeof usage === "object" ? { ...usage, _provider_id: provider } : usage);
	const shape = (usage: any) => (usage && typeof usage === "object"
		? shapeUsageForClient(withProviderHint(usage), { endpoint: ctx.endpoint, body: ctx.body })
		: usage);
	const priceForClient = (usage: any) => {
		if (ctx.endpoint === "messages" || ctx.protocol === "anthropic.messages") return normalizeAnthropicUsage(usage);
		if (card) {
			try {
				const { pricedUsage } = calculatePricing(shape(usage), card, ctx.body, "basic", ctx.meta);
				return presentUsageForClient(withProviderHint(pricedUsage), { endpoint: ctx.endpoint });
			} catch (error) {
				framePricingErrors.push(error instanceof Error ? error.message : String(error));
				throw error;
			}
		}
		return presentUsageForClient(shape(usage), { endpoint: ctx.endpoint });
	};
	return (frame: any) => {
		if (!frame || typeof frame !== "object") return frame;
		const next: any = { ...frame };
		delete next.provider;
		delete next.gateway;
		if (ctx.endpoint === "chat.completions" || ctx.endpoint === "responses") {
			if (!cachedNativeId) cachedNativeId = typeof next.nativeResponseId === "string" ? next.nativeResponseId : (typeof next.id === "string" ? next.id : undefined);
			if (!next.nativeResponseId && cachedNativeId) next.nativeResponseId = cachedNativeId;
			next.id = ctx.requestId;
		}
		if ("meta" in next) delete next.meta;
		if (next.usage) next.usage = priceForClient(next.usage);
		else if (next.response?.usage) next.response = { ...next.response, usage: priceForClient(next.response.usage) };
		return next;
	};
}

function parseSse(text: string): any[] {
	const frames: any[] = [];
	for (const block of text.split(/\n\n+/)) {
		const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
		if (!data || data === "[DONE]") continue;
		try {
			frames.push(JSON.parse(data));
		} catch {
			// ignore non-JSON frames
		}
	}
	return frames;
}

function lastUsageInFrames(frames: any[]): any {
	for (let index = frames.length - 1; index >= 0; index -= 1) {
		const frame = frames[index];
		const usage = frame?.usage ?? frame?.response?.usage ?? frame?.message?.usage;
		if (usage) return usage;
	}
	return null;
}

async function streamingClient(result: Extract<ExecutorResult, { kind: "stream" }>, surface: Surface, body: any, requestId: string, route: RouteUnderTest): Promise<ClientOutcome> {
	const ctx = makeCtx(surface, { ...body, stream: true }, requestId, route);
	const framePricingErrors: string[] = [];
	let finishReason: string | null = null;
	let resolveFinal: (value: { usage: any }) => void = () => {};
	const finalUsage = new Promise<{ usage: any }>((resolve) => { resolveFinal = resolve; });
	const upstream = new Response(result.stream, { status: result.upstream.status, headers: result.upstream.headers });
	const response = await passthroughWithPricing({
		upstream,
		ctx,
		provider: route.providerId,
		priceCard: route.priceCard,
		rewriteFrame: productionRewriteFrame(ctx, route.priceCard, route.providerId, framePricingErrors),
		onStreamEvent: (event: any) => {
			if (event?.type === "stop" && event.finishReason) finishReason = event.finishReason;
		},
		onFinalSnapshot: () => {},
		onFinalUsage: async (usage: any) => {
			resolveFinal({ usage });
		},
	} as any);
	const clientText = await response.text();
	const timeout = new Promise<{ usage: any }>((resolve) => setTimeout(() => resolve({ usage: undefined }), 2_000));
	const final = await Promise.race([finalUsage, timeout]);
	const frames = parseSse(clientText);

	// pipeline/after/stream.ts:478: usage from the final frame, else the latest usage frame, else the executor bill.
	const latestFrameUsage = (() => {
		for (let index = frames.length - 1; index >= 0; index -= 1) {
			const usage = frames[index]?.usage ?? frames[index]?.response?.usage;
			if (usage) return stripUsagePricing(usage);
		}
		return null;
	})();
	let billingUsageRaw = final.usage ?? latestFrameUsage ?? stripUsagePricing(result.bill?.usage);
	let usedFinalizer = false;
	if (!billingUsageRaw && result.usageFinalizer) {
		const finalized = await result.usageFinalizer();
		billingUsageRaw = finalized?.usage ?? null;
		usedFinalizer = true;
	}
	const shapedUsage = billingUsageRaw
		? shapeUsageForClient({ ...billingUsageRaw, _provider_id: route.providerId }, { endpoint: ctx.endpoint, body: ctx.body })
		: null;
	return {
		mode: "stream",
		surface,
		clientUsage: lastUsageInFrames(frames),
		billingUsageRaw: usedFinalizer ? { ...billingUsageRaw, _source: "usageFinalizer" } : billingUsageRaw,
		shapedUsage,
		pricing: shapedUsage ? priceUsage(shapedUsage, route.priceCard, ctx.body) : null,
		framePricingErrors,
		finishReason,
		clientText,
		clientJson: null,
		frames,
	};
}

async function bufferedClient(result: ExecutorResult, surface: Surface, body: any, requestId: string, route: RouteUnderTest): Promise<ClientOutcome> {
	const ctx = makeCtx(surface, { ...body, stream: false }, requestId, route);
	const protocol = SURFACE_PROTOCOL[surface];
	let completed: any = result;
	if (result.kind === "stream") {
		try {
			const consumed = await consumeTextProtocolStreamToIR({
				protocol: protocol as any,
				stream: result.stream,
				requestId,
				model: route.route.apiModelId,
				provider: route.providerId,
			});
			completed = {
				...result,
				kind: "completed",
				ir: consumed.ir,
				stream: null,
				usageFinalizer: null,
				rawResponse: consumed.rawResponse,
				bill: {
					...result.bill,
					usage: result.bill?.usage && typeof result.bill.usage === "object" ? result.bill.usage : consumed.usageRaw ?? result.bill?.usage,
				},
			};
		} catch (error) {
			return {
				mode: "buffered", surface, clientUsage: null, billingUsageRaw: null, shapedUsage: null, pricing: null,
				framePricingErrors: [], finishReason: null, clientText: "", clientJson: null, frames: [],
				materialiseError: error instanceof Error ? error.message : String(error),
			};
		}
	}
	if (!completed.ir) {
		return {
			mode: "buffered", surface, clientUsage: null, billingUsageRaw: null, shapedUsage: null, pricing: null,
			framePricingErrors: [], finishReason: null, clientText: "", clientJson: null, frames: [],
			materialiseError: `executor returned no IR (upstream status ${completed.upstream?.status})`,
		};
	}
	const normalized = encodeProtocol(protocol as any, completed.ir, requestId);
	const requestResult: any = {
		kind: "completed",
		upstream: completed.upstream,
		provider: route.providerId,
		generationTimeMs: 0,
		bill: completed.bill,
		normalized,
		ir: completed.ir,
		rawResponse: completed.rawResponse,
	};
	const payload = await enrichSuccessPayload(ctx, requestResult);
	const clientJson = formatClientPayload({ ctx, result: requestResult, payload, includeUsage: true, includeMeta: false } as any);
	// pipeline/after/index.ts:437-486
	const usageNormalized = { ...(completed.bill?.usage ?? {}), ...(payload?.usage ?? {}) };
	const raw = { ...usageNormalized, _provider_id: route.providerId };
	const shaped = shapeUsageForClient(raw, { endpoint: ctx.endpoint, body: ctx.body, includeInternalHints: true });
	const shapedUsage = { ...raw, ...(shaped && typeof shaped === "object" ? shaped : {}) };
	return {
		mode: "buffered",
		surface,
		clientUsage: clientJson?.usage ?? null,
		billingUsageRaw: usageNormalized,
		shapedUsage,
		pricing: priceUsage(shapedUsage, route.priceCard, ctx.body),
		framePricingErrors: [],
		finishReason: completed.ir?.choices?.[0]?.finishReason ?? null,
		clientText: JSON.stringify(clientJson),
		clientJson,
		frames: [],
	};
}

export async function deliverToClient(args: {
	result: ExecutorResult;
	mode: "stream" | "buffered";
	surface: Surface;
	body: any;
	requestId: string;
	route: RouteUnderTest;
}): Promise<ClientOutcome> {
	if (args.mode === "stream" && args.result.kind === "stream") {
		return streamingClient(args.result, args.surface, args.body, args.requestId, args.route);
	}
	return bufferedClient(args.result, args.surface, args.body, args.requestId, args.route);
}

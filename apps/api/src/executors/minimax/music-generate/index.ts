// Purpose: Executor for minimax / music-generate.
// Why: Uses MiniMax native music APIs directly instead of relay providers.
// How: Submits jobs to /v1/music_generation and normalizes the async task response.

import type { IRMusicGenerateRequest, IRMusicGenerateResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveMusicJobMeta } from "@core/music-jobs";
import { computeBill } from "@pipeline/pricing/engine";

const MINIMAX_MUSIC_PREFIX = "mmxmus_";
const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io";

function encodeMiniMaxMusicId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${MINIMAX_MUSIC_PREFIX}${b64}`;
}

function toMusicStatus(value: unknown): IRMusicGenerateResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded" || status === "success" || status === "finished") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function extractTaskId(json: any): string | undefined {
	const taskId = json?.task_id ?? json?.taskId ?? json?.id ?? json?.data?.task_id ?? json?.data?.taskId;
	if (taskId == null) return undefined;
	const value = String(taskId).trim();
	return value.length > 0 ? value : undefined;
}

function extractAudioUrl(json: any): string | undefined {
	const value =
		json?.audio_url ??
		json?.audioUrl ??
		json?.url ??
		json?.data?.audio_url ??
		json?.data?.audioUrl ??
		json?.output?.audio_url ??
		json?.output?.audioUrl;
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRMusicGenerateRequest;
	const model = args.providerModelSlug || ir.model || "music-01";
	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const minimaxExtensions = (ir.vendor?.minimax ?? rawRequest.minimax ?? {}) as Record<string, any>;
	const passthroughRequest =
		minimaxExtensions.request &&
		typeof minimaxExtensions.request === "object" &&
		!Array.isArray(minimaxExtensions.request)
			? { ...(minimaxExtensions.request as Record<string, any>) }
			: {};

	if (passthroughRequest.model == null) passthroughRequest.model = model;
	if (passthroughRequest.prompt == null) {
		passthroughRequest.prompt = minimaxExtensions.prompt ?? ir.prompt ?? "";
	}
	if (passthroughRequest.duration == null) {
		const duration = toPositiveNumber(minimaxExtensions.duration ?? ir.duration);
		if (duration != null) passthroughRequest.duration = duration;
	}
	if (passthroughRequest.format == null && typeof ir.format === "string") passthroughRequest.format = ir.format;
	if (passthroughRequest.callback_url == null && typeof minimaxExtensions.callback_url === "string") {
		passthroughRequest.callback_url = minimaxExtensions.callback_url;
	}

	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.MINIMAX_API_KEY;
		},
	);

	const requestBody = JSON.stringify(passthroughRequest);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
	const res = await fetch(`${baseUrl}/v1/music_generation`, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${keyInfo.key}`,
			"Content-Type": "application/json",
		},
		body: requestBody,
	});

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? undefined,
		finish_reason: null as string | null,
	};

	if (!res.ok) {
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const json = await res.json().catch(() => ({}));
	const taskId = extractTaskId(json);
	const encodedId = taskId ? encodeMiniMaxMusicId(taskId) : undefined;
	if (encodedId) {
		try {
			await saveMusicJobMeta(args.teamId, encodedId, {
				provider: args.providerId,
				model,
				duration: toPositiveNumber(passthroughRequest.duration) ?? null,
				format: typeof passthroughRequest.format === "string" ? passthroughRequest.format : null,
				createdAt: Date.now(),
			});
		} catch (error) {
			console.error("minimax_music_job_meta_store_failed", {
				error,
				teamId: args.teamId,
				musicId: encodedId,
				requestId: args.requestId,
			});
		}
	}

	const usageMeters: Record<string, number> = {
		requests: 1,
		...(toPositiveNumber(passthroughRequest.duration) != null
			? { output_audio_seconds: toPositiveNumber(passthroughRequest.duration)! }
			: {}),
	};
	if (args.pricingCard) {
		const priced = computeBill(usageMeters, args.pricingCard, { model });
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

	const irResponse: IRMusicGenerateResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status: toMusicStatus(json?.status ?? json?.task_status),
		audioUrl: extractAudioUrl(json),
		result: json,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			requests: 1,
			...(usageMeters.output_audio_seconds != null ? { output_audio_seconds: usageMeters.output_audio_seconds } : {}),
		} as any,
		rawResponse: json,
	};

	return {
		kind: "completed",
		ir: irResponse,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
	};
}

export const executor: ProviderExecutor = execute;

// Purpose: Executor for minimax / video-generate.
// Why: Uses MiniMax native video APIs directly instead of relay providers.
// How: Submits async jobs to /v1/video_generation and returns normalized queued IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { computeBill } from "@pipeline/pricing/engine";

const MINIMAX_VIDEO_PREFIX = "mmxvid_";
const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io";

function encodeMiniMaxVideoId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${MINIMAX_VIDEO_PREFIX}${b64}`;
}

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	return toPositiveNumber(ir.durationSeconds) ??
		toPositiveNumber(ir.duration) ??
		toPositiveNumber(ir.seconds);
}

function toVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
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

function extractVideoOutput(json: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const direct =
		json?.video_url ??
		json?.videoUrl ??
		json?.download_url ??
		json?.data?.video_url ??
		json?.data?.videoUrl ??
		json?.output?.video_url ??
		json?.output?.videoUrl;
	if (typeof direct === "string" && direct.length > 0) {
		return [{ index: 0, uri: direct, mime_type: "video/mp4" }];
	}
	return [];
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "video-01";
	const seconds = parseDurationSeconds(ir);
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.MINIMAX_API_KEY;
		},
	);

	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const minimaxExtensions = (rawRequest.minimax ?? {}) as Record<string, any>;
	const passthroughRequest =
		minimaxExtensions.request &&
		typeof minimaxExtensions.request === "object" &&
		!Array.isArray(minimaxExtensions.request)
			? { ...(minimaxExtensions.request as Record<string, any>) }
			: {};

	if (passthroughRequest.model == null) passthroughRequest.model = model;
	if (passthroughRequest.prompt == null) passthroughRequest.prompt = ir.prompt;
	if (passthroughRequest.duration == null && seconds != null) passthroughRequest.duration = seconds;
	if (passthroughRequest.first_frame_image == null && ir.inputReference) {
		passthroughRequest.first_frame_image = ir.inputReference;
	}
	if (passthroughRequest.seed == null && typeof ir.seed === "number") passthroughRequest.seed = ir.seed;

	const requestBody = JSON.stringify(passthroughRequest);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
	const res = await fetch(`${baseUrl}/v1/video_generation`, {
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
	const encodedId = taskId ? encodeMiniMaxVideoId(taskId) : undefined;
	if (encodedId) {
		try {
			await saveVideoJobMeta(args.teamId, encodedId, {
				provider: args.providerId,
				model,
				seconds: seconds ?? null,
				size: ir.size ?? null,
				quality: ir.quality ?? null,
				createdAt: Date.now(),
			});
		} catch (error) {
			console.error("minimax_video_job_meta_store_failed", {
				error,
				teamId: args.teamId,
				videoId: encodedId,
				requestId: args.requestId,
			});
		}
	}

	// Async create requests should only bill request metering.
	// Completion-duration billing is handled by /videos/:id when the job is done.
	const usageMeters: Record<string, number> = {
		requests: 1,
	};
	if (args.pricingCard) {
		const priced = computeBill(usageMeters, args.pricingCard, { model });
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status: toVideoStatus(json?.status ?? json?.task_status),
		output: extractVideoOutput(json),
		result: json,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			requests: 1,
			...(seconds != null ? { output_video_seconds: seconds } : {}),
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

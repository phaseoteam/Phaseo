// Purpose: Executor for x-ai / video-generate.
// Why: Uses xAI native video generation endpoints for direct provider support.
// How: Submits generation jobs to /videos/generations and returns normalized IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { saveVideoJobMeta } from "@core/video-jobs";
import { computeBill } from "@pipeline/pricing/engine";

const XAI_VIDEO_PREFIX = "xaivid_";

function encodeXAiVideoId(videoId: string): string {
	const b64 = btoa(videoId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${XAI_VIDEO_PREFIX}${b64}`;
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
	if (status === "completed" || status === "succeeded" || status === "success") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function extractNativeVideoId(json: any): string | undefined {
	const id = json?.id ?? json?.request_id ?? json?.video_id ?? json?.data?.id ?? json?.data?.request_id;
	if (id == null) return undefined;
	const str = String(id).trim();
	return str.length > 0 ? str : undefined;
}

function extractVideoOutput(json: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const output = Array.isArray(json?.output)
		? json.output
		: Array.isArray(json?.data)
			? json.data
			: [];
	if (output.length > 0) {
		return output.map((item: any, index: number) => ({
			index,
			uri: item?.url ?? item?.video_url ?? item?.uri ?? null,
			mime_type: item?.mime_type ?? item?.mimeType ?? "video/mp4",
		}));
	}

	const videoUrl = json?.video_url ?? json?.url ?? json?.result?.video_url ?? json?.result?.url;
	if (typeof videoUrl === "string" && videoUrl.length > 0) {
		return [{ index: 0, uri: videoUrl, mime_type: "video/mp4" }];
	}
	return [];
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "grok-video";
	const seconds = parseDurationSeconds(ir);
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.X_AI_API_KEY || bindings.XAI_API_KEY;
		},
	);

	const requestObject: Record<string, any> = {
		model,
		prompt: ir.prompt,
	};
	if (seconds != null) requestObject.duration = seconds;
	if (ir.size) requestObject.size = ir.size;
	if (ir.quality) requestObject.quality = ir.quality;
	if (ir.inputReference) requestObject.image_url = ir.inputReference;
	if (typeof ir.seed === "number") requestObject.seed = ir.seed;

	const requestBody = JSON.stringify(requestObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	const res = await fetch(openAICompatUrl(args.providerId, "/videos/generations"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key),
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
	const nativeId = extractNativeVideoId(json);
	const encodedId = nativeId ? encodeXAiVideoId(nativeId) : undefined;
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
			console.error("xai_video_job_meta_store_failed", {
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
		status: toVideoStatus(json?.status),
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

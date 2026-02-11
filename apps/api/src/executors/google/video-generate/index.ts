// Purpose: Executor for google / video-generate.
// Why: Runs Veo video generation through IR -> Gemini Video API -> IR conversion.
// How: Submits a long-running operation and returns normalized queued response state.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import type { ProviderExecutor } from "../../types";

const GOOGLE_VIDEO_BASE = "https://generativelanguage.googleapis.com";

function encodeGoogleOperationId(operationName: string): string {
	const b64 = btoa(operationName).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `gaiop_${b64}`;
}

function toDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	if (typeof ir.durationSeconds === "number" && Number.isFinite(ir.durationSeconds) && ir.durationSeconds > 0) {
		return ir.durationSeconds;
	}
	if (typeof ir.duration === "number" && Number.isFinite(ir.duration) && ir.duration > 0) {
		return ir.duration;
	}
	if (typeof ir.seconds === "number" && Number.isFinite(ir.seconds) && ir.seconds > 0) {
		return ir.seconds;
	}
	if (typeof ir.seconds === "string" && ir.seconds.trim().length > 0) {
		const parsed = Number(ir.seconds.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function irToGoogleVideoRequest(ir: IRVideoGenerationRequest): any {
	const durationSeconds = toDurationSeconds(ir);
	const aspectRatio = ir.aspectRatio ?? ir.ratio;
	const parameters: Record<string, any> = {
		...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
		...(aspectRatio ? { aspectRatio } : {}),
		...(ir.resolution ? { resolution: ir.resolution } : {}),
		...(ir.negativePrompt ? { negativePrompt: ir.negativePrompt } : {}),
		...(typeof ir.sampleCount === "number" ? { sampleCount: ir.sampleCount } : {}),
		...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
		...(ir.personGeneration ? { personGeneration: ir.personGeneration } : {}),
		...(ir.outputStorageUri ? { storageUri: ir.outputStorageUri } : {}),
	};
	return {
		instances: [{ prompt: ir.prompt }],
		...(Object.keys(parameters).length > 0 ? { parameters } : {}),
	};
}

function googleVideoToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
	requestedSeconds?: number,
): IRVideoGenerationResponse {
	const operationName = json?.name ?? json?.operationName ?? null;
	const seconds =
		typeof json?.videoMetadata?.durationSeconds === "number"
			? json.videoMetadata.durationSeconds
			: typeof json?.response?.videoMetadata?.durationSeconds === "number"
				? json.response.videoMetadata.durationSeconds
				: requestedSeconds;
	const done = Boolean(json?.done);
	const output = done
		? (json?.response?.generateVideoResponse?.generatedSamples ?? []).map((sample: any, index: number) => ({
			index,
			uri: sample?.video?.uri ?? null,
			mime_type: sample?.video?.mimeType ?? null,
		}))
		: [];
	const usage: any = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};

	return {
		id: requestId,
		nativeId: operationName ? encodeGoogleOperationId(operationName) : undefined,
		model,
		provider,
		status: done ? "completed" : "queued",
		output,
		result: {
			operation_name: operationName ?? undefined,
			google: json,
		},
		usage,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "veo-3.1-generate-preview";
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GOOGLE_API_KEY,
	);

	const requestBodyObject = irToGoogleVideoRequest(ir);
	const requestBody = JSON.stringify(requestBodyObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	const res = await fetch(
		`${GOOGLE_VIDEO_BASE}/v1beta/models/${encodeURIComponent(model)}:predictLongRunning?key=${encodeURIComponent(keyInfo.key)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: requestBody,
		},
	);

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") ?? undefined,
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
	const irResponse = googleVideoToIR(
		json,
		args.requestId,
		model,
		args.providerId,
		toDurationSeconds(ir),
	);
	if (irResponse.nativeId) {
		try {
			await saveVideoJobMeta(args.teamId, String(irResponse.nativeId), {
				provider: args.providerId,
				model,
				seconds: toDurationSeconds(ir) ?? null,
				size: ir.size ?? ir.resolution ?? ir.aspectRatio ?? ir.ratio ?? null,
				quality: ir.quality ?? null,
				createdAt: Date.now(),
			});
		} catch (err) {
			console.error("google_video_job_meta_store_failed", {
				error: err,
				teamId: args.teamId,
				videoId: String(irResponse.nativeId),
				requestId: args.requestId,
			});
		}
	}

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

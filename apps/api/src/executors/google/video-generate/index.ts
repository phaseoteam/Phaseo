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

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeGoogleMediaSource(value: unknown): Record<string, any> | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/);
		if (dataUrlMatch) {
			return {
				mimeType: dataUrlMatch[1],
				imageBytes: dataUrlMatch[2],
			};
		}
		if (trimmed.startsWith("gs://")) {
			return { gcsUri: trimmed };
		}
		return { uri: trimmed };
	}

	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = { ...(value as Record<string, any>) };
	const gcsUri = toNonEmptyString(source.gcsUri) ?? toNonEmptyString(source.gcs_uri);
	const uri = toNonEmptyString(source.uri) ?? toNonEmptyString(source.url);
	const imageBytes = toNonEmptyString(source.imageBytes) ?? toNonEmptyString(source.image_bytes);
	const mimeType = toNonEmptyString(source.mimeType) ?? toNonEmptyString(source.mime_type);

	delete source.gcs_uri;
	delete source.image_bytes;
	delete source.mime_type;

	if (!source.gcsUri && gcsUri) source.gcsUri = gcsUri;
	if (!source.uri && uri) source.uri = uri;
	if (!source.imageBytes && imageBytes) source.imageBytes = imageBytes;
	if (!source.mimeType && mimeType) source.mimeType = mimeType;

	return Object.keys(source).length > 0 ? source : undefined;
}

function normalizeReferenceImages(value: unknown): Array<Record<string, any>> | undefined {
	if (!Array.isArray(value)) return undefined;
	const out = value
		.map((entry) => {
			if (typeof entry === "string") {
				const image = normalizeGoogleMediaSource(entry);
				return image ? { image } : null;
			}
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
			const record = entry as Record<string, any>;
			const image = normalizeGoogleMediaSource(record.image ?? record.uri ?? record.url ?? record.gcsUri ?? record.gcs_uri);
			const referenceType = toNonEmptyString(record.referenceType) ?? toNonEmptyString(record.reference_type);
			const normalized: Record<string, any> = {};
			if (referenceType) normalized.referenceType = referenceType;
			if (image) normalized.image = image;
			return Object.keys(normalized).length > 0 ? normalized : null;
		})
		.filter((item): item is Record<string, any> => Boolean(item));
	return out.length ? out : undefined;
}

function irToGoogleVideoRequest(ir: IRVideoGenerationRequest): any {
	const durationSeconds = toDurationSeconds(ir);
	const aspectRatio = ir.aspectRatio ?? ir.ratio;
	const numberOfVideos =
		typeof ir.numberOfVideos === "number"
			? ir.numberOfVideos
			: typeof ir.sampleCount === "number"
				? ir.sampleCount
				: undefined;
	const inputImage = normalizeGoogleMediaSource(ir.inputImage ?? ir.input?.image ?? ir.inputReference);
	const inputVideo = normalizeGoogleMediaSource(ir.inputVideo ?? ir.input?.video);
	const lastFrame = normalizeGoogleMediaSource(ir.lastFrame ?? ir.input?.lastFrame);
	const referenceImages = normalizeReferenceImages(ir.referenceImages ?? ir.input?.referenceImages);
	const parameters: Record<string, any> = {
		...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
		...(aspectRatio ? { aspectRatio } : {}),
		...(ir.resolution ? { resolution: ir.resolution } : {}),
		...(ir.negativePrompt ? { negativePrompt: ir.negativePrompt } : {}),
		...(typeof numberOfVideos === "number" ? { numberOfVideos } : {}),
		...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
		...(ir.personGeneration ? { personGeneration: ir.personGeneration } : {}),
		...(typeof ir.generateAudio === "boolean" ? { generateAudio: ir.generateAudio } : {}),
		...(typeof ir.enhancePrompt === "boolean" ? { enhancePrompt: ir.enhancePrompt } : {}),
		...(ir.outputStorageUri ? { storageUri: ir.outputStorageUri } : {}),
	};
	const instance: Record<string, any> = { prompt: ir.prompt };
	if (inputImage) instance.image = inputImage;
	if (inputVideo) instance.video = inputVideo;
	if (lastFrame) instance.lastFrame = lastFrame;
	if (referenceImages) instance.referenceImages = referenceImages;

	return {
		instances: [instance],
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

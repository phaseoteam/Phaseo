// Purpose: Executor for AtlasCloud video-generate.
// Why: AtlasCloud video uses async prediction endpoints outside OpenAI /videos.
// How: Submits /api/v1/model/generateVideo, stores prediction ID, and normalizes IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta, setVideoJobStatus } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import type { ProviderExecutor } from "../../types";

const DEFAULT_ATLASCLOUD_BASE_URL = "https://api.atlascloud.ai";
const ATLAS_VIDEO_PREFIX = "atlsvid_";

function encodeAtlasPredictionId(predictionId: string): string {
	const b64 = btoa(predictionId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${ATLAS_VIDEO_PREFIX}${b64}`;
}

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeInputSource(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	return toNonEmptyString(source.uri) ??
		toNonEmptyString(source.url) ??
		toNonEmptyString(source.gcsUri) ??
		toNonEmptyString(source.gcs_uri);
}

function normalizeReferenceImages(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const images = value
		.map((entry) => {
			if (typeof entry === "string") return toNonEmptyString(entry);
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
			const record = entry as Record<string, unknown>;
			return normalizeInputSource(record.image) ??
				toNonEmptyString(record.uri) ??
				toNonEmptyString(record.url);
		})
		.filter((entry): entry is string => Boolean(entry));
	return images.length > 0 ? images : undefined;
}

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	return toPositiveNumber(ir.durationSeconds) ??
		toPositiveNumber(ir.duration) ??
		toPositiveNumber(ir.seconds);
}

function toAtlasStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").trim().toLowerCase();
	if (!status) return "queued";
	if (status === "completed" || status === "success" || status === "succeeded" || status === "done") {
		return "completed";
	}
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") {
		return "failed";
	}
	if (status === "processing" || status === "running" || status === "in_progress" || status === "pending") {
		return "in_progress";
	}
	if (status === "queued" || status === "submitted") return "queued";
	return "queued";
}

function extractAtlasConfig(rawRequest: Record<string, any>): Record<string, any> {
	const fromConfig = rawRequest?.config?.atlascloud;
	const fromTopLevel = rawRequest?.atlascloud;
	const providerParams =
		rawRequest?.provider_params && typeof rawRequest.provider_params === "object" && !Array.isArray(rawRequest.provider_params)
			? rawRequest.provider_params
			: null;
	for (const candidate of [fromConfig, fromTopLevel, providerParams]) {
		if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
			return candidate as Record<string, any>;
		}
	}
	return {};
}

function buildAtlasVideoRequest(ir: IRVideoGenerationRequest, model: string): Record<string, any> {
	const isSeedance = model.startsWith("bytedance/seedance-");
	const rawRequest = ((ir.rawRequest ?? {}) as Record<string, any>);
	const atlasConfig = extractAtlasConfig(rawRequest);
	const seconds = parseDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const dimensions = size?.match(/^(\d+)x(\d+)$/);
	const width = dimensions ? Number(dimensions[1]) : undefined;
	const height = dimensions ? Number(dimensions[2]) : undefined;
	const resolution = isSeedance && width && height ? `${Math.min(width, height)}p` : size;
	const inferredRatio = width && height
		? ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"].find((ratio) => {
			const [x, y] = ratio.split(":").map(Number);
			return Math.abs(width / height - x / y) < 0.01;
		})
		: undefined;
	const aspectRatio = ir.aspectRatio ?? inferredRatio;
	const inputImage = normalizeInputSource(
		ir.inputReference ??
		ir.inputImage ??
		ir.input?.image ??
		atlasConfig.image ??
		atlasConfig.input_image,
	);
	const inputVideo = normalizeInputSource(
		ir.inputVideo ??
		ir.input?.video ??
		atlasConfig.video ??
		atlasConfig.input_video,
	);
	const lastFrame = normalizeInputSource(ir.lastFrame ?? ir.input?.lastFrame ?? atlasConfig.last_frame);
	const referenceImages = normalizeReferenceImages(
		ir.referenceImages ??
		ir.input?.referenceImages ??
		atlasConfig.reference_images ??
		atlasConfig.referenceImages,
	);

	const request: Record<string, any> = {
		model,
		prompt: ir.prompt,
		...(typeof seconds === "number" ? { duration: seconds } : {}),
		...(size ? (isSeedance ? { resolution } : { size }) : {}),
		...(ir.quality ? { quality: ir.quality } : {}),
		...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
		...(aspectRatio ? (isSeedance ? { ratio: aspectRatio } : { aspect_ratio: aspectRatio }) : {}),
		...(typeof ir.generateAudio === "boolean" ? { generate_audio: ir.generateAudio } : isSeedance ? { generate_audio: true } : {}),
		...(ir.negativePrompt ? { negative_prompt: ir.negativePrompt } : {}),
		...(inputImage && !model.endsWith("/reference-to-video") ? { image: inputImage } : {}),
		...(inputVideo && !model.endsWith("/reference-to-video") ? { video: inputVideo } : {}),
		...(lastFrame ? (isSeedance ? { last_image: lastFrame } : { last_frame: lastFrame }) : {}),
		...(model.endsWith("/reference-to-video") && inputImage
			? { reference_images: [inputImage, ...(referenceImages ?? [])] }
			: referenceImages ? { reference_images: referenceImages } : {}),
		...(isSeedance && model.endsWith("/reference-to-video") ? {
			reference_videos: ir.inputReferences?.filter((ref) => ref.type === "video").map((ref) => ref.url).filter(Boolean),
			reference_audios: ir.inputReferences?.filter((ref) => ref.type === "audio").map((ref) => ref.url).filter(Boolean),
		} : {}),
		...(ir.callbackUrl ? { callback_url: ir.callbackUrl } : {}),
	};

	const providerParams =
		ir.providerParams && typeof ir.providerParams === "object" && !Array.isArray(ir.providerParams)
			? ir.providerParams
			: null;
	if (providerParams) {
		for (const [key, value] of Object.entries(providerParams)) {
			if (request[key] == null) request[key] = value;
		}
	}

	return request;
}

function extractAtlasPayload(json: any): Record<string, unknown> {
	if (json && typeof json === "object" && !Array.isArray(json)) {
		const data = (json as Record<string, unknown>).data;
		if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
		return json as Record<string, unknown>;
	}
	return {};
}

function extractAtlasPredictionId(json: any): string | undefined {
	const payload = extractAtlasPayload(json);
	const id =
		payload.id ??
		payload.prediction_id ??
		payload.predictionId ??
		(json as any)?.id ??
		(json as any)?.request_id ??
		(json as any)?.requestId;
	if (id == null) return undefined;
	const normalized = String(id).trim();
	return normalized.length > 0 ? normalized : undefined;
}

function extractVideoOutput(payload: Record<string, unknown>): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const outputs = Array.isArray(payload.outputs)
		? payload.outputs
		: Array.isArray(payload.output)
			? payload.output
			: [];
	if (outputs.length > 0) {
		return outputs.map((item: any, index: number) => ({
			index,
			uri:
				typeof item === "string"
					? item
					: item?.url ?? item?.uri ?? item?.video_url ?? item?.videoUrl ?? null,
			mime_type:
				typeof item === "object" && item
					? (item?.mime_type ?? item?.mimeType ?? "video/mp4")
					: "video/mp4",
		}));
	}
	const urls = payload.urls && typeof payload.urls === "object" && !Array.isArray(payload.urls)
		? Object.values(payload.urls as Record<string, unknown>).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		: [];
	if (urls.length > 0) {
		return urls.map((uri, index) => ({ index, uri, mime_type: "video/mp4" }));
	}
	return [];
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "bytedance/seedance-2.0-pro";
	const seconds = parseDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? null;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.ATLAS_CLOUD_API_KEY;
		},
	);
	const requestObject = buildAtlasVideoRequest(ir, model);
	const pricingSize = requestObject.resolution ?? size;
	const inputVideoCount = requestObject.reference_videos?.length ?? (requestObject.video ? 1 : 0);
	const inputAudioCount = requestObject.reference_audios?.length ?? 0;
	const inputImageCount = requestObject.reference_images?.length ?? (requestObject.image ? 1 : 0);
	const validationError =
		inputVideoCount > 0 && !ir.inputVideoDurationSeconds ? "input_video_duration is required for video references" :
		inputAudioCount > 0 && !ir.inputAudioDurationSeconds ? "input_audio_duration is required for audio references" :
		model.startsWith("bytedance/seedance-2.5/") && (inputImageCount > 30 || inputVideoCount > 10 || inputAudioCount > 10)
			? "Seedance 2.5 supports at most 30 images, 10 videos and 10 audio references" :
		(ir.sampleCount ?? ir.numberOfVideos ?? 1) !== 1 ? "AtlasCloud video requests support one output per request" : null;
	if (validationError) {
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream: Response.json({ error: { type: "invalid_request_error", message: validationError } }, { status: 400 }),
			keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
		};
	}
	const requestBody = JSON.stringify(requestObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;

	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;
	try {
		const reserved = await reserveVideoGenerationCredits({
			keyId: args.apiKeyId,
			authMethod: args.meta.authMethod,
			onReservationDenied: args.onReservationDenied,
			workspaceId: args.workspaceId,
			videoId: args.requestId,
			providerId: args.providerId,
			model,
			seconds: seconds ?? null,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size: pricingSize,
				resolution: ir.resolution,
				quality,
				audio: requestObject.generate_audio ?? (model.startsWith("bytedance/seedance-") ? true : undefined),
				aspect_ratio: requestObject.ratio ?? requestObject.aspect_ratio,
				input_image_count: inputImageCount,
				input_video_count: inputVideoCount,
				input_video_seconds: ir.inputVideoDurationSeconds,
				input_audio_seconds: ir.inputAudioDurationSeconds,
			}),
			isByok: keyInfo.source === "byok",
		});
		reservationId = reserved.reservationId;
		reservationStatus = reserved.status;
		reservedNanos = reserved.amountNanos;
		if (reserved.status === "skip_missing_seconds_or_pricing") {
			reservationGateError = {
				status: 400,
				type: "missing_billing_dimensions",
				message: "Video duration seconds and pricing must be resolvable before submission.",
			};
		}
		if (reserved.amountNanos > 0 && !reserved.held && !isInsufficientVideoReservationStatus(reserved.status)) {
			reservationGateError = {
				status: 503,
				type: "reservation_not_held",
				message: `Unable to secure wallet reservation before provider submission (status=${reserved.status}).`,
			};
		}
	} catch (reserveErr) {
		console.error("atlascloud_video_reservation_failed_pre_submit", {
			error: reserveErr,
			workspaceId: args.workspaceId,
			requestId: args.requestId,
		});
		reservationGateError = {
			status: 503,
			type: "reservation_unavailable",
			message: "Unable to reserve credits for video generation.",
		};
	}

	const releaseReservationOnFailure = async () => {
		if (!reservationId) return;
		try {
			await releaseWalletReservation({
				workspaceId: args.workspaceId,
				reservationId,
				releaseRefId: args.requestId,
			});
		} catch (releaseErr) {
			console.error("atlascloud_video_reservation_release_failed", {
				error: releaseErr,
				workspaceId: args.workspaceId,
				requestId: args.requestId,
				reservationId,
			});
		}
	};

	if (isInsufficientVideoReservationStatus(reservationStatus)) {
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "insufficient_funds",
					message: "Insufficient available credits for video reservation hold.",
				},
			}),
			{ status: 402, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null as string | null,
			},
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}
	if (reservationGateError) {
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: reservationGateError.type,
					message: reservationGateError.message,
				},
			}),
			{ status: reservationGateError.status, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null as string | null,
			},
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.ATLAS_CLOUD_BASE_URL || DEFAULT_ATLASCLOUD_BASE_URL).replace(/\/+$/, "");
	const submissionMeta = {
		provider: args.providerId, requestId: args.requestId, model,
		seconds: seconds ?? null, resolution: pricingSize ?? null, quality,
		reservationId, reservedNanos, reservationStatus,
		keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
		webhook: ir.webhook as Record<string, unknown> | null,
		submissionState: "submitting" as const,
	};
	try {
		await saveVideoJobMeta(args.workspaceId, args.requestId, submissionMeta, null, "pending");
	} catch (error) {
		await releaseReservationOnFailure();
		throw error;
	}
	const markSubmissionUnknown = async () => {
		await setVideoJobStatus(args.workspaceId, args.requestId, "pending", { submissionState: "unknown" }).catch((error) => {
			console.error("atlascloud_video_submission_journal_update_failed", { requestId: args.requestId, error });
		});
	};

	let res: Response;
	try {
		res = await fetchUpstream(args, `${baseUrl}/api/v1/model/generateVideo`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${keyInfo.key}`,
				"Content-Type": "application/json",
			},
			body: requestBody,
		});
	} catch (fetchErr) {
		await markSubmissionUnknown();
		throw fetchErr;
	}

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id") ?? res.headers.get("request-id") ?? undefined,
		finish_reason: null as string | null,
	};

	if (!res.ok) {
		if (res.status >= 500 || res.status === 408) {
			await markSubmissionUnknown();
		} else {
			await releaseReservationOnFailure();
			await setVideoJobStatus(args.workspaceId, args.requestId, "failed", { submissionState: "rejected" });
		}
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
	const payload = extractAtlasPayload(json);
	const predictionId = extractAtlasPredictionId(json);
	const encodedId = predictionId ? encodeAtlasPredictionId(predictionId) : undefined;
	const status = toAtlasStatus(payload.status);
	if (!encodedId) {
		await markSubmissionUnknown();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "AtlasCloud video create response did not include a prediction id.",
				},
			}),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		);
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json,
		};
	}

	if (encodedId) {
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				submissionState: "accepted",
				provider: args.providerId,
				providerTaskId: predictionId ?? encodedId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: seconds ?? null,
				resolution: pricingSize ?? null,
				quality,
				audio: requestObject.generate_audio ?? (model.startsWith("bytedance/seedance-") ? true : undefined),
				aspectRatio: requestObject.ratio ?? requestObject.aspect_ratio,
				inputImageCount,
				inputVideoCount,
				inputVideoSeconds: ir.inputVideoDurationSeconds,
				inputAudioSeconds: ir.inputAudioDurationSeconds,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, predictionId ?? encodedId, status);
		} catch (error) {
			console.error("atlascloud_video_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				videoId: encodedId,
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "AtlasCloud",
				nativeVideoId: encodedId,
				reservationId,
				reservationStatus,
				bill,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				rawResponse: json,
			});
		}
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status,
		output: extractVideoOutput(payload),
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

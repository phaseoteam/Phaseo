// Purpose: Executor for bytedance-seed / video-generate.
// Why: Supports Seedance async video generation behind the OpenAI-style /v1/videos contract.
// How: Submits a provider task, stores encoded task IDs, and returns normalized queued IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import type { ProviderExecutor } from "../../types";

const DEFAULT_BYTEDANCE_BASE_URL = "https://ark.ap-southeast.bytepluses.com";
const BYTEDANCE_VIDEO_PREFIX = "bdvid_";

function encodeBytedanceTaskId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${BYTEDANCE_VIDEO_PREFIX}${b64}`;
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

function toBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return undefined;
}

function toVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "succeeded" || status === "success" || status === "completed" || status === "done") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "canceled" || status === "cancelled") {
		return "failed";
	}
	if (status === "running" || status === "processing" || status === "in_progress") {
		return "in_progress";
	}
	return "queued";
}

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	return toPositiveNumber(ir.durationSeconds) ??
		toPositiveNumber(ir.duration) ??
		toPositiveNumber(ir.seconds);
}

function extractBytedanceConfig(rawRequest: Record<string, any>): Record<string, any> {
	const fromConfig = rawRequest?.config?.bytedance;
	const fromByteplus = rawRequest?.config?.byteplus;
	const fromTopLevelBytedance = rawRequest?.bytedance;
	const fromTopLevelByteplus = rawRequest?.byteplus;
	const providerParams =
		rawRequest?.provider_params && typeof rawRequest.provider_params === "object" && !Array.isArray(rawRequest.provider_params)
			? rawRequest.provider_params
			: null;
	for (const candidate of [fromConfig, fromByteplus, fromTopLevelBytedance, fromTopLevelByteplus, providerParams]) {
		if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
			return candidate as Record<string, any>;
		}
	}
	return {};
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

function buildSeedanceRequest(ir: IRVideoGenerationRequest, model: string): Record<string, any> {
	const rawRequest = ((ir.rawRequest ?? {}) as Record<string, any>);
	const bytedanceConfig = extractBytedanceConfig(rawRequest);
	const passthroughRequest =
		bytedanceConfig.request && typeof bytedanceConfig.request === "object" && !Array.isArray(bytedanceConfig.request)
			? { ...(bytedanceConfig.request as Record<string, any>) }
			: {};

	if (Object.keys(passthroughRequest).length > 0) {
		if (passthroughRequest.model == null) passthroughRequest.model = model;
		if (passthroughRequest.prompt == null && passthroughRequest.input == null && passthroughRequest.content == null) {
			passthroughRequest.prompt = ir.prompt;
		}
		return passthroughRequest;
	}

	const duration = toPositiveNumber(
		bytedanceConfig.duration ??
		bytedanceConfig.duration_seconds ??
		bytedanceConfig.durationSeconds ??
		parseDurationSeconds(ir),
	);
	const ratio = toNonEmptyString(bytedanceConfig.ratio) ??
		toNonEmptyString(bytedanceConfig.aspect_ratio) ??
		toNonEmptyString(bytedanceConfig.aspectRatio) ??
		ir.aspectRatio ??
		ir.ratio;
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const seed = toPositiveNumber(bytedanceConfig.seed ?? ir.seed);
	const cameraFixed = toBoolean(bytedanceConfig.camera_fixed ?? bytedanceConfig.cameraFixed ?? ir.cameraFixed);
	const generateAudio = toBoolean(bytedanceConfig.generate_audio ?? bytedanceConfig.generateAudio ?? ir.generateAudio);
	const frameRate = toPositiveNumber(bytedanceConfig.frame_rate ?? bytedanceConfig.frameRate ?? ir.frameRate ?? ir.fps);

	const inputImage = normalizeInputSource(ir.inputImage ?? ir.input?.image ?? ir.inputReference);
	const inputVideo = normalizeInputSource(ir.inputVideo ?? ir.input?.video);
	const lastFrame = normalizeInputSource(ir.lastFrame ?? ir.input?.lastFrame);
	const referenceImages = normalizeReferenceImages(
		bytedanceConfig.reference_images ??
		bytedanceConfig.referenceImages ??
		ir.referenceImages ??
		ir.input?.referenceImages,
	);

	const parameters: Record<string, any> = {
		...(typeof duration === "number" ? { duration } : {}),
		...(ratio ? { ratio } : {}),
		...(size ? { size } : {}),
		...(typeof seed === "number" ? { seed } : {}),
		...(typeof cameraFixed === "boolean" ? { camera_fixed: cameraFixed } : {}),
		...(typeof generateAudio === "boolean" ? { generate_audio: generateAudio } : {}),
		...(typeof frameRate === "number" ? { frame_rate: frameRate } : {}),
		...(ir.negativePrompt ? { negative_prompt: ir.negativePrompt } : {}),
		...(lastFrame ? { last_frame: lastFrame } : {}),
		...(referenceImages ? { reference_images: referenceImages } : {}),
	};

	const content: Array<Record<string, any>> = [{ type: "text", text: ir.prompt }];
	if (inputImage) content.push({ type: "image_url", image_url: inputImage });
	if (inputVideo) content.push({ type: "video_url", video_url: inputVideo });

	return {
		model,
		content,
		...(Object.keys(parameters).length > 0 ? { parameters } : {}),
	};
}

function extractTaskId(json: any): string | undefined {
	const taskId = json?.id ??
		json?.task_id ??
		json?.taskId ??
		json?.data?.id ??
		json?.data?.task_id ??
		json?.data?.taskId ??
		json?.output?.task_id;
	if (taskId == null) return undefined;
	const normalized = String(taskId).trim();
	return normalized.length > 0 ? normalized : undefined;
}

function extractVideoOutput(json: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const direct =
		json?.content?.video_url ??
		json?.data?.content?.video_url ??
		json?.output?.video_url ??
		json?.data?.output?.video_url ??
		json?.video_url ??
		json?.result?.video_url;
	if (typeof direct === "string" && direct.length > 0) {
		return [{ index: 0, uri: direct, mime_type: "video/mp4" }];
	}
	const outputArray = Array.isArray(json?.output)
		? json.output
		: Array.isArray(json?.data?.output)
			? json.data.output
			: [];
	if (outputArray.length > 0) {
		return outputArray.map((item: any, index: number) => ({
			index,
			uri: item?.video_url ?? item?.url ?? item?.uri ?? null,
			mime_type: item?.mime_type ?? item?.mimeType ?? "video/mp4",
		}));
	}
	return [];
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "seedance-1-5-pro";
	const seconds = parseDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? null;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.BYTEDANCE_SEED_API_KEY;
		},
	);
	const requestObject = buildSeedanceRequest(ir, model);
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
			teamId: args.teamId,
			videoId: `req_${args.requestId}`,
			providerId: args.providerId,
			model,
			seconds: seconds ?? null,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: ir.resolution,
				quality,
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
		if (reserved.amountNanos > 0 && !reserved.held && reserved.status !== "insufficient_funds") {
			reservationGateError = {
				status: 503,
				type: "reservation_not_held",
				message: `Unable to secure wallet reservation before provider submission (status=${reserved.status}).`,
			};
		}
	} catch (reserveErr) {
		console.error("bytedance_video_reservation_failed_pre_submit", {
			error: reserveErr,
			teamId: args.teamId,
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
				teamId: args.teamId,
				reservationId,
				releaseRefId: args.requestId,
			});
		} catch (releaseErr) {
			console.error("bytedance_video_reservation_release_failed", {
				error: releaseErr,
				teamId: args.teamId,
				requestId: args.requestId,
				reservationId,
			});
		}
	};

	if (reservationStatus === "insufficient_funds") {
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
	const baseUrl = String(bindings.BYTEDANCE_SEED_BASE_URL || DEFAULT_BYTEDANCE_BASE_URL).replace(/\/+$/, "");

	let res: Response;
	try {
		res = await fetch(`${baseUrl}/api/v3/contents/generations/tasks`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${keyInfo.key}`,
				"Content-Type": "application/json",
			},
			body: requestBody,
		});
	} catch (fetchErr) {
		await releaseReservationOnFailure();
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
		await releaseReservationOnFailure();
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
	const encodedId = taskId ? encodeBytedanceTaskId(taskId) : undefined;
	const status = toVideoStatus(json?.status ?? json?.data?.status ?? json?.output?.status);
	if (encodedId) {
		try {
			await saveVideoJobMeta(args.teamId, args.requestId, {
				provider: args.providerId,
				providerTaskId: taskId ?? encodedId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: seconds ?? null,
				resolution: size ?? null,
				quality,
				outputAccess: ir.outputAccess ?? "bytes",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				createdAt: Date.now(),
			}, taskId ?? encodedId, status);
		} catch (error) {
			console.error("bytedance_video_job_meta_store_failed", {
				error,
				teamId: args.teamId,
				videoId: encodedId,
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
		}
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model,
		provider: args.providerId,
		status,
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

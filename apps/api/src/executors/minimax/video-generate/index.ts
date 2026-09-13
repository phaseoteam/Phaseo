// Purpose: Executor for minimax / video-generate.
// Why: Uses MiniMax native video APIs directly instead of relay providers.
// How: Submits async jobs to MiniMax V1 or V2 and returns normalized queued IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission, rejectVideoSubmission } from "@executors/_shared/video-submission";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { computeBill } from "@pipeline/pricing/engine";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";

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

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function extractImageReference(value: unknown): string | Blob | undefined {
	if (value instanceof Blob) return value;
	if (typeof value === "string") return toNonEmptyString(value);
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	if (typeof source.image_url === "string") return toNonEmptyString(source.image_url);
	if (source.image_url && typeof source.image_url === "object") {
		return toNonEmptyString((source.image_url as Record<string, unknown>).url);
	}
	return toNonEmptyString(source.url);
}

async function imageReferenceToString(value: unknown): Promise<string | undefined> {
	const extracted = extractImageReference(value);
	if (!(extracted instanceof Blob)) {
		if (typeof extracted === "string") {
			const dataUrl = extracted.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
			if (extracted.startsWith("data:") && !dataUrl) throw new Error("minimax_image_reference_format_unsupported");
			if (dataUrl) {
				const padding = dataUrl[2].endsWith("==") ? 2 : dataUrl[2].endsWith("=") ? 1 : 0;
				const byteLength = Math.floor(dataUrl[2].length * 3 / 4) - padding;
				if (byteLength > 20 * 1024 * 1024) throw new Error("minimax_image_reference_too_large");
			}
		}
		return extracted;
	}
	if (extracted.size > 20 * 1024 * 1024) throw new Error("minimax_image_reference_too_large");
	const mimeType = extracted.type || "image/jpeg";
	if (!/^image\/(?:jpeg|png|webp)$/i.test(mimeType)) throw new Error("minimax_image_reference_format_unsupported");
	const bytes = new Uint8Array(await extracted.arrayBuffer());
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return `data:${mimeType};base64,${btoa(binary)}`;
}

function miniMaxApplicationErrorStatus(code: number): number {
	if (code === 1004 || code === 2049) return 401;
	if (code === 1008) return 402;
	if (code === 1002 || code === 2056) return 429;
	if (code === 2013 || code === 1026 || code === 1027) return 400;
	return 502;
}

function normalizeMiniMaxResolutionForPricing(value: unknown): string | undefined {
	const raw = toNonEmptyString(value);
	if (!raw) return undefined;
	const pMatch = raw.match(/^(\d+)\s*p$/i);
	if (pMatch) return `${pMatch[1]}P`;
	return raw;
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
	if (status === "fail" || status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
		return "failed";
	}
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

function isMiniMaxImageToVideoOnlyModel(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized === "minimax-hailuo-2.3-fast" || normalized.endsWith("/hailuo-2.3-fast");
}

function isMiniMaxHailuo02(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized === "minimax-hailuo-02" || normalized.endsWith("/hailuo-02");
}

function isMiniMaxSubjectReferenceModel(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized === "s2v-01" || normalized.endsWith("/s2v-01");
}

function isMiniMaxHailuoV1(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized.includes("hailuo-2.3") || normalized.includes("hailuo-02");
}

function isMiniMaxV2Model(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized === "minimax-h3" || normalized.endsWith("/h3") ||
		normalized === "minimax-h3-max" || normalized.endsWith("/h3-max");
}

function canonicalMiniMaxV2Model(model: string): "MiniMax-H3" | "MiniMax-H3-Max" {
	return model.trim().toLowerCase().endsWith("h3-max") ? "MiniMax-H3-Max" : "MiniMax-H3";
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "video-01";
	const isV2 = isMiniMaxV2Model(model);
	const v2Model = isV2 ? canonicalMiniMaxV2Model(model) : null;
	const seconds = parseDurationSeconds(ir) ?? 6;
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution }) ??
		(isMiniMaxV2Model(model) ? "768P" : isMiniMaxHailuoV1(model) ? "768P" : "720P");
	const quality = ir.quality ?? null;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.MINIMAX_API_KEY;
		},
	);

	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const rawConfig =
		rawRequest.config && typeof rawRequest.config === "object" && !Array.isArray(rawRequest.config)
			? (rawRequest.config as Record<string, any>)
			: {};
	const minimaxExtensions = (
		ir.providerParams ??
		rawRequest.minimax ??
		rawConfig.minimax ??
		rawRequest.provider_params ??
		{}
	) as Record<string, any>;
	let mappedRequest: string | undefined;
	const passthroughRequest: Record<string, any> = {
		model,
		prompt: ir.prompt,
	};
	if (seconds != null) passthroughRequest.duration = seconds;
	if (passthroughRequest.resolution == null) {
		const resolution =
			toNonEmptyString(passthroughRequest.size) ??
			toNonEmptyString(passthroughRequest.resolution) ??
			size;
		if (resolution) passthroughRequest.resolution = normalizeMiniMaxResolutionForPricing(resolution);
	}
	if ("size" in passthroughRequest) delete passthroughRequest.size;
	if (typeof ir.enhancePrompt === "boolean") passthroughRequest.prompt_optimizer = ir.enhancePrompt;
	if (typeof minimaxExtensions.fast_pretreatment === "boolean") {
		passthroughRequest.fast_pretreatment = minimaxExtensions.fast_pretreatment;
	}
	if (isV2 && ("prompt_optimizer" in passthroughRequest || "fast_pretreatment" in passthroughRequest)) {
		const unsupportedOptions = [
			"prompt_optimizer" in passthroughRequest ? "prompt_optimizer" : null,
			"fast_pretreatment" in passthroughRequest ? "fast_pretreatment" : null,
		].filter((option): option is string => option !== null);
		const upstream = new Response(JSON.stringify({
			error: {
				type: "unsupported_option",
				message: `MiniMax V2 does not support ${unsupportedOptions.join(" or ")} on /v2/video_generation.`,
			},
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}
	try {
		const firstFrame = await imageReferenceToString(
			ir.inputReference ?? ir.inputImage ?? ir.input?.image ??
			ir.inputReferences?.find((entry) => entry.type === "image" && entry.role === "first_frame"),
		);
		if (firstFrame) passthroughRequest.first_frame_image = firstFrame;
		const lastFrame = await imageReferenceToString(
			ir.lastFrame ?? ir.input?.lastFrame ??
			ir.inputReferences?.find((entry) => entry.type === "image" && entry.role === "last_frame"),
		);
		if (lastFrame) passthroughRequest.last_frame_image = lastFrame;
	} catch (error) {
		const type = error instanceof Error ? error.message : "minimax_image_reference_invalid";
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream: new Response(JSON.stringify({ error: { type, message: "MiniMax image references must be JPG, PNG, or WebP and smaller than 20 MB." } }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	const subjectImages = (ir.inputReferences ?? [])
		.filter((entry) => entry.type === "image" && entry.role === "reference" && typeof entry.url === "string")
		.map((entry) => entry.url as string);
	const referenceMedia = (ir.inputReferences ?? [])
		.filter((entry) => (entry.type === "video" || entry.type === "audio") && entry.role === "reference" && typeof entry.url === "string")
		.map((entry) => ({ type: entry.type === "video" ? "video_url" : "audio_url", url: entry.url as string }));
	if (subjectImages.length > 0) {
		passthroughRequest.subject_reference = [{ type: "character", image: subjectImages }];
	}
	if (isMiniMaxImageToVideoOnlyModel(model) && !toNonEmptyString(passthroughRequest.first_frame_image)) {
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "input_reference_required",
					message: "MiniMax-Hailuo-2.3-Fast requires input_reference / first_frame_image.",
				},
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
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
	if (ir.prompt.length > (isV2 ? 7000 : 2000)) {
		const upstream = new Response(JSON.stringify({
				error: { type: "prompt_too_long", message: `MiniMax ${isV2 ? "V2" : "V1"} video prompts must not exceed ${isV2 ? 7000 : 2000} characters.` },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}
	const normalizedModel = model.trim().toLowerCase();
	const hasFrames = Boolean(passthroughRequest.first_frame_image || passthroughRequest.last_frame_image);
	const videoRefs = referenceMedia.filter((entry) => entry.type === "video_url");
	const audioRefs = referenceMedia.filter((entry) => entry.type === "audio_url");
	const hasReferences = subjectImages.length > 0 || referenceMedia.length > 0;
	const ratio = toNonEmptyString(minimaxExtensions.ratio) ?? ir.aspectRatio ?? ir.ratio;
	const validationError = isV2 ? (
		!Number.isInteger(seconds) || seconds < (v2Model === "MiniMax-H3-Max" ? 5 : 4) || seconds > 15 ? "Unsupported MiniMax H3 duration." :
		!(v2Model === "MiniMax-H3-Max" ? ["480P", "768P"] : ["768P", "2K"]).includes(String(size).toUpperCase()) ? "Unsupported MiniMax H3 resolution." :
		hasFrames && hasReferences ? "Frame images and reference media cannot be combined." :
		v2Model === "MiniMax-H3-Max" && hasReferences ? "MiniMax H3 Max does not support reference media." :
		subjectImages.length > 9 || videoRefs.length > 3 || audioRefs.length > 3 ? "MiniMax H3 reference media count exceeded." :
		videoRefs.length > 0 && (!(Number(ir.inputVideoDurationSeconds) >= videoRefs.length * 2) || Number(ir.inputVideoDurationSeconds) > 15) ? "Reference video duration must be provided and total at most 15 seconds." :
		audioRefs.length > 0 && (!(Number(ir.inputAudioDurationSeconds) >= audioRefs.length * 2) || Number(ir.inputAudioDurationSeconds) > 15) ? "Reference audio duration must be provided and total at most 15 seconds." :
		ratio && !["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(ratio) ? "Unsupported MiniMax H3 aspect ratio." :
		!hasFrames && !hasReferences && ratio === "adaptive" ? "Text-to-video requires a concrete aspect ratio." :
		(ir.sampleCount ?? ir.numberOfVideos ?? 1) !== 1 ? "MiniMax produces one video per request." : null
	) : referenceMedia.length > 0 ? "MiniMax V1 does not support reference video or audio." : null;
	if (validationError) return {
		kind: "completed", ir: undefined,
		bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
		upstream: new Response(JSON.stringify({ error: { type: "invalid_video_options", message: validationError } }), { status: 400, headers: { "Content-Type": "application/json" } }),
		keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
	};
	const normalizedResolution = String(passthroughRequest.resolution ?? "").toUpperCase();
	if (isMiniMaxHailuoV1(model) && !passthroughRequest.first_frame_image && !["768P", "1080P"].includes(normalizedResolution)) {
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream: new Response(JSON.stringify({ error: { type: "resolution_unsupported", message: "MiniMax Hailuo text-to-video supports 768P or 1080P; 512P requires an input image." } }), { status: 400, headers: { "Content-Type": "application/json" } }),
			keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
		};
	}
	if (isMiniMaxHailuoV1(model) && ![6, 10].includes(seconds)) {
		const upstream = new Response(JSON.stringify({
			error: { type: "duration_unsupported", message: "MiniMax Hailuo V1 video duration must be 6 or 10 seconds." },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest,
		};
	}
	if (isMiniMaxHailuoV1(model) && seconds === 10 && normalizedResolution === "1080P") {
		const upstream = new Response(JSON.stringify({
			error: { type: "resolution_duration_unsupported", message: "MiniMax Hailuo V1 supports 1080P only for 6-second videos." },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest,
		};
	}
	if (!isV2 && passthroughRequest.last_frame_image && normalizedResolution === "512P") {
		const upstream = new Response(JSON.stringify({
			error: { type: "last_frame_resolution_unsupported", message: "MiniMax first/last-frame generation does not support 512P." },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest,
		};
	}
	if (!isV2 && passthroughRequest.last_frame_image && !isMiniMaxHailuo02(model)) {
		const upstream = new Response(JSON.stringify({
			error: { type: "last_frame_model_unsupported", message: "MiniMax last-frame video generation requires MiniMax-Hailuo-02." },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest,
		};
	}
	if (!isV2 && passthroughRequest.last_frame_image && !passthroughRequest.first_frame_image) {
		const upstream = new Response(JSON.stringify({
			error: { type: "first_frame_required", message: "MiniMax last-frame generation also requires a first frame." },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest,
		};
	}
	if (!isV2 && subjectImages.length > 0 && !isMiniMaxSubjectReferenceModel(model)) {
		const upstream = new Response(JSON.stringify({
			error: { type: "subject_reference_model_unsupported", message: "MiniMax subject-reference generation requires S2V-01." },
		}), { status: 400, headers: { "Content-Type": "application/json" } });
		return {
			kind: "completed", ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest,
		};
	}
	const passthroughSeconds = toPositiveNumber(
		passthroughRequest.duration ??
		passthroughRequest.duration_seconds ??
		passthroughRequest.seconds ??
		passthroughRequest.video_params?.duration_seconds ??
		passthroughRequest.video_params?.seconds,
	);
	const secondsForBilling = seconds ?? passthroughSeconds ?? null;
	const inputImageCount = (passthroughRequest.first_frame_image ? 1 : 0) + (passthroughRequest.last_frame_image ? 1 : 0) + subjectImages.length;
	const inputVideoSeconds = toPositiveNumber(ir.inputVideoDurationSeconds) ??
		toPositiveNumber(minimaxExtensions.input_video_seconds) ??
		toPositiveNumber(minimaxExtensions.inputVideoSeconds);
	const inputAudioSeconds = toPositiveNumber(ir.inputAudioDurationSeconds) ??
		toPositiveNumber(minimaxExtensions.input_audio_seconds) ??
		toPositiveNumber(minimaxExtensions.inputAudioSeconds);
	const passthroughResolution =
		toNonEmptyString(passthroughRequest.resolution) ??
		toNonEmptyString(passthroughRequest.input_resolution) ??
		toNonEmptyString(passthroughRequest.video_params?.resolution) ??
		toNonEmptyString(passthroughRequest.video_params?.input_resolution);
	const resolutionForBilling = normalizeMiniMaxResolutionForPricing(size ?? passthroughResolution);
	const qualityForBilling =
		toNonEmptyString(quality) ??
		toNonEmptyString(passthroughRequest.quality) ??
		toNonEmptyString(passthroughRequest.video_params?.quality) ??
		null;

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
			seconds: secondsForBilling,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size: resolutionForBilling,
				resolution: ir.resolution,
				quality: qualityForBilling,
				seconds: secondsForBilling,
				input_image_count: inputImageCount,
				// Hold the documented input ceiling; settle actual provider usage later.
				input_video_seconds: isV2 && videoRefs.length > 0 ? 15 : inputVideoSeconds,
				input_audio_seconds: inputAudioSeconds,
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
		console.error("minimax_video_reservation_failed_pre_submit", {
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

	configureVideoSubmission(args, { model, seconds: secondsForBilling, resolution: resolutionForBilling, reservationId, reservedNanos, reservationStatus, keySource: keyInfo.source, byokKeyId: keyInfo.byokId });
	const releaseReservationOnFailure = async () => {
		if (!canReleaseVideoSubmission(args)) return;
		if (!reservationId) return;
		try {
			await releaseWalletReservation({
				workspaceId: args.workspaceId,
				reservationId,
				releaseRefId: args.requestId,
			});
		} catch (releaseErr) {
			console.error("minimax_video_reservation_release_failed", {
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
	const baseUrl = String(bindings.MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
	const v2Ratio = toNonEmptyString(minimaxExtensions.ratio) ?? toNonEmptyString(ir.aspectRatio) ?? toNonEmptyString(ir.ratio);
	const v2Content: Array<Record<string, unknown>> = [{ type: "text", text: ir.prompt }];
	if (isV2) {
		if (passthroughRequest.first_frame_image) v2Content.push({ type: "image_url", image_url: { url: passthroughRequest.first_frame_image }, role: "first_frame" });
		if (passthroughRequest.last_frame_image) v2Content.push({ type: "image_url", image_url: { url: passthroughRequest.last_frame_image }, role: "last_frame" });
		for (const image of subjectImages) v2Content.push({ type: "image_url", image_url: { url: image }, role: "reference_image" });
		for (const media of referenceMedia) v2Content.push({ type: media.type, [media.type]: { url: media.url }, role: media.type === "video_url" ? "reference_video" : "reference_audio" });
	}
	const requestPayload = isV2
		? {
			model: v2Model,
			content: v2Content,
			resolution: String(size).toUpperCase(),
			duration: seconds,
			ratio: hasFrames ? "adaptive" : v2Ratio ?? (hasReferences ? "adaptive" : "16:9"),
			...(toNonEmptyString(ir.callbackUrl) ? { callback_url: ir.callbackUrl } : {}),
		}
		: passthroughRequest;
	const requestBody = JSON.stringify(requestPayload);
	mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	let res: Response;
	try {
		res = await fetchUpstream(args, `${baseUrl}/${isV2 ? "v2" : "v1"}/video_generation`, {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${keyInfo.key}`,
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
	const applicationCode = Number(json?.base_resp?.status_code ?? 0);
	if (Number.isFinite(applicationCode) && applicationCode !== 0) {
		if (miniMaxApplicationErrorStatus(applicationCode) < 500) await rejectVideoSubmission(args);
		await releaseReservationOnFailure();
		const upstream = new Response(JSON.stringify({
			error: {
				type: "minimax_api_error",
				code: applicationCode,
				message: String(json?.base_resp?.status_msg ?? "MiniMax video generation failed."),
			},
		}), {
			status: miniMaxApplicationErrorStatus(applicationCode),
			headers: { "Content-Type": "application/json" },
		});
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
	const taskId = extractTaskId(json);
	const encodedId = taskId ? encodeMiniMaxVideoId(taskId) : undefined;
	if (!encodedId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "MiniMax video create response did not include a task id.",
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
				provider: args.providerId,
				providerTaskId: taskId ?? encodedId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: secondsForBilling,
				inputImageCount,
				inputVideoSeconds: inputVideoSeconds ?? null,
				inputAudioSeconds: inputAudioSeconds ?? null,
				resolution: resolutionForBilling ?? null,
				quality: qualityForBilling,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, taskId ?? encodedId, toVideoStatus(json?.status ?? json?.task_status ?? json?.data?.status));
		} catch (error) {
			console.error("minimax_video_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				videoId: encodedId,
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "MiniMax",
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

	// Async create requests should only bill request metering.
	// Completion-duration billing is finalized by webhook/reconciliation workers.
	const usageMeters: Record<string, number> = {
		requests: 1,
	};
	if (args.pricingCard) {
		const priced = computeBill(usageMeters, args.pricingCard, { model });
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	} else {
		bill.usage = usageMeters;
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
			...(secondsForBilling != null ? { output_video_seconds: secondsForBilling } : {}),
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

// Purpose: Executor for Alibaba Cloud video-generate.
// Why: Enables Wan video create flow through IR -> DashScope -> IR.
// How: Submits async task, returns queued response with encoded task identifier.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission } from "@executors/_shared/video-submission";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { computeBill } from "@pipeline/pricing/engine";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import type { ProviderExecutor } from "../../types";

const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com";
const DASHSCOPE_TASK_PREFIX = "dscope_";
const WAN30_MAX_REFERENCE_VIDEO_SECONDS = 15;

function encodeDashscopeTaskId(taskId: string): string {
	const b64 = btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${DASHSCOPE_TASK_PREFIX}${b64}`;
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

function extractAlibabaConfig(
	rawRequest: Record<string, any>,
	providerParams?: Record<string, any>,
): Record<string, any> {
	const fromConfig = rawRequest?.config?.alibaba;
	const fromTopLevel = rawRequest?.alibaba;
	const fromRawProviderParams =
		rawRequest?.provider_params && typeof rawRequest.provider_params === "object" && !Array.isArray(rawRequest.provider_params)
			? rawRequest.provider_params
			: null;
	for (const candidate of [providerParams, fromConfig, fromTopLevel, fromRawProviderParams]) {
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

function normalizeWanModel(value: string): string {
	const normalized = value.trim();
	return normalized.includes("/") ? normalized.split("/").pop() || normalized : normalized;
}

function isWan27Model(model: string): boolean {
	return /^wan2\.7(?:-|$)/i.test(model);
}

function isWan30Model(model: string): boolean {
	return /^wan3\.0-video(?:-prime)?$/i.test(model);
}

type HappyHorseMode = "t2v" | "i2v" | "r2v" | "video-edit";

type AlibabaVideoAsset = {
	type: "image" | "video" | "audio" | "mask";
	role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
	url: string;
};

class InvalidAlibabaVideoRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidAlibabaVideoRequestError";
	}
}

function happyHorseFamily(model: string): "1.0" | "1.1" | null {
	const match = model.match(/^happyhorse-(1\.[01])(?:-(?:t2v|i2v|r2v|video-edit))?$/i);
	return match?.[1] === "1.0" || match?.[1] === "1.1" ? match[1] : null;
}

function explicitHappyHorseMode(model: string): HappyHorseMode | null {
	const match = model.match(/-(t2v|i2v|r2v|video-edit)$/i);
	return (match?.[1]?.toLowerCase() as HappyHorseMode | undefined) ?? null;
}

function normalizeHappyHorseMode(value: unknown): HappyHorseMode | null {
	const normalized = String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
	if (normalized === "text-to-video") return "t2v";
	if (normalized === "image-to-video") return "i2v";
	if (normalized === "reference-to-video") return "r2v";
	if (normalized === "edit") return "video-edit";
	return normalized === "t2v" || normalized === "i2v" || normalized === "r2v" || normalized === "video-edit"
		? normalized
		: null;
}

function addAlibabaVideoAsset(
	assets: AlibabaVideoAsset[],
	seen: Set<string>,
	type: AlibabaVideoAsset["type"],
	role: AlibabaVideoAsset["role"],
	value: unknown,
): void {
	const url = normalizeInputSource(value);
	if (!url) return;
	const key = `${type}:${role ?? ""}:${url}`;
	if (seen.has(key)) return;
	seen.add(key);
	assets.push({ type, role, url });
}

function collectAlibabaVideoAssets(ir: IRVideoGenerationRequest): AlibabaVideoAsset[] {
	const assets: AlibabaVideoAsset[] = [];
	const seen = new Set<string>();
	for (const reference of ir.inputReferences ?? []) {
		addAlibabaVideoAsset(
			assets,
			seen,
			reference.type,
			reference.role ?? (reference.type === "video" ? "source" : undefined),
			reference.url ?? reference.raw,
		);
	}
	addAlibabaVideoAsset(assets, seen, "image", "first_frame", ir.inputReference ?? ir.inputImage ?? ir.input?.image);
	addAlibabaVideoAsset(assets, seen, "image", "last_frame", ir.lastFrame ?? ir.input?.lastFrame);
	addAlibabaVideoAsset(assets, seen, "video", "source", ir.inputVideo ?? ir.input?.video);
	for (const reference of [...(ir.referenceImages ?? []), ...(ir.input?.referenceImages ?? [])]) {
		addAlibabaVideoAsset(
			assets,
			seen,
			"image",
			"reference",
			reference.image ?? reference.url ?? reference.uri ?? reference,
		);
	}
	return assets;
}

function normalizeHappyHorseResolution(value: unknown): "720P" | "1080P" | undefined {
	const resolution = normalizeWanResolution(value);
	return resolution === "720P" || resolution === "1080P" ? resolution : undefined;
}

function resolveHappyHorseMode(
	model: string,
	assets: AlibabaVideoAsset[],
	config: Record<string, any>,
): HappyHorseMode {
	const modelMode = explicitHappyHorseMode(model);
	const configuredMode = normalizeHappyHorseMode(config.mode ?? config.operation ?? config.task);
	if ((config.mode ?? config.operation ?? config.task) != null && !configuredMode) {
		throw new InvalidAlibabaVideoRequestError("Unsupported HappyHorse mode. Use t2v, i2v, r2v, or video-edit.");
	}
	if (modelMode && configuredMode && modelMode !== configuredMode) {
		throw new InvalidAlibabaVideoRequestError(`HappyHorse mode ${configuredMode} conflicts with model ${model}.`);
	}
	if (modelMode ?? configuredMode) return (modelMode ?? configuredMode)!;
	if (assets.some((asset) => asset.type === "video")) return "video-edit";
	if (assets.some((asset) => asset.type === "image" && asset.role === "reference")) return "r2v";
	if (assets.some((asset) => asset.type === "image")) return "i2v";
	return "t2v";
}

function happyHorseRequest(
	ir: IRVideoGenerationRequest,
	model: string,
	config: Record<string, any>,
): {
	request: Record<string, unknown>;
	mode: HappyHorseMode;
	seconds: number;
	resolution: "720P" | "1080P";
	inputVideoSeconds?: number;
} {
	const family = happyHorseFamily(model);
	if (!family) throw new InvalidAlibabaVideoRequestError(`Unsupported HappyHorse model: ${model}.`);
	const assets = collectAlibabaVideoAssets(ir);
	const mode = resolveHappyHorseMode(model, assets, config);
	if (family === "1.1" && mode === "video-edit") {
		throw new InvalidAlibabaVideoRequestError("HappyHorse 1.1 does not support video editing; use alibaba/happyhorse-1.0.");
	}
	if (assets.some((asset) => asset.type === "audio" || asset.type === "mask")) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse accepts image and video references only.");
	}
	if (assets.some((asset) => asset.role === "last_frame")) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse does not support last-frame conditioning.");
	}
	if (ir.negativePrompt) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse does not support negative_prompt.");
	}
	if (ir.generateAudio === false) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse always generates audio and cannot disable it.");
	}
	const suppliedSeconds = toDurationSeconds(ir);
	if (suppliedSeconds != null && (!Number.isInteger(suppliedSeconds) || suppliedSeconds < 3 || suppliedSeconds > 15)) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse duration must be an integer from 3 to 15 seconds.");
	}
	let seconds = suppliedSeconds ?? 5;
	let inputVideoSeconds: number | undefined;
	if (mode === "video-edit") {
		inputVideoSeconds = ir.inputVideoDurationSeconds;
		if (inputVideoSeconds == null || !Number.isFinite(inputVideoSeconds) || inputVideoSeconds < 3 || inputVideoSeconds > 60) {
			throw new InvalidAlibabaVideoRequestError(
				"input_video_duration is required for HappyHorse video editing and must be from 3 to 60 seconds.",
			);
		}
		const derivedOutputSeconds = Math.min(Math.floor(inputVideoSeconds), 15);
		if (suppliedSeconds != null && suppliedSeconds !== derivedOutputSeconds) {
			throw new InvalidAlibabaVideoRequestError(
				`HappyHorse edit duration must equal min(input_video_duration, 15), which is ${derivedOutputSeconds} seconds.`,
			);
		}
		seconds = derivedOutputSeconds;
	}
	const requestedResolution = config.resolution ?? ir.resolution ?? ir.size;
	const resolution = normalizeHappyHorseResolution(requestedResolution) ?? (requestedResolution == null ? "1080P" : undefined);
	if (!resolution) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse resolution must be 720P or 1080P.");
	}
	const ratio = toNonEmptyString(config.ratio) ?? ir.aspectRatio ?? ir.ratio;
	const allowedRatios = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"]);
	if (ratio && !allowedRatios.has(ratio)) {
		throw new InvalidAlibabaVideoRequestError(`Unsupported HappyHorse aspect ratio: ${ratio}.`);
	}
	if (ratio && (mode === "i2v" || mode === "video-edit")) {
		throw new InvalidAlibabaVideoRequestError(`aspect_ratio is not supported for HappyHorse ${mode}.`);
	}
	if (ir.seed != null && (ir.seed < 0 || ir.seed > 2_147_483_647)) {
		throw new InvalidAlibabaVideoRequestError("HappyHorse seed must be between 0 and 2147483647.");
	}
	const watermark = config.watermark;
	if (watermark != null && typeof watermark !== "boolean") {
		throw new InvalidAlibabaVideoRequestError("HappyHorse watermark must be a boolean.");
	}
	const firstFrames = assets.filter((asset) => asset.type === "image" && asset.role === "first_frame");
	const references = assets.filter((asset) => asset.type === "image" && asset.role === "reference");
	const sourceVideos = assets.filter((asset) => asset.type === "video");
	let media: Array<Record<string, string>> = [];
	if (mode === "t2v") {
		if (assets.length > 0) throw new InvalidAlibabaVideoRequestError("HappyHorse t2v does not accept input references.");
	} else if (mode === "i2v") {
		if (firstFrames.length !== 1 || references.length > 0 || sourceVideos.length > 0) {
			throw new InvalidAlibabaVideoRequestError("HappyHorse i2v requires exactly one first_frame image and no other references.");
		}
		media = [{ type: "first_frame", url: firstFrames[0]!.url }];
	} else if (mode === "r2v") {
		if (references.length < 1 || references.length > 9 || firstFrames.length > 0 || sourceVideos.length > 0) {
			throw new InvalidAlibabaVideoRequestError("HappyHorse r2v requires 1 to 9 reference images and no frame or video inputs.");
		}
		media = references.map((asset) => ({ type: "reference_image", url: asset.url }));
	} else {
		if (sourceVideos.length !== 1 || firstFrames.length > 0 || references.length > 5) {
			throw new InvalidAlibabaVideoRequestError("HappyHorse video editing requires exactly one source video and up to 5 reference images.");
		}
		media = [
			{ type: "video", url: sourceVideos[0]!.url },
			...references.map((asset) => ({ type: "reference_image", url: asset.url })),
		];
	}
	const audioSetting = toNonEmptyString(config.audio_setting);
	if (audioSetting && mode !== "video-edit") {
		throw new InvalidAlibabaVideoRequestError("audio_setting is only supported for HappyHorse video editing.");
	}
	if (audioSetting && audioSetting !== "auto" && audioSetting !== "origin") {
		throw new InvalidAlibabaVideoRequestError("HappyHorse audio_setting must be auto or origin.");
	}
	const upstreamModel = `happyhorse-${family}-${mode}`;
	return {
		mode,
		seconds,
		resolution,
		...(inputVideoSeconds != null ? { inputVideoSeconds } : {}),
		request: {
			model: upstreamModel,
			input: {
				prompt: ir.prompt,
				...(media.length > 0 ? { media } : {}),
			},
			parameters: {
				...(mode === "video-edit" ? {} : { duration: seconds }),
				resolution,
				...(ratio && mode !== "i2v" && mode !== "video-edit" ? { ratio } : {}),
				...(typeof watermark === "boolean" ? { watermark } : {}),
				...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
				...(audioSetting ? { audio_setting: audioSetting } : {}),
			},
		},
	};
}

function normalizeWanResolution(value: unknown): "480P" | "720P" | "1080P" | undefined {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === "480p" || normalized === "720p" || normalized === "1080p") {
		return normalized.toUpperCase() as "480P" | "720P" | "1080P";
	}
	const dimensions = normalized.match(/^(\d{3,4})x(\d{3,4})$/);
	if (!dimensions) return undefined;
	const shortEdge = Math.min(Number(dimensions[1]), Number(dimensions[2]));
	if (shortEdge >= 1080) return "1080P";
	if (shortEdge >= 720) return "720P";
	return "480P";
}

function buildWan27Media(ir: IRVideoGenerationRequest, inputImage?: string): Array<Record<string, string>> {
	const media: Array<Record<string, string>> = [];
	const seen = new Set<string>();
	for (const reference of ir.inputReferences ?? []) {
		if (reference.type !== "image" && reference.type !== "video") continue;
		const url = normalizeInputSource(reference.url ?? reference.raw);
		if (!url || seen.has(url)) continue;
		seen.add(url);
		const type = reference.type === "video"
			? "first_clip"
			: reference.role === "last_frame"
				? "last_frame"
				: reference.role === "reference"
					? "reference_image"
					: "first_frame";
		media.push({ type, url });
	}
	const inputVideo = normalizeInputSource(ir.inputVideo ?? ir.input?.video);
	if (inputVideo && !seen.has(inputVideo)) {
		seen.add(inputVideo);
		media.push({ type: "first_clip", url: inputVideo });
	}
	if (inputImage && !seen.has(inputImage)) media.push({ type: "first_frame", url: inputImage });
	return media;
}

type Wan30MediaType = "first_frame" | "last_frame" | "reference_image" | "reference_video" | "reference_audio";

function addWan30Media(
	media: Array<Record<string, string>>,
	seen: Set<string>,
	type: Wan30MediaType,
	value: unknown,
): void {
	const url = normalizeInputSource(value);
	if (!url) return;
	const key = `${type}:${url}`;
	if (seen.has(key)) return;
	seen.add(key);
	media.push({ type, url });
}

function buildWan30Media(ir: IRVideoGenerationRequest, inputImage?: string): Array<Record<string, string>> {
	const media: Array<Record<string, string>> = [];
	const seen = new Set<string>();
	for (const reference of ir.inputReferences ?? []) {
		if (reference.type === "audio") {
			addWan30Media(media, seen, "reference_audio", reference.url ?? reference.raw);
			continue;
		}
		if (reference.type === "video") {
			addWan30Media(media, seen, "reference_video", reference.url ?? reference.raw);
			continue;
		}
		if (reference.type !== "image") continue;
		const type = reference.role === "first_frame"
			? "first_frame"
			: reference.role === "last_frame"
				? "last_frame"
				: "reference_image";
		addWan30Media(media, seen, type, reference.url ?? reference.raw);
	}
	addWan30Media(media, seen, "first_frame", inputImage);
	addWan30Media(media, seen, "last_frame", ir.lastFrame ?? ir.input?.lastFrame);
	addWan30Media(media, seen, "reference_video", ir.inputVideo ?? ir.input?.video);
	for (const reference of ir.referenceImages ?? []) {
		addWan30Media(media, seen, "reference_image", reference.image ?? reference.url ?? reference.uri ?? reference);
	}
	return media;
}

function wan30Request(
	ir: IRVideoGenerationRequest,
	model: string,
	config: Record<string, any>,
): { request: Record<string, unknown>; seconds: number; resolution: "480P" | "720P" | "1080P"; inputVideoSeconds?: number } {
	const inputImage = normalizeInputSource(
		config.img_url ?? config.image_url ?? ir.inputReference ?? ir.inputImage ?? ir.input?.image,
	);
	const media = buildWan30Media(ir, inputImage);
	const firstFrames = media.filter((entry) => entry.type === "first_frame");
	const lastFrames = media.filter((entry) => entry.type === "last_frame");
	const referenceImages = media.filter((entry) => entry.type === "reference_image");
	const referenceVideos = media.filter((entry) => entry.type === "reference_video");
	const referenceAudio = media.filter((entry) => entry.type === "reference_audio");
	const hasFrameConditioning = firstFrames.length > 0 || lastFrames.length > 0;
	const hasReferenceConditioning = referenceImages.length > 0 || referenceVideos.length > 0 || referenceAudio.length > 0;

	if (firstFrames.length > 1 || lastFrames.length > 1) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 accepts at most one first_frame and one last_frame image.");
	}
	if (hasFrameConditioning && hasReferenceConditioning) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 first/last-frame inputs cannot be combined with reference media.");
	}
	if (referenceImages.length > 10 || referenceVideos.length > 5 || referenceAudio.length > 5 || media.length > 20) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 supports at most 10 reference images, 5 reference videos, 5 reference audios, and 20 total media items.");
	}
	if (ir.negativePrompt) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 does not document support for negative_prompt.");
	}

	const requestedSeconds = toDurationSeconds(ir);
	const seconds = requestedSeconds ?? 5;
	if (!Number.isInteger(seconds) || seconds < 2 || seconds > 30) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 duration must be an integer from 2 to 30 seconds.");
	}
	const resolutionInput = config.resolution ?? ir.resolution ?? ir.size;
	const resolution = resolutionInput == null ? "1080P" : normalizeWanResolution(resolutionInput);
	if (!resolution) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 resolution must be 480P, 720P, or 1080P.");
	}
	const ratio = toNonEmptyString(config.ratio) ?? ir.aspectRatio ?? ir.ratio;
	const allowedRatios = new Set(["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"]);
	if (ratio && !allowedRatios.has(ratio)) {
		throw new InvalidAlibabaVideoRequestError(`Unsupported Wan 3.0 aspect ratio: ${ratio}.`);
	}
	const requestedInputVideoSeconds = ir.inputVideoDurationSeconds;
	if (referenceVideos.length > 0) {
		if (requestedInputVideoSeconds == null || !Number.isFinite(requestedInputVideoSeconds) || requestedInputVideoSeconds <= 0 || requestedInputVideoSeconds > WAN30_MAX_REFERENCE_VIDEO_SECONDS) {
			throw new InvalidAlibabaVideoRequestError("input_video_duration is required for Wan 3.0 reference video input and must be at most 15 seconds.");
		}
		if (requestedInputVideoSeconds + seconds > 30) {
			throw new InvalidAlibabaVideoRequestError("Wan 3.0 input and output video duration cannot exceed 30 seconds in total.");
		}
	}
	// DashScope does not return authoritative reference-video duration in the
	// async result. Never use the caller's duration claim for billing; reserve
	// the maximum billable input duration for every reference-video request.
	const inputVideoSeconds = referenceVideos.length > 0
		? WAN30_MAX_REFERENCE_VIDEO_SECONDS
		: requestedInputVideoSeconds;
	if (ir.seed != null && (ir.seed < 0 || ir.seed > 2_147_483_647)) {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 seed must be between 0 and 2147483647.");
	}
	const audio = typeof config.audio === "boolean" ? config.audio : ir.generateAudio;
	const promptExtend = typeof config.prompt_extend === "boolean" ? config.prompt_extend : ir.enhancePrompt;
	const watermark = config.watermark;
	if (watermark != null && typeof watermark !== "boolean") {
		throw new InvalidAlibabaVideoRequestError("Wan 3.0 watermark must be a boolean.");
	}
	return {
		seconds,
		resolution,
		...(inputVideoSeconds != null ? { inputVideoSeconds } : {}),
		request: {
			model,
			input: {
				...(ir.prompt ? { prompt: ir.prompt } : {}),
				...(media.length > 0 ? { media } : {}),
			},
			parameters: {
				resolution,
				...(ratio ? { ratio } : {}),
				duration: seconds,
				...(typeof audio === "boolean" ? { audio } : {}),
				...(typeof promptExtend === "boolean" ? { prompt_extend: promptExtend } : {}),
				...(typeof watermark === "boolean" ? { watermark } : {}),
				...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
				...(toNonEmptyString(config.callback_url) ? { callback_url: config.callback_url } : {}),
			},
		},
	};
}

function firstAudioReference(ir: IRVideoGenerationRequest): string | undefined {
	const reference = ir.inputReferences?.find((entry) => entry.type === "audio");
	return normalizeInputSource(reference?.url ?? reference?.raw);
}

function countImageReferences(value: unknown): number {
	if (value == null) return 0;
	if (typeof value === "string") return value.trim().length > 0 ? 1 : 0;
	if (Array.isArray(value)) {
		return value.reduce((sum, item) => sum + countImageReferences(item), 0);
	}
	if (typeof value === "object") {
		const asRecord = value as Record<string, unknown>;
		if (normalizeInputSource(asRecord) != null) return 1;
		if (typeof asRecord.url === "string" && asRecord.url.trim().length > 0) return 1;
		if (typeof asRecord.uri === "string" && asRecord.uri.trim().length > 0) return 1;
	}
	return 0;
}

function resolveWanInputImageCount(requestObject: Record<string, unknown>): number {
	const input =
		requestObject.input && typeof requestObject.input === "object" && !Array.isArray(requestObject.input)
			? (requestObject.input as Record<string, unknown>)
			: {};
	const fromInput =
		countImageReferences(input.img_url) +
		countImageReferences(input.image_url) +
		countImageReferences(input.image) +
		countImageReferences(input.images);
	const fromMedia = Array.isArray(input.media)
		? input.media.filter((entry) => {
			const type = String((entry as Record<string, unknown>)?.type ?? "").toLowerCase();
			return type === "first_frame" || type === "last_frame" || type === "reference_image";
		}).length
		: 0;
	const fromContent = Array.isArray(requestObject.content)
		? requestObject.content.reduce((sum, part) => {
			if (!part || typeof part !== "object" || Array.isArray(part)) return sum;
			const entry = part as Record<string, unknown>;
			const type = String(entry.type ?? "").toLowerCase();
			if (type === "image_url" || type === "image") {
				return sum + countImageReferences(entry.image_url ?? entry.image ?? entry.url ?? entry.uri);
			}
			return sum;
		}, 0)
		: 0;
	return Math.max(0, fromInput + fromMedia + fromContent);
}

function irToAlibabaVideoRequest(ir: IRVideoGenerationRequest, model: string): any {
	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const alibabaConfig = extractAlibabaConfig(rawRequest, ir.providerParams);
	if (happyHorseFamily(model)) return happyHorseRequest(ir, model, alibabaConfig).request;
	if (isWan30Model(model)) return wan30Request(ir, model, alibabaConfig).request;
	const seconds = toDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const ratio = toNonEmptyString(alibabaConfig.ratio) ?? ir.aspectRatio ?? ir.ratio;
	const inputImage = normalizeInputSource(
		alibabaConfig.img_url ??
		alibabaConfig.image_url ??
		ir.inputReference ??
		ir.inputImage ??
		ir.input?.image,
	);
	if (isWan27Model(model)) {
		const media = buildWan27Media(ir, inputImage);
		const resolution = normalizeWanResolution(alibabaConfig.resolution ?? ir.resolution ?? ir.size);
		const audioUrl = toNonEmptyString(alibabaConfig.audio_url) ?? firstAudioReference(ir);
		return {
			model,
			input: {
				prompt: ir.prompt,
				...(ir.negativePrompt ? { negative_prompt: ir.negativePrompt } : {}),
				...(audioUrl ? { audio_url: audioUrl } : {}),
				...(media.length > 0 ? { media } : {}),
			},
			parameters: {
				...(typeof seconds === "number" ? { duration: seconds } : {}),
				...(resolution ? { resolution } : {}),
				...(ratio ? { ratio } : {}),
				...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
				...(toNonEmptyString(alibabaConfig.callback_url) ? { callback_url: alibabaConfig.callback_url } : {}),
			},
		};
	}
	return {
		model,
		input: {
			prompt: ir.prompt,
			...(ir.negativePrompt ? { negative_prompt: ir.negativePrompt } : {}),
			...(inputImage ? { img_url: inputImage } : {}),
		},
		parameters: {
			...(typeof seconds === "number" ? { duration: seconds } : {}),
			...(size ? { size } : {}),
			...(ratio ? { ratio } : {}),
			...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
			...(toNonEmptyString(alibabaConfig.callback_url) ? { callback_url: alibabaConfig.callback_url } : {}),
		},
	};
}

function wanToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRVideoGenerationResponse {
	const taskId = json?.output?.task_id ?? json?.task_id ?? json?.id ?? null;
	const usage: any = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};

	return {
		id: requestId,
		nativeId: taskId ? encodeDashscopeTaskId(String(taskId)) : undefined,
		model,
		provider,
		status: "queued",
		result: {
			task_id: taskId ?? undefined,
			dashscope: json,
		},
		usage,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = normalizeWanModel(args.providerModelSlug || ir.model || "wan2.2-t2v-plus");
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.ALIBABA_CLOUD_API_KEY || bindings.DASHSCOPE_API_KEY,
	);
	const baseUrl = (bindings.ALIBABA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
	let requestObject: Record<string, unknown>;
	let happyHorse: ReturnType<typeof happyHorseRequest> | null = null;
	let wan30: ReturnType<typeof wan30Request> | null = null;
	try {
		if (happyHorseFamily(model)) {
			happyHorse = happyHorseRequest(
				ir,
				model,
				extractAlibabaConfig((ir.rawRequest ?? {}) as Record<string, any>, ir.providerParams),
			);
			requestObject = happyHorse.request;
		} else if (isWan30Model(model)) {
			wan30 = wan30Request(
				ir,
				model,
				extractAlibabaConfig((ir.rawRequest ?? {}) as Record<string, any>, ir.providerParams),
			);
			requestObject = wan30.request;
		} else {
			requestObject = irToAlibabaVideoRequest(ir, model);
		}
	} catch (error) {
		if (!(error instanceof InvalidAlibabaVideoRequestError)) throw error;
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null,
			},
			upstream: new Response(JSON.stringify({ error: { type: "invalid_request", message: error.message } }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	const inputImageCount = resolveWanInputImageCount(requestObject as Record<string, unknown>);
	const inputVideoCount = Array.isArray((requestObject.input as Record<string, unknown> | undefined)?.media)
		? ((requestObject.input as Record<string, unknown>).media as Array<Record<string, unknown>>)
			.filter((entry) => entry.type === "video" || entry.type === "first_clip" || entry.type === "reference_video").length
		: 0;
	const requestBody = JSON.stringify(requestObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const requestedSeconds = happyHorse?.seconds ?? wan30?.seconds ?? toDurationSeconds(ir) ?? null;
	const size = happyHorse?.resolution ?? wan30?.resolution ?? resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const inputVideoSeconds = happyHorse?.inputVideoSeconds ?? wan30?.inputVideoSeconds;
	const quality = ir.quality ?? null;
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
			model: ir.model,
			seconds: requestedSeconds,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: size,
				quality,
				input_image_count: inputImageCount,
				input_video_count: inputVideoCount,
				input_video_seconds: inputVideoSeconds,
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
		console.error("wan_video_reservation_failed_pre_submit", {
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

	configureVideoSubmission(args, { model, reservationId, reservedNanos, reservationStatus, keySource: keyInfo.source, byokKeyId: keyInfo.byokId });
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
			console.error("wan_video_reservation_release_failed", {
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

	let res: Response;
	try {
		res = await fetchUpstream(args, `${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${keyInfo.key}`,
				"Content-Type": "application/json",
				"X-DashScope-Async": "enable",
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
		upstream_id:
			res.headers.get("x-request-id") ??
			res.headers.get("x-dashscope-request-id") ??
			undefined,
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
	const irResponse = wanToIR(json, args.requestId, ir.model, args.providerId);
	const usageMeters: Record<string, number> = {
		requests: 1,
	};
	if (args.pricingCard) {
		const priced = computeBill(usageMeters, args.pricingCard, { model: ir.model });
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	} else {
		bill.usage = usageMeters;
	}
	irResponse.usage = {
		...(irResponse.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
		requests: 1,
		...(requestedSeconds != null ? { output_video_seconds: requestedSeconds } : {}),
		...(inputImageCount > 0 ? { input_image_count: inputImageCount } : {}),
		...(inputVideoCount > 0 ? { input_video_count: inputVideoCount } : {}),
		...(inputVideoSeconds != null ? { input_video_seconds: inputVideoSeconds } : {}),
	} as any;
	if (!irResponse.nativeId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "Alibaba video create response did not include a task id.",
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
	if (irResponse.nativeId) {
		const taskId =
			typeof json?.output?.task_id === "string"
				? json.output.task_id
				: typeof json?.task_id === "string"
					? json.task_id
					: typeof json?.id === "string"
						? json.id
						: String(irResponse.nativeId);
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: taskId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model: ir.model,
				seconds: requestedSeconds,
				resolution: size ?? null,
				quality,
				inputImageCount,
				inputVideoCount,
				inputVideoSeconds: inputVideoSeconds ?? null,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, taskId, irResponse.status);
		} catch (err) {
			console.error("wan_video_job_meta_store_failed", {
				error: err,
				workspaceId: args.workspaceId,
				videoId: String(irResponse.nativeId),
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "Alibaba",
				nativeVideoId: String(irResponse.nativeId),
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

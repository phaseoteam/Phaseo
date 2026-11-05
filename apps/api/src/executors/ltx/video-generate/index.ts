// Purpose: Executor for LTX async text-to-video, image-to-video and audio-to-video generation.
// Why: LTX's v2 API has per-model limits (duration, fps, audio length) that we check before
//      holding credits, so callers get a plain error instead of a provider 400.
// How: Map the IR to one of the /v2 endpoints, reserve credits for the billed seconds, submit.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission } from "@executors/_shared/video-submission";
import { saveVideoJobMeta } from "@core/video-jobs";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "../../types";

const DEFAULT_LTX_BASE_URL = "https://api.ltx.io";
const LTX_VIDEO_PREFIX = "ltxvid_";
const LTX_MODELS = new Set(["ltx-2-fast", "ltx-2-pro", "ltx-2-3-fast", "ltx-2-3-pro", "ltx-2-5-fast", "ltx-2-5-pro"]);
const CAMERA_MOTIONS = new Set(["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"]);

class InvalidLtxVideoRequestError extends Error {}

function toString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function encodeTaskId(taskId: string): string {
	return `${LTX_VIDEO_PREFIX}${btoa(taskId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

function providerConfig(ir: IRVideoGenerationRequest): Record<string, any> {
	const raw = (ir.rawRequest ?? {}) as Record<string, any>;
	for (const value of [raw.config?.ltx, raw.ltx, raw.provider_params]) {
		if (value && typeof value === "object" && !Array.isArray(value)) return value;
	}
	return {};
}

function inputImage(ir: IRVideoGenerationRequest, config: Record<string, any>): string | undefined {
	const direct = config.image_uri ?? config.imageUri ?? ir.inputReference ?? ir.inputImage ?? ir.input?.image;
	if (typeof direct === "string") return toString(direct);
	if (direct && typeof direct === "object") return toString(direct.url ?? direct.uri);
	const reference = ir.inputReferences?.find((item) => item.type === "image");
	return toString(reference?.url ?? reference?.raw);
}

function inputAudio(ir: IRVideoGenerationRequest, config: Record<string, any>): string | undefined {
	const direct = config.audio_uri ?? config.audioUri;
	if (typeof direct === "string") return toString(direct);
	const references = ir.inputReferences?.filter((item) => item.type === "audio") ?? [];
	if (references.length > 1) throw new InvalidLtxVideoRequestError("LTX audio-to-video accepts exactly one audio source.");
	return toString(references[0]?.url ?? references[0]?.raw);
}

const HIGH_RESOLUTIONS = new Set(["2560x1440", "1440x2560", "3840x2160", "2160x3840"]);

// Longest input audio LTX accepts for audio-to-video (docs.ltx.io audio-to-video
// reference, checked 2026-11-05): LTX-2.5 Pro takes 10 s at every resolution;
// LTX-2.5 Fast and LTX-2.3 Pro take 20 s at 720p/1080p and 10 s at 1440p/4K.
function maxInputAudioSeconds(model: string, resolution: string): number {
	if (model === "ltx-2-5-pro") return 10;
	return HIGH_RESOLUTIONS.has(resolution) ? 10 : 20;
}

// generate_audio is a validated top-level field; provider_params cannot carry it.
function generateAudioSetting(ir: IRVideoGenerationRequest, config: Record<string, any>): boolean | undefined {
	const value = ir.generateAudio ?? config.generate_audio ?? config.generateAudio;
	if (value == null) return undefined;
	if (typeof value !== "boolean") throw new InvalidLtxVideoRequestError("generate_audio must be true or false.");
	return value;
}

function buildRequest(ir: IRVideoGenerationRequest, model: string) {
	if (!LTX_MODELS.has(model)) throw new InvalidLtxVideoRequestError(`Unsupported LTX model: ${model}.`);
	const config = providerConfig(ir);
	const image = inputImage(ir, config);
	const audio = inputAudio(ir, config);
	const lastFrame = toString(config.last_frame_uri ?? config.lastFrameUri ?? ir.lastFrame ?? ir.input?.lastFrame);
	const resolution = resolveVideoSize({ size: ir.size, resolution: ir.resolution }) ?? "1920x1080";
	const generateAudio = generateAudioSetting(ir, config);
	if (audio) {
		if (!["ltx-2-5-fast", "ltx-2-5-pro", "ltx-2-3-pro", "ltx-2-pro"].includes(model)) {
			throw new InvalidLtxVideoRequestError(`${model} does not support LTX audio-to-video.`);
		}
		if (lastFrame) throw new InvalidLtxVideoRequestError("LTX audio-to-video does not support last-frame conditioning.");
		// The soundtrack is the caller's audio, so there is nothing to switch off.
		if (generateAudio === false) {
			throw new InvalidLtxVideoRequestError("generate_audio: false does not apply to LTX audio-to-video; the video uses the audio you send.");
		}
		const inputAudioSeconds = Number(ir.inputAudioDurationSeconds ?? config.input_audio_duration ?? config.inputAudioDuration);
		const maxAudioSeconds = maxInputAudioSeconds(model, resolution);
		if (!Number.isFinite(inputAudioSeconds) || inputAudioSeconds < 2 || inputAudioSeconds > maxAudioSeconds) {
			throw new InvalidLtxVideoRequestError(
				`input_audio_duration is required and must be between 2 and ${maxAudioSeconds} seconds for ${model} at ${resolution}.`,
			);
		}
		const guidanceScale = config.guidance_scale ?? config.guidanceScale;
		if (guidanceScale != null && (!Number.isFinite(Number(guidanceScale)) || Number(guidanceScale) < 1 || Number(guidanceScale) > 50)) {
			throw new InvalidLtxVideoRequestError("LTX guidance_scale must be between 1 and 50.");
		}
		return {
			endpoint: "audio-to-video" as const,
			body: { model, audio_uri: audio, ...(image ? { image_uri: image } : {}), prompt: ir.prompt, resolution, ...(guidanceScale != null ? { guidance_scale: Number(guidanceScale) } : {}) },
			seconds: inputAudioSeconds,
			inputAudioSeconds,
			resolution,
			fps: 25,
			inputImageCount: image ? 1 : 0,
		};
	}
	const durationValue = ir.durationSeconds ?? ir.duration ?? ir.seconds ?? config.duration;
	// LTX-2.5's automatic duration (duration: null) is not offered: LTX bills the length it
	// picks, but its job result does not report that length, so we could only bill a guess.
	if (durationValue === null) {
		throw new InvalidLtxVideoRequestError("Automatic LTX duration is not available. Send duration as an even number of seconds.");
	}
	const duration = Number(durationValue ?? 8);
	if (!Number.isInteger(duration) || duration < 6 || duration > 20 || duration % 2 !== 0) {
		throw new InvalidLtxVideoRequestError("LTX duration must be an even number from 6 to 20 seconds.");
	}
	const legacyModel = model === "ltx-2-fast" || model === "ltx-2-pro";
	const fps = Number(config.fps ?? config.frame_rate ?? config.frameRate ?? ir.fps ?? (legacyModel ? 25 : 24));
	if (![24, 25, 48, 50].includes(fps)) throw new InvalidLtxVideoRequestError("LTX fps must be 24, 25, 48, or 50.");
	const isFast = model.endsWith("-fast");
	const isLegacy = legacyModel;
	const isHighResolution = HIGH_RESOLUTIONS.has(resolution);
	if (isLegacy && !["1920x1080", "2560x1440", "3840x2160"].includes(resolution)) throw new InvalidLtxVideoRequestError("Deprecated LTX-2 models support landscape output only.");
	if (isLegacy && ![25, 50].includes(fps)) throw new InvalidLtxVideoRequestError("Deprecated LTX-2 models require 25 or 50 fps.");
	if (isLegacy && lastFrame) throw new InvalidLtxVideoRequestError("Deprecated LTX-2 models do not support last-frame conditioning.");
	// LTX-2.5 Pro takes 1440p, 4K and 48 fps as well (docs.ltx.video, checked 2026-11-05);
	// every resolution is priced.
	if (!isFast && duration > 10) throw new InvalidLtxVideoRequestError("LTX Pro duration must be 6, 8, or 10 seconds.");
	if (isFast && duration > 10 && (isHighResolution || fps === 48 || fps === 50)) {
		throw new InvalidLtxVideoRequestError("LTX Fast durations above 10 seconds require 720p or 1080p at 24 or 25 fps.");
	}
	const cameraMotion = toString(config.camera_motion ?? config.cameraMotion);
	if (cameraMotion && !CAMERA_MOTIONS.has(cameraMotion)) throw new InvalidLtxVideoRequestError("Unsupported LTX camera_motion value.");
	if (cameraMotion && !model.startsWith("ltx-2-5-")) throw new InvalidLtxVideoRequestError("camera_motion is only supported by LTX-2.5 models.");
	const body: Record<string, unknown> = {
		model,
		prompt: ir.prompt,
		duration,
		resolution,
		fps,
		// LTX defaults to true; false gives a silent video at the same per-second price.
		generate_audio: generateAudio ?? true,
		...(cameraMotion ? { camera_motion: cameraMotion } : {}),
	};
	if (image) body.image_uri = image;
	if (lastFrame) body.last_frame_uri = lastFrame;
	return { endpoint: image ? "image-to-video" as const : "text-to-video" as const, body, seconds: duration, inputAudioSeconds: undefined, resolution, fps, inputImageCount: image ? 1 : 0 };
}

export const buildLtxVideoRequest = buildRequest;

function invalidResult(message: string): ExecutorResult {
	return {
		kind: "completed", ir: undefined,
		bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
		upstream: new Response(JSON.stringify({ error: { type: "invalid_request", message } }), { status: 400, headers: { "Content-Type": "application/json" } }),
		keySource: "gateway",
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "ltx-2-5-fast";
	let mapped: ReturnType<typeof buildRequest>;
	try { mapped = buildRequest(ir, model); } catch (error) {
		if (error instanceof InvalidLtxVideoRequestError) return invalidResult(error.message);
		throw error;
	}
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => (getBindings() as any).LTX_API_KEY,
	);
	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	try {
		const reserved = await reserveVideoGenerationCredits({
			keyId: args.apiKeyId,
			apiKeyRef: args.meta.apiKeyRef,
			onReservationDenied: args.onReservationDenied,
			workspaceId: args.workspaceId, videoId: args.requestId, providerId: args.providerId, model,
			seconds: mapped.seconds, pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({ resolution: mapped.resolution, frame_rate: mapped.fps, input_image_count: mapped.inputImageCount, input_audio_seconds: mapped.inputAudioSeconds, mode: mapped.endpoint }),
			isByok: keyInfo.source === "byok",
		});
		reservationId = reserved.reservationId; reservationStatus = reserved.status; reservedNanos = reserved.amountNanos;
		if (isInsufficientVideoReservationStatus(reserved.status)) return {
			...invalidResult("Insufficient available credits for video reservation hold."), keySource: keyInfo.source,
			upstream: new Response(JSON.stringify({ error: { type: "insufficient_funds", message: "Insufficient available credits for video reservation hold." } }), { status: 402, headers: { "Content-Type": "application/json" } }),
		};
		if (reserved.status === "skip_missing_seconds_or_pricing" || (reserved.amountNanos > 0 && !reserved.held)) {
			return invalidResult("Video duration and pricing must be resolvable before submission.");
		}
	} catch {
		return { ...invalidResult("Unable to reserve credits for video generation."), upstream: new Response(JSON.stringify({ error: { type: "reservation_unavailable", message: "Unable to reserve credits for video generation." } }), { status: 503, headers: { "Content-Type": "application/json" } }) };
	}
	configureVideoSubmission(args, { model, seconds: mapped.seconds, resolution: mapped.resolution, ltxEndpoint: mapped.endpoint, reservationId, reservedNanos, reservationStatus, keySource: keyInfo.source, byokKeyId: keyInfo.byokId });
	const releaseReservation = async () => {
		if (!canReleaseVideoSubmission(args)) return;
		if (reservationId) await releaseWalletReservation({ workspaceId: args.workspaceId, reservationId, releaseRefId: args.requestId }).catch(() => undefined);
	};
	const bindings = getBindings() as any;
	const baseUrl = String(bindings.LTX_BASE_URL || DEFAULT_LTX_BASE_URL).replace(/\/+$/, "");
	const requestBody = JSON.stringify(mapped.body);
	let res: Response;
	try {
		res = await fetchUpstream(args, `${baseUrl}/v2/${mapped.endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${keyInfo.key}`, "Content-Type": "application/json" }, body: requestBody });
	} catch (error) { await releaseReservation(); throw error; }
	const bill = { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: res.headers.get("x-request-id") ?? undefined, finish_reason: null as string | null };
	if (!res.ok) { await releaseReservation(); return { kind: "completed", ir: undefined, bill, upstream: res, keySource: keyInfo.source, byokKeyId: keyInfo.byokId }; }
	const json = await res.json().catch(() => ({}));
	const taskId = toString(json?.id);
	if (!taskId) { await releaseReservation(); return { kind: "completed", ir: undefined, bill, upstream: new Response(JSON.stringify({ error: { type: "invalid_upstream_response", message: "LTX response did not include a job id." } }), { status: 502 }), keySource: keyInfo.source }; }
	const nativeId = encodeTaskId(taskId);
	try {
		await saveVideoJobMeta(args.workspaceId, args.requestId, {
			provider: args.providerId, providerTaskId: taskId, model, seconds: mapped.seconds, resolution: mapped.resolution,
			frameRate: mapped.fps, inputImageCount: mapped.inputImageCount, outputAccess: ir.outputAccess ?? "bytes",
			inputAudioSeconds: mapped.inputAudioSeconds ?? null,
			webhook: ir.webhook as Record<string, unknown> | null, reservationId, reservedNanos, reservationStatus,
			keySource: keyInfo.source, byokKeyId: keyInfo.byokId, ltxEndpoint: mapped.endpoint,
		} as any, taskId, "queued");
	} catch (error) {
		return asyncVideoJobPersistenceFailureResult({ providerLabel: "LTX", nativeVideoId: nativeId, reservationId, reservationStatus, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, rawResponse: json });
	}
	const response: IRVideoGenerationResponse = { id: args.requestId, nativeId, model, provider: args.providerId, status: "queued", output: [], result: json, usage: { requests: 1, ...(mapped.inputAudioSeconds ? { input_audio_seconds: mapped.inputAudioSeconds } : mapped.seconds ? { output_video_seconds: mapped.seconds } : {}) } as any, rawResponse: json };
	return { kind: "completed", ir: response, bill, upstream: res, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, rawResponse: json };
}

export const executor: ProviderExecutor = execute;

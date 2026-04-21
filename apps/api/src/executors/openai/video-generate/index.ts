// Purpose: Executor for openai / video-generate.
// Why: Runs video generation through IR -> OpenAI -> IR conversion.
// How: Maps unified IR request fields to /videos and normalizes response and usage.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { saveVideoJobMeta } from "@core/video-jobs";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import type { ProviderExecutor } from "../../types";

function normalizePositiveSeconds(value: unknown): string | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return String(Math.trunc(value));
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return String(Math.trunc(parsed));
	}
	return undefined;
}

function parseDurationSeconds(ir: IRVideoGenerationRequest): string | undefined {
	return (
		normalizePositiveSeconds(ir.durationSeconds) ??
		normalizePositiveSeconds(ir.duration) ??
		normalizePositiveSeconds(ir.seconds)
	);
}

function mapOpenAiVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded") return "completed";
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "processing" || status === "in_progress" || status === "running") return "in_progress";
	return "queued";
}

function extractInputReferenceCandidate(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	const directCandidates = [
		source.url,
		source.uri,
		source.input_reference,
		source.inputReference,
		source.gcs_uri,
		source.gcsUri,
	];
	for (const candidate of directCandidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}

	const imageBytes =
		typeof source.image_bytes === "string"
			? source.image_bytes
			: typeof source.imageBytes === "string"
				? source.imageBytes
				: undefined;
	if (imageBytes && imageBytes.trim().length > 0) {
		const mimeType =
			typeof source.mime_type === "string"
				? source.mime_type
				: typeof source.mimeType === "string"
					? source.mimeType
					: "application/octet-stream";
		return `data:${mimeType};base64,${imageBytes.trim()}`;
	}

	return undefined;
}

function resolveInputReferenceValue(ir: IRVideoGenerationRequest): string | undefined {
	return extractInputReferenceCandidate(ir.inputReference) ??
		extractInputReferenceCandidate(ir.inputImage) ??
		extractInputReferenceCandidate(ir.input?.image);
}

function buildOpenAiVideoJsonRequest(args: {
	ir: IRVideoGenerationRequest;
	model: string;
	seconds?: string;
	size?: string;
	inputReference?: string;
}): Record<string, any> {
	const { ir, model, seconds, size, inputReference } = args;
	const rawRequest = (ir.rawRequest ?? {}) as Record<string, any>;
	const openaiConfig =
		rawRequest?.config?.openai && typeof rawRequest.config.openai === "object"
			? rawRequest.config.openai
			: rawRequest?.openai && typeof rawRequest.openai === "object"
				? rawRequest.openai
				: rawRequest?.provider_params && typeof rawRequest.provider_params === "object"
					? rawRequest.provider_params
					: undefined;
	const passthroughRequest =
		openaiConfig?.request && typeof openaiConfig.request === "object" && !Array.isArray(openaiConfig.request)
			? { ...(openaiConfig.request as Record<string, any>) }
			: {};

	const request: Record<string, any> = Object.keys(passthroughRequest).length > 0
		? passthroughRequest
		: {};

	if (request.model == null) request.model = model;
	if (request.prompt == null) request.prompt = ir.prompt;
	if (request.seconds == null && seconds != null) request.seconds = seconds;
	if (request.seconds != null) {
		const normalizedSeconds = normalizePositiveSeconds(request.seconds);
		if (normalizedSeconds != null) request.seconds = normalizedSeconds;
	}
	if (request.size == null && size) request.size = size;
	if (request.seed == null && typeof ir.seed === "number") request.seed = ir.seed;
	if (request.negative_prompt == null && ir.negativePrompt) request.negative_prompt = ir.negativePrompt;
	if (request.aspect_ratio == null && ir.aspectRatio) request.aspect_ratio = ir.aspectRatio;
	if (request.generate_audio == null && typeof ir.generateAudio === "boolean") request.generate_audio = ir.generateAudio;

	if (request.input == null && ir.input && typeof ir.input === "object") {
		request.input = {
			...(ir.input.image ? { image: ir.input.image } : {}),
			...(ir.input.video ? { video: ir.input.video } : {}),
			...(ir.input.lastFrame ? { last_frame: ir.input.lastFrame } : {}),
			...(ir.input.referenceImages ? { reference_images: ir.input.referenceImages } : {}),
		};
	}
	if (request.input_image == null && ir.inputImage) request.input_image = ir.inputImage;
	if (request.input_video == null && ir.inputVideo) request.input_video = ir.inputVideo;
	if (request.last_frame == null && ir.lastFrame) request.last_frame = ir.lastFrame;
	if (request.reference_images == null && ir.referenceImages) request.reference_images = ir.referenceImages;
	if (request.input_reference == null && inputReference) request.input_reference = inputReference;
	if (request.callback_url == null && ir.callbackUrl) request.callback_url = ir.callbackUrl;

	return request;
}

async function resolveInputReferenceBlob(
	refValue: string,
	mimeTypeHint?: string,
): Promise<{ blob: Blob; name: string } | null> {
	const ref = refValue?.trim();
	if (!ref) return null;
	let mimeType = mimeTypeHint ?? "application/octet-stream";
	let fileBlob: Blob | null = null;
	let filename = "reference";

	const dataUrlMatch = ref.match(/^data:([^;]+);base64,(.+)$/);
	if (dataUrlMatch) {
		mimeType = dataUrlMatch[1] ?? mimeType;
		const bytes = Uint8Array.from(atob(dataUrlMatch[2] ?? ""), (c) => c.charCodeAt(0));
		fileBlob = new Blob([bytes], { type: mimeType });
	} else if (ref.startsWith("http://") || ref.startsWith("https://")) {
		const fetched = await fetch(ref);
		if (!fetched.ok) {
			throw new Error(`openai_video_input_reference_fetch_failed_${fetched.status}`);
		}
		fileBlob = await fetched.blob();
		mimeType = fileBlob.type || mimeType;
		const urlParts = ref.split("/");
		filename = urlParts[urlParts.length - 1] || filename;
	} else {
		const bytes = Uint8Array.from(atob(ref), (c) => c.charCodeAt(0));
		fileBlob = new Blob([bytes], { type: mimeType });
	}

	return fileBlob ? { blob: fileBlob, name: filename } : null;
}

function openAiVideoToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
	requestedSeconds?: string,
): IRVideoGenerationResponse {
	const status = mapOpenAiVideoStatus(json?.status);
	const seconds =
		(typeof json?.seconds === "number" ? json.seconds : undefined) ??
		(typeof json?.duration_seconds === "number" ? json.duration_seconds : undefined) ??
		requestedSeconds;

	const output = Array.isArray(json?.output)
		? json.output
		: Array.isArray(json?.data)
			? json.data
			: [];

	const usage: any = {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};

	return {
		id: requestId,
		nativeId: json?.id ?? undefined,
		model,
		provider,
		status,
		output,
		result: json,
		usage,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = args.providerModelSlug || ir.model || "sora-2";
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.OPENAI_API_KEY,
	);
	const seconds = parseDurationSeconds(ir);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? ((ir.rawRequest as any)?.quality ?? null);
	const inputReference = resolveInputReferenceValue(ir);
	const mappedRequestEnabled = Boolean(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest);
	const secondsForMeta = seconds != null ? Number(seconds) : null;
	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;
	let mappedRequest: string | undefined;

	try {
		const reserved = await reserveVideoGenerationCredits({
			workspaceId: args.workspaceId,
			videoId: `req_${args.requestId}`,
			providerId: args.providerId,
			model,
			seconds: secondsForMeta,
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
		console.error("openai_video_reservation_failed_pre_submit", {
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
			console.error("openai_video_reservation_release_failed", {
				error: releaseErr,
				workspaceId: args.workspaceId,
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

	let headers = openAICompatHeaders("openai", keyInfo.key, {
		"Idempotency-Key": args.requestId,
	});
	let requestBody: BodyInit;
	const jsonBody = buildOpenAiVideoJsonRequest({
		ir,
		model,
		seconds,
		size,
		inputReference,
	});

	try {
		if (inputReference) {
			const form = new FormData();
			form.append("model", String(jsonBody.model ?? model));
			form.append("prompt", String(jsonBody.prompt ?? ir.prompt));
			if (jsonBody.seconds != null) form.append("seconds", String(jsonBody.seconds));
			if (jsonBody.size != null) form.append("size", String(jsonBody.size));
			if (jsonBody.quality != null) form.append("quality", String(jsonBody.quality));
			if (jsonBody.seed != null) form.append("seed", String(jsonBody.seed));
			if (jsonBody.aspect_ratio != null) form.append("aspect_ratio", String(jsonBody.aspect_ratio));
			if (jsonBody.negative_prompt != null) form.append("negative_prompt", String(jsonBody.negative_prompt));
			if (jsonBody.callback_url != null) form.append("callback_url", String(jsonBody.callback_url));
			if (jsonBody.generate_audio != null) form.append("generate_audio", String(Boolean(jsonBody.generate_audio)));
			if (jsonBody.input != null) form.append("input", JSON.stringify(jsonBody.input));
			if (jsonBody.input_image != null) form.append("input_image", JSON.stringify(jsonBody.input_image));
			if (jsonBody.input_video != null) form.append("input_video", JSON.stringify(jsonBody.input_video));
			if (jsonBody.last_frame != null) form.append("last_frame", JSON.stringify(jsonBody.last_frame));
			if (jsonBody.reference_images != null) form.append("reference_images", JSON.stringify(jsonBody.reference_images));
			const resolved = await resolveInputReferenceBlob(inputReference, ir.inputReferenceMimeType);
			if (resolved) {
				form.append("input_reference", resolved.blob, resolved.name);
			}
			requestBody = form;
			delete (headers as any)["Content-Type"];
			if (mappedRequestEnabled) {
				mappedRequest = JSON.stringify({ ...jsonBody, input_reference: "[multipart]" });
			}
		} else {
			requestBody = JSON.stringify(jsonBody);
			if (mappedRequestEnabled) mappedRequest = JSON.stringify(jsonBody);
		}
	} catch (requestBuildErr) {
		await releaseReservationOnFailure();
		throw requestBuildErr;
	}

	let res: Response;
	try {
		res = await fetch(openAICompatUrl("openai", "/videos"), {
			method: "POST",
			headers,
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
		upstream_id: res.headers.get("x-request-id") ?? undefined,
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
	const irResponse = openAiVideoToIR(json, args.requestId, model, args.providerId, seconds);
	const nativeVideoId = irResponse.nativeId ?? json?.id;
	if (nativeVideoId) {
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: String(nativeVideoId),
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model,
				seconds: Number.isFinite(secondsForMeta) ? secondsForMeta : null,
				resolution: size ?? null,
				quality,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				createdAt: Date.now(),
			}, String(nativeVideoId), irResponse.status);
		} catch (err) {
			console.error("openai_video_job_meta_store_failed", {
				error: err,
				workspaceId: args.workspaceId,
				videoId: String(nativeVideoId),
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
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

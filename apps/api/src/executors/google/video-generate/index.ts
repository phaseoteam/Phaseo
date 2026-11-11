// Purpose: Executor for google / video-generate.
// Why: Runs Veo and Gemini Omni video generation on Google AI Studio.
// How: Veo submits a predictLongRunning operation; Omni submits a background
//      Interaction (POST /v1beta/interactions). Both return a queued response
//      whose operation name the video routes poll at GET /v1beta/{name}.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission } from "@executors/_shared/video-submission";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import {
	InvalidGoogleVideoRequestError,
	normalizeGoogleVeoRequest,
	type NormalizedGoogleVeoRequest,
} from "@providers/google-video/request";
import {
	buildGoogleOmniInteractionRequest,
	estimateGoogleOmniUsageMeters,
	isGoogleOmniVideoModel,
	normalizeGoogleInteractionVideoPayload,
	normalizeGoogleOmniRequest,
	type NormalizedGoogleOmniRequest,
	type OmniInlineMedia,
} from "@providers/google-video/interactions";
import {
	fetchRemoteMediaInline,
	isHttpUrl,
	mediaInputErrorResult,
	parseBase64DataUrl,
	shortMediaUrl,
} from "@executors/_shared/media/remote-media";
import type { ProviderExecutor } from "../../types";

const GOOGLE_VIDEO_BASE = "https://generativelanguage.googleapis.com";
// Google gives no input size limit for Omni; inline media over these is refused,
// per file and for the whole request (it is all held in memory as base64).
const OMNI_MAX_INLINE_MEDIA_BYTES = 20 * 1024 * 1024;
const OMNI_MAX_TOTAL_INLINE_MEDIA_BYTES = 24 * 1024 * 1024;

type OmniMediaResolution = { ok: true; media: OmniInlineMedia[] } | { ok: false; result: ExecutorResult };

/**
 * Omni takes media as inline base64: Google refuses arbitrary https URLs
 * (INVALID_ARGUMENT), so the gateway downloads them first.
 */
async function resolveOmniInlineMedia(args: ExecutorExecuteArgs, request: NormalizedGoogleOmniRequest): Promise<OmniMediaResolution> {
	const media: OmniInlineMedia[] = [];
	let totalBase64Length = 0;
	const overTotal = (data: string) => {
		totalBase64Length += data.length;
		return totalBase64Length * 0.75 > OMNI_MAX_TOTAL_INLINE_MEDIA_BYTES;
	};
	const tooLargeTotal = () => ({
		ok: false as const,
		result: mediaInputErrorResult("media_too_large", "Gemini Omni media inputs must total 24 MB or less.", args.requestId),
	});
	for (const item of request.media) {
		const fallbackMimeType = item.kind === "video" ? "video/mp4" : "image/png";
		const raw = item.source;
		const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
		const recordData = record?.data ?? record?.imageBytes ?? record?.image_bytes ?? record?.bytesBase64Encoded;
		const inlineData = typeof recordData === "string" && recordData.trim() ? recordData.trim() : null;
		const value = typeof raw === "string"
			? raw.trim()
			: String(record?.url ?? record?.uri ?? record?.image_url ?? "").trim();
		const recordMimeType = String(record?.mimeType ?? record?.mime_type ?? "").trim();
		const dataUrl = inlineData ? null : value ? parseBase64DataUrl(value) : null;
		if (inlineData || dataUrl) {
			const data = inlineData ?? dataUrl!.data;
			if (data.length * 0.75 > OMNI_MAX_INLINE_MEDIA_BYTES) {
				return { ok: false, result: mediaInputErrorResult("media_too_large", `Gemini Omni ${item.kind} inputs must be 20 MB or smaller.`, args.requestId) };
			}
			if (overTotal(data)) return tooLargeTotal();
			media.push({ kind: item.kind, mimeType: inlineData ? (recordMimeType || fallbackMimeType) : dataUrl!.mimeType, data });
			continue;
		}
		if (!value || !isHttpUrl(value)) {
			return { ok: false, result: mediaInputErrorResult("unsupported_media_source", `Gemini Omni ${item.kind} inputs must be an https URL or base64 data.`, args.requestId) };
		}
		const fetched = await fetchRemoteMediaInline(value, {
			fallbackMimeType,
			maxBytes: OMNI_MAX_INLINE_MEDIA_BYTES,
			upstreamTiming: args.upstreamTiming,
		});
		if (fetched.ok === false) {
			return {
				ok: false,
				result: fetched.reason === "too_large"
					? mediaInputErrorResult("media_too_large", `Gemini Omni ${item.kind} inputs must be 20 MB or smaller: ${shortMediaUrl(value)}`, args.requestId)
					: mediaInputErrorResult("media_fetch_failed", `Could not download the ${item.kind} input: ${shortMediaUrl(value)}`, args.requestId),
			};
		}
		if (!fetched.mimeType.startsWith(`${item.kind}/`)) {
			return { ok: false, result: mediaInputErrorResult("unsupported_media_type", `Expected ${item.kind === "image" ? "an image" : "a video"} but got ${fetched.mimeType}: ${shortMediaUrl(value)}`, args.requestId) };
		}
		if (overTotal(fetched.data)) return tooLargeTotal();
		media.push({ kind: item.kind, mimeType: fetched.mimeType, data: fetched.data });
	}
	return { ok: true, media };
}

function encodeGoogleOperationId(operationName: string): string {
	const b64 = btoa(operationName).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `gaiop_${b64}`;
}

function normalizeGoogleModelName(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return trimmed;
	const withoutModelsPrefix = trimmed.replace(/^models\//i, "");
	const slashIndex = withoutModelsPrefix.indexOf("/");
	const canonical = slashIndex < 0 ? withoutModelsPrefix : withoutModelsPrefix.slice(slashIndex + 1);
	const aliasMap: Record<string, string> = {
		"veo-3.1-fast-preview": "veo-3.1-fast-generate-preview",
		"veo-3.1-preview": "veo-3.1-generate-preview",
		"veo-3-fast-preview": "veo-3.0-fast-generate-001",
		"veo-3-preview": "veo-3.0-generate-001",
		"veo-2": "veo-2.0-generate-001",
	};
	return aliasMap[canonical] ?? canonical;
}

type GoogleVideoAuth =
	| { kind: "api_key"; value: string }
	| { kind: "oauth_bearer"; value: string };

function resolveGoogleVideoAuth(rawCredential: string): GoogleVideoAuth {
	const trimmed = rawCredential.trim();
	if (/^Bearer\s+/i.test(trimmed)) {
		return { kind: "oauth_bearer", value: trimmed.replace(/^Bearer\s+/i, "").trim() };
	}
	if (trimmed.startsWith("ya29.") || trimmed.startsWith("eyJ")) {
		return { kind: "oauth_bearer", value: trimmed };
	}
	return { kind: "api_key", value: trimmed };
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
				inlineData: {
					mimeType: dataUrlMatch[1],
					data: dataUrlMatch[2],
				},
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

function irToGoogleVideoRequest(ir: IRVideoGenerationRequest, normalized: NormalizedGoogleVeoRequest): any {
	const providerParams =
		ir.providerParams && typeof ir.providerParams === "object" && !Array.isArray(ir.providerParams)
			? { ...(ir.providerParams as Record<string, any>) }
			: {};
	const inputImage = normalizeGoogleMediaSource(normalized.firstFrame);
	const inputVideo = normalizeGoogleMediaSource(normalized.sourceVideo);
	const lastFrame = normalizeGoogleMediaSource(normalized.lastFrame);
	const referenceImages = normalizeReferenceImages(normalized.referenceImages);
	const parameters: Record<string, any> = {
		...providerParams,
		durationSeconds: normalized.seconds,
		aspectRatio: normalized.aspectRatio,
		resolution: normalized.resolution,
		...(ir.negativePrompt ? { negativePrompt: ir.negativePrompt } : {}),
		// Veo's single-output REST request rejects the SDK's numberOfVideos field.
		...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
		...(ir.personGeneration ? { personGeneration: ir.personGeneration } : {}),
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
	const rawModel = args.providerModelSlug || ir.model || "veo-3.1-generate-preview";
	const model = normalizeGoogleModelName(rawModel);
	const modelForMeta = typeof ir.model === "string" && ir.model.trim().length > 0 ? ir.model.trim() : model;
	const isOmni = isGoogleOmniVideoModel(model);
	let normalizedRequest: NormalizedGoogleVeoRequest | NormalizedGoogleOmniRequest;
	try {
		normalizedRequest = isOmni ? normalizeGoogleOmniRequest(ir, model) :normalizeGoogleVeoRequest(ir, model);
	} catch (error) {
		if (!(error instanceof InvalidGoogleVideoRequestError)) throw error;
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream: new Response(JSON.stringify({ error: { type: "invalid_request", message: error.message } }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			keySource: "gateway",
		};
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.GOOGLE_AI_STUDIO_API_KEY,
	);

	let requestBodyObject: Record<string, unknown>;
	if (isOmni) {
		const omniRequest = normalizedRequest as NormalizedGoogleOmniRequest;
		const resolvedMedia = await resolveOmniInlineMedia(args, omniRequest);
		if (resolvedMedia.ok === false) return resolvedMedia.result;
		requestBodyObject = buildGoogleOmniInteractionRequest({
			model,
			prompt: ir.prompt,
			request: omniRequest,
			media: resolvedMedia.media,
			seed: typeof ir.seed === "number" ? ir.seed : undefined,
		});
	} else {
		requestBodyObject = irToGoogleVideoRequest(ir, normalizedRequest as NormalizedGoogleVeoRequest);
	}
	// Omni is billed by tokens: hold for the tokens the requested length and
	// resolution produce, then charge what Google reports.
	const providerUsageMeters = isOmni ? estimateGoogleOmniUsageMeters(normalizedRequest as NormalizedGoogleOmniRequest) : null;
	const requestBody = JSON.stringify(requestBodyObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;
	const requestedSeconds = normalizedRequest.seconds;
	const outputCount = normalizedRequest.outputCount;
	const reservedOutputSeconds = requestedSeconds == null ? null : requestedSeconds * outputCount;
	const size = normalizedRequest.resolution;
	const quality = ir.quality ?? null;
	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;

	try {
		const reserved = await reserveVideoGenerationCredits({
			keyId: args.apiKeyId,
			apiKeyRef: args.meta.apiKeyRef,
			onReservationDenied: args.onReservationDenied,
			workspaceId: args.workspaceId,
			videoId: args.requestId,
			providerId: args.providerId,
			model: modelForMeta,
			seconds: reservedOutputSeconds,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: ir.resolution,
				quality,
				audio: true,
				input_image_count: normalizedRequest.inputImageCount,
				input_video_count: normalizedRequest.sourceVideo ? 1 : undefined,
				input_video_seconds: normalizedRequest.inputVideoDurationSeconds,
			}),
			providerUsageMeters,
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
		console.error("google_video_reservation_failed_pre_submit", {
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
			console.error("google_video_reservation_release_failed", {
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

	const oauthOverride =
		keyInfo.source === "byok"
			? ""
			: String(bindings.GOOGLE_VIDEO_OAUTH_BEARER_TOKEN ?? "").trim();
	const credentialForVideo = oauthOverride || keyInfo.key;
	let res: Response;
	const googleAuth = resolveGoogleVideoAuth(credentialForVideo);
	try {
		res = await fetchUpstream(
			args,
			isOmni
				? `${GOOGLE_VIDEO_BASE}/v1beta/interactions`
				: `${GOOGLE_VIDEO_BASE}/v1beta/models/${encodeURIComponent(model)}:predictLongRunning`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(googleAuth.kind === "api_key"
						? { "x-goog-api-key": googleAuth.value }
						: { Authorization: `Bearer ${googleAuth.value}` }),
				},
				body: requestBody,
			},
		);
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

	const rawJson = await res.json().catch(() => ({}));
	// An Interaction is read as an Operation named interactions/{id}; one without
	// an id has no name, so it fails below like an operation without a name.
	const json: any = isOmni
		? (typeof (rawJson as any)?.id === "string" && (rawJson as any).id.trim()
			? normalizeGoogleInteractionVideoPayload(rawJson)
			: {})
		: rawJson;
	console.info("google_video_create_response", {
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		providerId: args.providerId,
		model,
		modelForMeta,
		authKind: googleAuth.kind,
		keySource: keyInfo.source,
		upstreamStatus: res.status,
		operationName: (json as any)?.name ?? null,
		reservationId,
		reservationStatus,
		reservedNanos,
		requestedSeconds,
		size,
	});
	const irResponse = googleVideoToIR(
		json,
		args.requestId,
		model,
		args.providerId,
		requestedSeconds ?? undefined,
	);
	if (!irResponse.nativeId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "Google video create response did not include an operation name.",
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
			rawResponse: rawJson,
		};
	}
	if (irResponse.nativeId) {
		const operationName =
			typeof (json as any)?.name === "string"
				? (json as any).name
				: typeof (json as any)?.operationName === "string"
					? (json as any).operationName
					: String(irResponse.nativeId);
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: operationName,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model: modelForMeta,
				seconds: normalizedRequest.seconds,
				outputCount,
				resolution: size ?? null,
				quality,
				audio: true,
				inputImageCount: normalizedRequest.inputImageCount,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				...(providerUsageMeters ? { googleUsageMeters: providerUsageMeters } : {}),
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, operationName, irResponse.status);
		} catch (err) {
			console.error("google_video_job_meta_store_failed", {
				error: err,
				workspaceId: args.workspaceId,
				videoId: String(irResponse.nativeId),
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "Google",
				nativeVideoId: String(irResponse.nativeId),
				reservationId,
				reservationStatus,
				bill,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				rawResponse: rawJson,
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
		rawResponse: rawJson,
	};
}

export const executor: ProviderExecutor = execute;

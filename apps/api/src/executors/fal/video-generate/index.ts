// Purpose: Fal queue-backed video generation executor.
// Why: Fal exposes many video models through one durable async lifecycle.
// How: Selects a mode-specific endpoint, submits to queue.fal.run, and stores
// the endpoint plus request id in the gateway-owned async job id.

import { getBindings } from "@/runtime/env";
import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import { saveVideoJobMeta } from "@core/video-jobs";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission } from "@executors/_shared/video-submission";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import type { ProviderExecutor } from "../../types";

const DEFAULT_FAL_QUEUE_BASE_URL = "https://queue.fal.run";
const FAL_VIDEO_PREFIX = "falvid_";

type FalVideoIdentity = {
	endpoint: string;
	requestId: string;
};

function encodeIdentity(identity: FalVideoIdentity): string {
	const encoded = btoa(JSON.stringify(identity)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${FAL_VIDEO_PREFIX}${encoded}`;
}

function text(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized || undefined;
}

function positiveNumber(value: unknown): number | undefined {
	const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function sourceUrl(value: unknown): string | undefined {
	if (typeof value === "string") return text(value);
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	return text(record.url) ?? text(record.uri) ?? text(record.gcsUri) ?? text(record.gcs_uri);
}

function referenceSource(entry: NonNullable<IRVideoGenerationRequest["inputReferences"]>[number]): string | undefined {
	return entry.url ?? sourceUrl(entry.raw) ?? (entry.data
		? `data:${entry.mimeType ?? "application/octet-stream"};base64,${entry.data}`
		: undefined);
}

function references(ir: IRVideoGenerationRequest, type: "image" | "video" | "audio") {
	return (ir.inputReferences ?? [])
		.filter((entry) => entry.type === type && (type !== "image" || entry.role === "reference"))
		.map(referenceSource)
		.filter((entry): entry is string => Boolean(entry));
}

function resolveEndpoint(ir: IRVideoGenerationRequest, configured: string): string {
	const imageUrls = references(ir, "image");
	const videoUrls = references(ir, "video");
	const audioUrls = references(ir, "audio");
	const hasImage = imageUrls.length > 0 || Boolean(sourceUrl(ir.inputImage ?? ir.input?.image ?? ir.inputReference));
	const hasMultimodalReferences = videoUrls.length > 0 || audioUrls.length > 0 || imageUrls.length > 0;
	if (configured.includes("/text-to-video") || configured.includes("/image-to-video") || configured.includes("/reference-to-video")) {
		return configured;
	}
	if (configured === "bytedance/seedance-2.0" || configured === "bytedance/seedance-2.0/fast") {
		if (hasMultimodalReferences) return `${configured}/reference-to-video`;
		if (hasImage) return `${configured}/image-to-video`;
		return `${configured}/text-to-video`;
	}
	return configured;
}

function buildFalInput(ir: IRVideoGenerationRequest): Record<string, unknown> {
	const imageUrls = references(ir, "image");
	const videoUrls = references(ir, "video");
	const audioUrls = references(ir, "audio");
	const firstImage = sourceUrl(ir.inputImage ?? ir.input?.image ?? ir.inputReference);
	const lastImage = sourceUrl(ir.lastFrame ?? ir.input?.lastFrame) ??
		(ir.inputReferences ?? []).find((entry) => entry.role === "last_frame")?.url;
	const duration = positiveNumber(ir.durationSeconds ?? ir.duration ?? ir.seconds);
	const resolution = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	return {
		...(ir.providerParams ?? {}),
		prompt: ir.prompt,
		...(duration ? { duration: String(Math.trunc(duration)) } : {}),
		...(resolution ? { resolution } : {}),
		...(ir.aspectRatio ? { aspect_ratio: ir.aspectRatio } : {}),
		...(typeof ir.generateAudio === "boolean" ? { generate_audio: ir.generateAudio } : {}),
		...(typeof ir.seed === "number" ? { seed: ir.seed } : {}),
		...(firstImage ? { image_url: firstImage } : {}),
		...(lastImage ? { end_image_url: lastImage } : {}),
		...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
		...(videoUrls.length > 0 ? { video_urls: videoUrls } : {}),
		...(audioUrls.length > 0 ? { audio_urls: audioUrls } : {}),
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const configuredModel = args.providerModelSlug || ir.model;
	const endpoint = resolveEndpoint(ir, configuredModel);
	const hasFirstFrame = Boolean(sourceUrl(ir.inputImage ?? ir.input?.image ?? ir.inputReference));
	const hasLastFrame = Boolean(sourceUrl(ir.lastFrame ?? ir.input?.lastFrame));
	const hasReferences = ["image", "video", "audio"].some((type) => references(ir, type as "image" | "video" | "audio").length > 0);
	if (configuredModel.startsWith("bytedance/seedance-2.0") && (
		(hasLastFrame && !hasFirstFrame) ||
		(hasReferences && (hasFirstFrame || hasLastFrame)) ||
		(endpoint.endsWith("/text-to-video") && (hasFirstFrame || hasLastFrame || hasReferences)) ||
		(endpoint.endsWith("/image-to-video") && (!hasFirstFrame || hasReferences)) ||
		(endpoint.endsWith("/reference-to-video") && (hasFirstFrame || hasLastFrame))
	)) {
		return {
			kind: "completed", ir: undefined, bill: { cost_cents: 0, currency: "USD" },
			upstream: new Response(JSON.stringify({ error: { type: "validation_error", message: "Fal Seedance frame mode requires a first frame and cannot be combined with reference inputs. Inputs must match the selected endpoint." } }), { status: 400, headers: { "Content-Type": "application/json" } }),
		};
	}
	const seconds = positiveNumber(ir.durationSeconds ?? ir.duration ?? ir.seconds);
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const allowedResolutions = configuredModel.includes("seedance-2.0/fast") ? ["720p"] : ["720p", "1080p"];
	if (size && !allowedResolutions.includes(size.toLowerCase())) {
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD" },
			upstream: new Response(JSON.stringify({
				error: {
					type: "validation_error",
					message: `Fal ${configuredModel} resolution must be ${allowedResolutions.join(" or ")}.`,
				},
			}), { status: 400, headers: { "Content-Type": "application/json" } }),
		};
	}
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => (getBindings() as unknown as Record<string, string | undefined>).FAL_KEY,
	);

	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	try {
		const reservation = await reserveVideoGenerationCredits({
			keyId: args.apiKeyId,
			authMethod: args.meta.authMethod,
			onReservationDenied: args.onReservationDenied,
			workspaceId: args.workspaceId,
			videoId: args.requestId,
			providerId: args.providerId,
			model: configuredModel,
			seconds: seconds ?? null,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: size,
				quality: ir.quality,
				aspectRatio: ir.aspectRatio,
				audio: ir.generateAudio,
			}),
			isByok: keyInfo.source === "byok",
		});
		reservationId = reservation.reservationId;
		reservationStatus = reservation.status;
		reservedNanos = reservation.amountNanos;
		if (isInsufficientVideoReservationStatus(reservation.status)) {
			return {
				kind: "completed",
				ir: undefined,
				bill: { cost_cents: 0, currency: "USD" },
				upstream: new Response(JSON.stringify({ error: { type: "insufficient_funds", message: "Insufficient available credits for video reservation hold." } }), { status: 402, headers: { "Content-Type": "application/json" } }),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
		if (reservation.status === "skip_missing_seconds_or_pricing") {
			return {
				kind: "completed",
				ir: undefined,
				bill: { cost_cents: 0, currency: "USD" },
				upstream: new Response(JSON.stringify({ error: { type: "missing_billing_dimensions", message: "Video duration and pricing must be resolvable before Fal submission." } }), { status: 400, headers: { "Content-Type": "application/json" } }),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
		if (reservation.amountNanos > 0 && !reservation.held) {
			return {
				kind: "completed",
				ir: undefined,
				bill: { cost_cents: 0, currency: "USD" },
				upstream: new Response(JSON.stringify({ error: { type: "reservation_not_held", message: "Unable to secure video credits before Fal submission." } }), { status: 503, headers: { "Content-Type": "application/json" } }),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
	} catch (error) {
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD" },
			upstream: new Response(JSON.stringify({ error: { type: "reservation_unavailable", message: "Unable to reserve credits for video generation." } }), { status: 503, headers: { "Content-Type": "application/json" } }),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			rawResponse: error,
		};
	}

	configureVideoSubmission(args, { model: configuredModel, reservationId, reservedNanos, reservationStatus, keySource: keyInfo.source, byokKeyId: keyInfo.byokId });
	const releaseReservation = async () => {
		if (!canReleaseVideoSubmission(args)) return;
		if (!reservationId) return;
		await releaseWalletReservation({ workspaceId: args.workspaceId, reservationId, releaseRefId: args.requestId }).catch(() => null);
	};
	const input = buildFalInput(ir);
	const requestBody = JSON.stringify(input);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const baseUrl = String((getBindings() as unknown as Record<string, string | undefined>).FAL_QUEUE_BASE_URL || DEFAULT_FAL_QUEUE_BASE_URL).replace(/\/+$/, "");
	let response: Response;
	try {
		response = await fetchUpstream(args, `${baseUrl}/${endpoint}`, {
			method: "POST",
			headers: { Authorization: `Key ${keyInfo.key}`, "Content-Type": "application/json" },
			body: requestBody,
		});
	} catch (error) {
		await releaseReservation();
		throw error;
	}
	const bill = { cost_cents: 0, currency: "USD", upstream_id: response.headers.get("x-fal-request-id") ?? undefined };
	if (!response.ok) {
		await releaseReservation();
		return { kind: "completed", ir: undefined, bill, upstream: response, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest };
	}

	const json = await response.clone().json().catch(() => ({} as any));
	const requestId = text(json?.request_id ?? json?.requestId);
	if (!requestId) {
		await releaseReservation();
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: new Response(JSON.stringify({ error: { type: "invalid_upstream_response", message: "Fal queue response did not include request_id." } }), { status: 502, headers: { "Content-Type": "application/json" } }),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			rawResponse: json,
		};
	}
	const nativeId = encodeIdentity({ endpoint, requestId });
	try {
		await saveVideoJobMeta(args.workspaceId, args.requestId, {
			provider: "fal",
			providerTaskId: nativeId,
			requestId: args.requestId,
			sessionId: args.meta.sessionId ?? null,
			appId: args.meta.appId ?? null,
			model: configuredModel,
			seconds: seconds ?? null,
			resolution: size ?? null,
			quality: ir.quality ?? null,
			aspectRatio: ir.aspectRatio ?? null,
			audio: ir.generateAudio ?? null,
			outputAccess: ir.outputAccess ?? "both",
			webhook: ir.webhook as Record<string, unknown> | null,
			reservationId,
			reservedNanos,
			reservationStatus,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			providerDispatchedAtMs: args.upstreamTiming?.timingFor(response)?.dispatchAtMs ?? Date.now(),
		}, nativeId, "queued");
	} catch (error) {
		return asyncVideoJobPersistenceFailureResult({ providerLabel: "Fal", nativeVideoId: nativeId, reservationId, reservationStatus, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, rawResponse: json });
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId,
		model: configuredModel,
		provider: "fal",
		status: "queued",
		output: [],
		result: json,
		usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1, ...(seconds ? { output_video_seconds: seconds } : {}) } as any,
		rawResponse: json,
	};
	return { kind: "completed", ir: irResponse, bill, upstream: response, keySource: keyInfo.source, byokKeyId: keyInfo.byokId, mappedRequest, rawResponse: json };
}

export const executor: ProviderExecutor = execute;

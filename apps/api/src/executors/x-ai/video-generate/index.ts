// Purpose: Executor for x-ai / video-generate.
// Why: Uses SpaceXAI native video generation endpoints for direct provider support.
// How: Submits generation jobs to /videos/generations and returns normalized IR.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission } from "@executors/_shared/video-submission";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { computeBill } from "@pipeline/pricing/engine";
import { asyncVideoJobPersistenceFailureResult } from "@executors/_shared/async-job-persistence";

const XAI_VIDEO_PREFIX = "xaivid_";

function encodeXAiVideoId(videoId: string): string {
	const b64 = btoa(videoId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
	return `${XAI_VIDEO_PREFIX}${b64}`;
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

function parseDurationSeconds(ir: IRVideoGenerationRequest): number | undefined {
	return toPositiveNumber(ir.durationSeconds) ??
		toPositiveNumber(ir.duration) ??
		toPositiveNumber(ir.seconds);
}

function normalizeMediaSource(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = value as Record<string, unknown>;
	for (const candidate of [source.url, source.uri, source.gcsUri, source.gcs_uri]) {
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
	}
	return undefined;
}

class InvalidXAiVideoRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidXAiVideoRequestError";
	}
}

function isGrokImagineVideo15(model: string): boolean {
	return /^grok-imagine-video-1\.5(?:-|$)/i.test(model);
}

function normalizeXAiResolution(value: unknown, model: string): "480p" | "720p" | "1080p" | undefined {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === "480p" || normalized === "720p" || (normalized === "1080p" && isGrokImagineVideo15(model))) {
		return normalized as "480p" | "720p" | "1080p";
	}
	const dimensions = normalized.match(/^(\d{3,4})x(\d{3,4})$/);
	if (!dimensions) return undefined;
	const shortEdge = Math.min(Number(dimensions[1]), Number(dimensions[2]));
	if (shortEdge >= 1080) {
		if (isGrokImagineVideo15(model)) return "1080p";
		throw new InvalidXAiVideoRequestError("grok-imagine-video resolution must be 480p or 720p.");
	}
	return shortEdge >= 720 ? "720p" : "480p";
}

function normalizeXAiAspectRatio(value: unknown, size: unknown): string | undefined {
	const normalized = String(value ?? "").trim();
	if (new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]).has(normalized)) return normalized;
	if (normalized) throw new InvalidXAiVideoRequestError(`Unsupported xAI video aspect ratio: ${normalized}.`);
	const dimensions = String(size ?? "").trim().toLowerCase().match(/^(\d{3,4})x(\d{3,4})$/);
	if (!dimensions) return undefined;
	const width = Number(dimensions[1]);
	const height = Number(dimensions[2]);
	const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
	const divisor = gcd(width, height);
	const exact = `${width / divisor}:${height / divisor}`;
	if (new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]).has(exact)) return exact;
	return width > height ? "16:9" : "9:16";
}

function uniqueUrls(values: unknown[]): string[] {
	return [...new Set(values.map(normalizeMediaSource).filter((value): value is string => Boolean(value)))];
}

function buildXAiVideoRequest(ir: IRVideoGenerationRequest, model: string): {
	endpoint: string;
	body: Record<string, unknown>;
	resolution: "480p" | "720p" | "1080p";
	seconds?: number;
	inputImageCount: number;
	inputVideoCount: number;
	inputVideoSeconds?: number;
} {
	const rawSize = ir.resolution ?? ir.size;
	const resolution = normalizeXAiResolution(rawSize, model) ?? (rawSize == null ? "480p" : undefined);
	if (!resolution) {
		throw new InvalidXAiVideoRequestError(
			isGrokImagineVideo15(model)
				? "grok-imagine-video-1.5 resolution must be 480p, 720p, or 1080p."
				: "grok-imagine-video resolution must be 480p or 720p.",
		);
	}
	const aspectRatio = normalizeXAiAspectRatio(ir.aspectRatio ?? ir.ratio, rawSize);
	let seconds = parseDurationSeconds(ir);
	const imageReferences = ir.inputReferences?.filter((entry) => entry.type === "image") ?? [];
	const imageUrls = uniqueUrls([
		...imageReferences.map((entry) => entry.url ?? entry.raw),
		ir.inputImage,
		ir.input?.image,
		ir.inputReference,
	]);
	const videoUrls = uniqueUrls([
		...(ir.inputReferences?.filter((entry) => entry.type === "video").map((entry) => entry.url ?? entry.raw) ?? []),
		ir.inputVideo,
		ir.input?.video,
	]);
	if (videoUrls.length > 1) throw new InvalidXAiVideoRequestError("xAI video editing accepts exactly one source video.");
	const videoUrl = videoUrls[0];
	if (ir.inputReferences?.some((entry) => entry.type === "audio" || entry.type === "mask")) {
		throw new InvalidXAiVideoRequestError("xAI video accepts image and video references only.");
	}
	const useReferenceImages = imageUrls.length > 1 || imageReferences.some((entry) => entry.role === "reference");
	const body: Record<string, unknown> = { model, prompt: ir.prompt };
	if (videoUrl) {
		if (isGrokImagineVideo15(model)) {
			throw new InvalidXAiVideoRequestError("grok-imagine-video-1.5 supports image-to-video only; use grok-imagine-video for editing.");
		}
		const inputVideoSeconds = ir.inputVideoDurationSeconds;
		if (inputVideoSeconds == null || !Number.isFinite(inputVideoSeconds) || inputVideoSeconds <= 0 || inputVideoSeconds > 8.7) {
			throw new InvalidXAiVideoRequestError("input_video_duration is required for xAI video editing and must be at most 8.7 seconds.");
		}
		if (imageUrls.length > 0) {
			throw new InvalidXAiVideoRequestError("xAI video editing does not accept image references.");
		}
		seconds ??= inputVideoSeconds;
		body.video = { url: videoUrl };
		body.resolution = resolution;
		return {
			endpoint: "/videos/edits",
			body,
			resolution,
			seconds,
			inputImageCount: imageUrls.length,
			inputVideoCount: 1,
			inputVideoSeconds,
		};
	}
	if (isGrokImagineVideo15(model) && (imageUrls.length !== 1 || useReferenceImages)) {
		throw new InvalidXAiVideoRequestError("grok-imagine-video-1.5 requires exactly one first_frame image.");
	}
	if (seconds != null) body.duration = seconds;
	body.resolution = resolution;
	if (aspectRatio) body.aspect_ratio = aspectRatio;
	if (useReferenceImages) body.reference_images = imageUrls.map((url) => ({ url }));
	else if (imageUrls[0]) body.image = { url: imageUrls[0] };
	return {
		endpoint: "/videos/generations",
		body,
		resolution,
		seconds,
		inputImageCount: imageUrls.length,
		inputVideoCount: 0,
	};
}

function normalizeXAiVideoModel(value: string | null | undefined): string {
	let model = String(value ?? "").trim();
	if (!model) return "grok-imagine-video";
	if (model.includes("/")) {
		model = model.split("/").pop() ?? model;
	}
	const normalized = model.trim().toLowerCase().replace(/\s+/g, "-");
	if (
		normalized === "grok-imagine-video" ||
		normalized === "grok-imagine-video-latest" ||
		normalized === "grok-imagine" ||
		normalized === "imagine-video" ||
		normalized === "xai-grok-imagine-video" ||
		normalized === "x-ai-grok-imagine-video"
	) {
		return "grok-imagine-video";
	}
	return model;
}

function toVideoStatus(value: unknown): IRVideoGenerationResponse["status"] {
	const status = String(value ?? "").toLowerCase();
	if (status === "done" || status === "completed" || status === "succeeded" || status === "success") return "completed";
	if (status === "expired" || status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
		return "failed";
	}
	if (status === "pending" || status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function extractNativeVideoId(json: any): string | undefined {
	const id = json?.id ?? json?.request_id ?? json?.video_id ?? json?.data?.id ?? json?.data?.request_id;
	if (id == null) return undefined;
	const str = String(id).trim();
	return str.length > 0 ? str : undefined;
}

function extractVideoOutput(json: any): Array<{ index: number; uri: string | null; mime_type: string | null }> {
	const output = Array.isArray(json?.output)
		? json.output
		: Array.isArray(json?.data)
			? json.data
			: [];
	if (output.length > 0) {
		return output.map((item: any, index: number) => ({
			index,
			uri: item?.url ?? item?.video_url ?? item?.uri ?? null,
			mime_type: item?.mime_type ?? item?.mimeType ?? "video/mp4",
		}));
	}

	const videoUrl = json?.video?.url ?? json?.video_url ?? json?.url ?? json?.result?.video_url ?? json?.result?.url;
	if (typeof videoUrl === "string" && videoUrl.length > 0) {
		return [{ index: 0, uri: videoUrl, mime_type: "video/mp4" }];
	}
	return [];
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const model = normalizeXAiVideoModel(args.providerModelSlug || ir.model || "grok-imagine-video");
	const publicModel = `spacex-ai/${model}`;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => {
			const bindings = getBindings() as unknown as Record<string, string | undefined>;
			return bindings.X_AI_API_KEY;
		},
	);
	let mapped: ReturnType<typeof buildXAiVideoRequest>;
	try {
		mapped = buildXAiVideoRequest(ir, model);
	} catch (error) {
		if (!(error instanceof InvalidXAiVideoRequestError)) throw error;
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
	const seconds = mapped.seconds;
	const size = mapped.resolution ?? resolveVideoSize({ size: ir.size, resolution: ir.resolution });

	const requestBody = JSON.stringify(mapped.body);
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
			model: publicModel,
			seconds: seconds ?? null,
			pricingCard: args.pricingCard,
			requestOptions: buildVideoPricingRequestOptions({
				size,
				resolution: mapped.resolution ?? ir.resolution,
				input_image_count: mapped.inputImageCount,
				input_video_count: mapped.inputVideoCount,
				input_video_seconds: mapped.inputVideoSeconds,
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
		console.error("xai_video_reservation_failed_pre_submit", {
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
			console.error("xai_video_reservation_release_failed", {
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
		res = await fetchUpstream(args, openAICompatUrl(args.providerId, mapped.endpoint), {
			method: "POST",
			headers: openAICompatHeaders(args.providerId, keyInfo.key, {
				"Idempotency-Key": args.requestId,
			}),
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
	const nativeId = extractNativeVideoId(json);
	const encodedId = nativeId ? encodeXAiVideoId(nativeId) : undefined;
	if (!encodedId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "SpaceXAI video create response did not include a generation id.",
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
				providerTaskId: nativeId ?? encodedId,
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model: publicModel,
				seconds: seconds ?? null,
				resolution: mapped.resolution ?? size ?? null,
				quality: null,
				inputImageCount: mapped.inputImageCount,
				inputVideoCount: mapped.inputVideoCount,
				inputVideoSeconds: mapped.inputVideoSeconds ?? null,
				outputAccess: ir.outputAccess ?? "both",
				webhook: ir.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
			}, nativeId ?? encodedId, toVideoStatus(json?.status));
		} catch (error) {
			console.error("xai_video_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				videoId: encodedId,
				requestId: args.requestId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return asyncVideoJobPersistenceFailureResult({
				providerLabel: "SpaceXAI",
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
		const priced = computeBill(usageMeters, args.pricingCard, { model: publicModel });
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	} else {
		bill.usage = usageMeters;
	}

	const irResponse: IRVideoGenerationResponse = {
		id: args.requestId,
		nativeId: encodedId,
		model: publicModel,
		provider: args.providerId,
		status: toVideoStatus(json?.status),
		output: extractVideoOutput(json),
		result: json,
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			requests: 1,
			...(seconds != null ? { output_video_seconds: seconds } : {}),
			...(mapped.inputImageCount > 0 ? { input_image_count: mapped.inputImageCount } : {}),
			...(mapped.inputVideoCount > 0 ? { input_video_count: mapped.inputVideoCount } : {}),
			...(mapped.inputVideoSeconds != null ? { input_video_seconds: mapped.inputVideoSeconds } : {}),
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

export const __xAiVideoGenerateTestUtils = {
	normalizeXAiVideoModel,
	buildXAiVideoRequest,
};

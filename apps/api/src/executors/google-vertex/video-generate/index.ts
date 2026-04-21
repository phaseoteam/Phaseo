// Purpose: Executor for google-vertex / video-generate.
// Why: Runs Veo video generation through Vertex AI's long-running predict API.
// How: Submits a Vertex predictLongRunning request and returns normalized queued response state.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { saveVideoJobMeta } from "@core/video-jobs";
import { reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import {
	encodeGoogleVertexOperationId,
	extractGoogleOperationError,
	normalizeGoogleVideoModelName,
	toGoogleVideoDurationSeconds,
} from "@providers/google-video/shared";
import { resolveVertexAccessToken, resolveVertexApiBase } from "@providers/google-vertex/auth";
import type { ProviderExecutor } from "../../types";

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
				bytesBase64Encoded: dataUrlMatch[2],
			};
		}
		return trimmed.startsWith("gs://") ? { gcsUri: trimmed } : { uri: trimmed };
	}

	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const source = { ...(value as Record<string, any>) };
	const gcsUri = toNonEmptyString(source.gcsUri) ?? toNonEmptyString(source.gcs_uri);
	const uri = toNonEmptyString(source.uri) ?? toNonEmptyString(source.url);
	const imageBytes = toNonEmptyString(source.imageBytes) ?? toNonEmptyString(source.image_bytes);
	const bytesBase64Encoded = toNonEmptyString(source.bytesBase64Encoded) ?? imageBytes;
	const mimeType = toNonEmptyString(source.mimeType) ?? toNonEmptyString(source.mime_type);

	delete source.gcs_uri;
	delete source.image_bytes;
	delete source.mime_type;
	delete source.url;
	delete source.imageBytes;

	if (!source.gcsUri && gcsUri) source.gcsUri = gcsUri;
	if (!source.uri && uri) source.uri = uri;
	if (!source.bytesBase64Encoded && bytesBase64Encoded) source.bytesBase64Encoded = bytesBase64Encoded;
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

function irToVertexVideoRequest(ir: IRVideoGenerationRequest): any {
	const durationSeconds = toGoogleVideoDurationSeconds(ir);
	const aspectRatio = ir.aspectRatio ?? ir.ratio;
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const providerParams =
		ir.providerParams && typeof ir.providerParams === "object" && !Array.isArray(ir.providerParams)
			? { ...(ir.providerParams as Record<string, any>) }
			: {};
	const sampleCount =
		typeof ir.sampleCount === "number"
			? ir.sampleCount
			: typeof ir.numberOfVideos === "number"
				? ir.numberOfVideos
				: undefined;
	const inputImage = normalizeGoogleMediaSource(ir.inputImage ?? ir.input?.image ?? ir.inputReference);
	const inputVideo = normalizeGoogleMediaSource(ir.inputVideo ?? ir.input?.video);
	const lastFrame = normalizeGoogleMediaSource(ir.lastFrame ?? ir.input?.lastFrame);
	const referenceImages = normalizeReferenceImages(ir.referenceImages ?? ir.input?.referenceImages);
	const parameters: Record<string, any> = {
		...providerParams,
		...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
		...(aspectRatio ? { aspectRatio } : {}),
		...(size ? { resolution: size } : {}),
		...(typeof ir.compressionQuality === "number" ? { compressionQuality: ir.compressionQuality } : {}),
		...(ir.negativePrompt ? { negativePrompt: ir.negativePrompt } : {}),
		...(typeof sampleCount === "number" ? { sampleCount } : {}),
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

function vertexVideoToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
	requestedSeconds?: number,
): IRVideoGenerationResponse {
	const operationName = json?.name ?? json?.operationName ?? null;
	const done = Boolean(json?.done);
	const operationError = done ? extractGoogleOperationError(json) : undefined;
	const failed = done && operationError !== undefined;
	const videos = Array.isArray(json?.response?.videos) ? json.response.videos : [];
	const output = done && !failed
		? videos.map((video: any, index: number) => ({
			index,
			uri: video?.gcsUri ?? video?.uri ?? null,
			mime_type: video?.mimeType ?? null,
			...(typeof video?.bytesBase64Encoded === "string" ? { b64Json: video.bytesBase64Encoded } : {}),
		}))
		: [];
	const seconds =
		typeof json?.response?.videoMetadata?.durationSeconds === "number"
			? json.response.videoMetadata.durationSeconds
			: typeof json?.videoMetadata?.durationSeconds === "number"
				? json.videoMetadata.durationSeconds
				: requestedSeconds;

	return {
		id: requestId,
		nativeId: operationName ? encodeGoogleVertexOperationId(operationName) : undefined,
		model,
		provider,
		status: failed ? "failed" : done ? "completed" : "queued",
		output,
		result: {
			operation_name: operationName ?? undefined,
			google: json,
		},
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		},
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRVideoGenerationRequest;
	const rawModel = args.providerModelSlug || ir.model || "veo-3.1-generate-001";
	const model = normalizeGoogleVideoModelName(rawModel);
	const modelForMeta = typeof rawModel === "string" && rawModel.trim().length > 0 ? rawModel.trim() : model;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.GOOGLE_VERTEX_ACCESS_TOKEN || bindings.GOOGLE_VERTEX_API_KEY,
	);
	const accessToken = await resolveVertexAccessToken(keyInfo.key);
	const apiBase = resolveVertexApiBase(bindings);

	const requestBodyObject = irToVertexVideoRequest(ir);
	const requestBody = JSON.stringify(requestBodyObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;
	const requestedSeconds = toGoogleVideoDurationSeconds(ir) ?? null;
	const size = resolveVideoSize({ size: ir.size, resolution: ir.resolution });
	const quality = ir.quality ?? null;
	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;

	try {
		const reserved = await reserveVideoGenerationCredits({
			workspaceId: args.workspaceId,
			videoId: `req_${args.requestId}`,
			providerId: args.providerId,
			model: modelForMeta,
			seconds: requestedSeconds,
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
		console.error("google_vertex_video_reservation_failed_pre_submit", {
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
			console.error("google_vertex_video_reservation_release_failed", {
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

	let res: Response;
	try {
		res = await fetch(
			`${apiBase}/publishers/google/models/${encodeURIComponent(model)}:predictLongRunning`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
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
		upstream_id:
			res.headers.get("x-request-id") ??
			res.headers.get("x-cloud-trace-context") ??
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
	console.info("google_vertex_video_create_response", {
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		providerId: args.providerId,
		model,
		modelForMeta,
		keySource: keyInfo.source,
		upstreamStatus: res.status,
		operationName: (json as any)?.name ?? null,
		reservationId,
		reservationStatus,
		reservedNanos,
		requestedSeconds,
		size,
	});
	const irResponse = vertexVideoToIR(
		json,
		args.requestId,
		model,
		args.providerId,
		requestedSeconds ?? undefined,
	);
	if (irResponse.nativeId) {
		const firstOutput = Array.isArray(irResponse.output) ? irResponse.output[0] : null;
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
				seconds: toGoogleVideoDurationSeconds(ir) ?? null,
				resolution: size ?? null,
				quality,
				outputAccess: ir.outputAccess ?? "bytes",
				webhook: ir.webhook as Record<string, unknown> | null,
				googleOperationName: (json as any)?.name ?? null,
				googleVideoUri: typeof firstOutput?.uri === "string" ? firstOutput.uri : null,
				googleVideoMimeType: typeof firstOutput?.mime_type === "string" ? firstOutput.mime_type : null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				createdAt: Date.now(),
			}, operationName, irResponse.status);
		} catch (err) {
			console.error("google_vertex_video_job_meta_store_failed", {
				error: err,
				workspaceId: args.workspaceId,
				videoId: String(irResponse.nativeId),
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


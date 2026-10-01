// Purpose: Executor for openai / video-generate.
// Why: Runs video generation through IR -> OpenAI -> IR conversion.
// How: Maps unified IR request fields to /videos and normalizes response and usage.

import type { IRVideoGenerationRequest, IRVideoGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ExecutorUpstreamTiming } from "@executors/types";
import { fetchVideoSubmission as fetchUpstream, configureVideoSubmission, canReleaseVideoSubmission } from "@executors/_shared/video-submission";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { openAICompatHeaders, openAICompatUrl } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { saveVideoJobMeta } from "@core/video-jobs";
import { getBatchFileMeta } from "@core/batch-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions, resolveVideoSize } from "@core/video-request-options";
import { readStreamBytesWithLimit } from "@core/bounded-stream";
import { validateWebhookEndpointUrlForDelivery } from "@core/webhook-endpoints";
import type { ProviderExecutor } from "../../types";

const OPENAI_VIDEO_SECONDS = new Set(["4", "8", "12"]);
const OPENAI_VIDEO_SIZES = new Set(["720x1280", "1280x720", "1024x1792", "1792x1024"]);

function normalizePositiveSeconds(value: unknown): string | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return String(value);
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return String(parsed);
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

function resolveInputReferenceValue(ir: IRVideoGenerationRequest): string | Blob | Record<string, any> | undefined {
	if (typeof Blob !== "undefined" && ir.inputReference instanceof Blob) return ir.inputReference;
	if (ir.inputReference && typeof ir.inputReference === "object" && !Array.isArray(ir.inputReference)) {
		const nativeReference = ir.inputReference as Record<string, any>;
		if (typeof nativeReference.file_id === "string" || typeof nativeReference.image_url === "string") return nativeReference;
	}
	return extractInputReferenceCandidate(ir.inputReference) ??
		extractInputReferenceCandidate(ir.inputImage) ??
		extractInputReferenceCandidate(ir.input?.image);
}

function extractInputReferenceFileId(value: unknown): string | null {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		(typeof Blob !== "undefined" && value instanceof Blob)
	) return null;
	const fileId = (value as Record<string, unknown>).file_id;
	return typeof fileId === "string" && fileId.trim().length > 0 ? fileId.trim() : null;
}

function buildOpenAiVideoJsonRequest(args: {
	ir: IRVideoGenerationRequest;
	model: string;
	seconds?: string;
	size?: string;
}): Record<string, any> {
	const { ir, model, seconds, size } = args;
	const request: Record<string, any> = {
		model,
		prompt: ir.prompt,
	};

	if (seconds != null) request.seconds = seconds;
	if (request.seconds != null) {
		const normalizedSeconds = normalizePositiveSeconds(request.seconds);
		if (normalizedSeconds != null) request.seconds = normalizedSeconds;
	}
	if (request.size == null && size) request.size = size;
	return request;
}

async function resolveInputReferenceBlob(
	refValue: string | Blob,
	mimeTypeHint?: string,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<{ blob: Blob; name: string } | null> {
	if (typeof Blob !== "undefined" && refValue instanceof Blob) {
		return { blob: refValue, name: typeof (refValue as File).name === "string" ? (refValue as File).name : "reference" };
	}
	const ref = typeof refValue === "string" ? refValue.trim() : "";
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
		const validated = await validateWebhookEndpointUrlForDelivery(ref);
		if (validated.ok === false) throw new Error(`openai_video_input_reference_rejected_${validated.reason}`);
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);
		try {
			const fetched = await (upstreamTiming
				? upstreamTiming.fetch(validated.url, { redirect: "manual", signal: controller.signal }, "media")
				: fetch(validated.url, { redirect: "manual", signal: controller.signal }));
			if (fetched.status >= 300 && fetched.status < 400) {
				throw new Error("openai_video_input_reference_redirect_not_allowed");
			}
			if (!fetched.ok) {
				throw new Error(`openai_video_input_reference_fetch_failed_${fetched.status}`);
			}
			const declaredLength = Number(fetched.headers.get("content-length") ?? 0);
			const maxBytes = 25 * 1024 * 1024;
			if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
				throw new Error("openai_video_input_reference_too_large");
			}
			const responseType = String(fetched.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
			if (!responseType?.startsWith("image/")) {
				throw new Error("openai_video_input_reference_invalid_content_type");
			}
			const bytes = await readStreamBytesWithLimit(fetched.body, maxBytes, "openai_video_input_reference_too_large");
			const arrayBuffer = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(arrayBuffer).set(bytes);
			fileBlob = new Blob([arrayBuffer], { type: responseType });
			mimeType = responseType;
			filename = new URL(validated.url).pathname.split("/").pop() || filename;
		} finally {
			clearTimeout(timeoutId);
		}
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
		(typeof json?.seconds === "string" ? json.seconds : undefined) ??
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
		progress: typeof json?.progress === "number" ? json.progress : undefined,
		createdAt: typeof json?.created_at === "number" ? json.created_at : undefined,
		completedAt: typeof json?.completed_at === "number" ? json.completed_at : null,
		expiresAt: typeof json?.expires_at === "number" ? json.expires_at : null,
		error: json?.error && typeof json.error === "object" ? json.error : null,
		prompt: typeof json?.prompt === "string" ? json.prompt : null,
		remixedFromVideoId: typeof json?.remixed_from_video_id === "string" ? json.remixed_from_video_id : null,
		seconds: seconds != null ? String(seconds) : undefined,
		size: typeof json?.size === "string" ? json.size : undefined,
		quality: typeof json?.quality === "string" ? json.quality : undefined,
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
	const inputReferenceFileId = extractInputReferenceFileId(inputReference);
	const mappedRequestEnabled = Boolean(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest);
	const secondsForMeta = seconds != null ? Number(seconds) : null;
	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;
	let mappedRequest: string | undefined;
	const invalidParameter = (param: "seconds" | "size", value: string, allowedValues: string[]): ExecutorResult => ({
		kind: "completed",
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: undefined as any,
			upstream_id: undefined,
			finish_reason: null,
		},
		upstream: new Response(
			JSON.stringify({
				error: {
					type: "invalid_request_error",
					param,
					message: `Unsupported OpenAI video ${param} value '${value}'. Supported values: ${allowedValues.join(", ")}.`,
				},
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		),
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
	});

	if (seconds != null && !OPENAI_VIDEO_SECONDS.has(seconds)) {
		return invalidParameter("seconds", seconds, [...OPENAI_VIDEO_SECONDS]);
	}
	if (size != null && !OPENAI_VIDEO_SIZES.has(size)) {
		return invalidParameter("size", size, [...OPENAI_VIDEO_SIZES]);
	}

	if (inputReferenceFileId && keyInfo.source === "gateway") {
		let ownedFile;
		try {
			ownedFile = await getBatchFileMeta(args.workspaceId, inputReferenceFileId);
		} catch (ownershipErr) {
			console.error("openai_video_input_file_ownership_check_failed", {
				error: ownershipErr,
				workspaceId: args.workspaceId,
				requestId: args.requestId,
				fileId: inputReferenceFileId,
			});
			const upstream = new Response(
				JSON.stringify({
					error: {
						type: "file_ownership_unavailable",
						message: "Unable to verify ownership of the OpenAI video input file.",
					},
				}),
				{ status: 503, headers: { "Content-Type": "application/json" } },
			);
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
				upstream,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
			};
		}

		if (ownedFile?.provider !== "openai" || ownedFile.keySource === "byok") {
			const upstream = new Response(
				JSON.stringify({
					error: {
						type: "file_not_found_or_not_owned",
						message: "The OpenAI video input file was not found or is not owned by this workspace.",
					},
				}),
				{ status: 404, headers: { "Content-Type": "application/json" } },
			);
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
				upstream,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
			};
		}
	}

	try {
		const reserved = await reserveVideoGenerationCredits({
			keyId: args.apiKeyId,
			authMethod: args.meta.authMethod,
			onReservationDenied: args.onReservationDenied,
			workspaceId: args.workspaceId,
			videoId: args.requestId,
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
		if (reserved.amountNanos > 0 && !reserved.held && !isInsufficientVideoReservationStatus(reserved.status)) {
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
			console.error("openai_video_reservation_release_failed", {
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

	let headers = openAICompatHeaders("openai", keyInfo.key, {
		"Idempotency-Key": args.requestId,
		...upstreamTestHeaders(args.meta),
	});
	let requestBody: BodyInit;
	const jsonBody = buildOpenAiVideoJsonRequest({
		ir,
		model,
		seconds,
		size,
	});

	try {
		if (inputReference && typeof inputReference === "object" && !(inputReference instanceof Blob)) {
			requestBody = JSON.stringify({ ...jsonBody, input_reference: inputReference });
			if (mappedRequestEnabled) mappedRequest = requestBody;
		} else {
		const form = new FormData();
		form.append("model", String(jsonBody.model ?? model));
		form.append("prompt", String(jsonBody.prompt ?? ir.prompt));
		if (jsonBody.seconds != null) form.append("seconds", String(jsonBody.seconds));
		if (jsonBody.size != null) form.append("size", String(jsonBody.size));
		if (typeof inputReference === "string" || inputReference instanceof Blob) {
			const resolved = await resolveInputReferenceBlob(inputReference, ir.inputReferenceMimeType, args.upstreamTiming);
			if (resolved) {
				form.append("input_reference", resolved.blob, resolved.name);
			}
		}
		requestBody = form;
		delete (headers as any)["Content-Type"];
		if (mappedRequestEnabled) mappedRequest = JSON.stringify({ ...jsonBody, ...(inputReference ? { input_reference: "[multipart]" } : {}) });
		}
	} catch (requestBuildErr) {
		await releaseReservationOnFailure();
		throw requestBuildErr;
	}

	let res: Response;
	try {
		res = await fetchUpstream(args, openAICompatUrl("openai", "/videos"), {
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
	if (!nativeVideoId) {
		await releaseReservationOnFailure();
		const upstream = new Response(
			JSON.stringify({
				error: {
					type: "invalid_upstream_response",
					message: "OpenAI video create response did not include a video id.",
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
				providerDispatchedAtMs:
					args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now(),
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
			const upstream = new Response(
				JSON.stringify({
					error: {
						type: "async_job_persistence_failed",
						message: "OpenAI video job was created upstream, but Phaseo could not persist gateway ownership metadata.",
						native_video_id: String(nativeVideoId),
						reservation_id: reservationId,
						reservation_status: reservationStatus,
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

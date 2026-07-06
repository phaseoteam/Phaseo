// Purpose: Shared non-text executor.
// Why: Keeps non-text execution on the IR path without going through adapter registry dispatch.
// How: Converts endpoint IR <-> provider payloads and calls provider endpoint executors directly.

import type {
	IRAudioSpeechRequest,
	IRAudioSpeechResponse,
	IRAudioTranscriptionRequest,
	IRAudioTranscriptionResponse,
	IRAudioTranslationRequest,
	IRAudioTranslationResponse,
	IRImageGenerationRequest,
	IRImageGenerationResponse,
	IRMusicGenerateRequest,
	IRMusicGenerateResponse,
	IROcrRequest,
	IROcrResponse,
	IRVideoGenerationRequest,
	IRVideoGenerationResponse,
	IRUsage,
} from "@core/ir";
import type { Endpoint } from "@core/types";
import type { ProviderExecuteArgs } from "@providers/types";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";
import { saveVideoJobMeta } from "@core/video-jobs";
import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "@core/video-reservations";
import { releaseWalletReservation } from "@core/wallet-reservations";
import {
	buildVideoPricingRequestOptions,
	resolveVideoSeconds,
	resolveVideoSize,
} from "@core/video-request-options";
import { isOpenAICompatProvider } from "@providers/openai-compatible/config";
import * as openaiImages from "@providers/openai/endpoints/images";
import * as openaiImagesEdits from "@providers/openai/endpoints/images-edits";
import * as openaiAudioSpeech from "@providers/openai/endpoints/audio-speech";
import * as openaiAudioTranscription from "@providers/openai/endpoints/audio-transcription";
import * as openaiAudioTranslation from "@providers/openai/endpoints/audio-translation";
import * as openaiVideo from "@providers/openai/endpoints/video";
import * as mistralOcr from "@providers/mistral/endpoints/ocr";
import * as elevenLabsAudioSpeech from "@providers/elevenlabs/endpoints/audio-speech";
import * as elevenLabsAudioTranscription from "@providers/elevenlabs/endpoints/audio-transcription";
import * as elevenLabsMusic from "@providers/elevenlabs/endpoints/music-generate";
import * as googleAiStudioImages from "@providers/google-ai-studio/endpoints/images";
import * as xiaomiAudioSpeech from "@providers/xiaomi/endpoints/audio-speech";
import * as xAiAudioSpeech from "@providers/x-ai/endpoints/audio-speech";
import * as sunoMusic from "@providers/suno/endpoints/music-generate";

type NonTextEndpoint =
	| "images.generations"
	| "images.edits"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "video.generation"
	| "ocr"
	| "music.generate";

type NonTextIRResponse =
	| IRImageGenerationResponse
	| IRAudioSpeechResponse
	| IRAudioTranscriptionResponse
	| IRAudioTranslationResponse
	| IRVideoGenerationResponse
	| IROcrResponse
	| IRMusicGenerateResponse;

function isNonTextEndpoint(endpoint: Endpoint): endpoint is NonTextEndpoint {
	return endpoint === "images.generations" ||
		endpoint === "images.edits" ||
		endpoint === "audio.speech" ||
		endpoint === "audio.transcription" ||
		endpoint === "audio.translations" ||
		endpoint === "video.generation" ||
		endpoint === "ocr" ||
		endpoint === "music.generate";
}

function numberOrUndefined(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value;
}

function normalizeUsage(raw: any, fallbackRequests: boolean = true): IRUsage | undefined {
	if ((!raw || typeof raw !== "object") && !fallbackRequests) return undefined;
	const source: Record<string, any> = raw && typeof raw === "object" ? { ...raw } : {};
	if (fallbackRequests && typeof source.requests !== "number") source.requests = 1;

	const inputTokens = Number(
		source.inputTokens ??
		source.input_tokens ??
		source.input_text_tokens ??
		source.prompt_tokens ??
		source.promptTokens ??
		source.prompt_token_count ??
		source.total_input_tokens ??
		source.embedding_tokens ??
		0,
	);
	const outputTokens = Number(
		source.outputTokens ??
		source.output_tokens ??
		source.output_text_tokens ??
		source.completion_tokens ??
		source.completionTokens ??
		source.completion_token_count ??
		source.total_output_tokens ??
		0,
	);
	const totalTokens = Number(
		source.totalTokens ??
		source.total_tokens ??
		source.totalTokenCount ??
		inputTokens + outputTokens,
	);

	const usage: any = {
		...source,
		inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
		outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
		totalTokens: Number.isFinite(totalTokens) ? totalTokens : inputTokens + outputTokens,
	};

	return usage as IRUsage;
}

function base64FromBuffer(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, i + chunk);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}

function withDefinedValues<T extends Record<string, any>>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
	) as Partial<T>;
}

function jsonErrorResponse(status: number, type: string, message: string, details?: Record<string, unknown>): Response {
	return new Response(
		JSON.stringify({
			error: {
				type,
				message,
				...(details ?? {}),
			},
		}),
		{ status, headers: { "Content-Type": "application/json" } },
	);
}

function irToAdapterBody(endpoint: NonTextEndpoint, ir: ExecutorExecuteArgs["ir"], providerModel: string): any {
	switch (endpoint) {
		case "images.generations": {
			const request = ir as IRImageGenerationRequest;
			return {
				model: providerModel,
				prompt: request.prompt,
				size: request.size,
				n: request.n,
				quality: request.quality,
				response_format: request.responseFormat,
				output_format: request.outputFormat,
				output_compression: request.outputCompression,
				background: request.background,
				moderation: request.moderation,
				style: request.style,
				user: request.userId,
			};
		}

		case "images.edits": {
			const request = ir as IRImageGenerationRequest;
			const raw = (request.rawRequest ?? {}) as Record<string, any>;
			return {
				model: providerModel,
				image: request.image ?? raw.image,
				mask: request.mask ?? raw.mask,
				prompt: request.prompt,
				size: request.size,
				n: request.n,
				quality: request.quality ?? raw.quality,
				response_format: request.responseFormat ?? raw.response_format,
				output_format: request.outputFormat ?? raw.output_format,
				output_compression: request.outputCompression ?? raw.output_compression,
				background: request.background ?? raw.background,
				moderation: request.moderation ?? raw.moderation,
				input_fidelity: request.inputFidelity ?? raw.input_fidelity,
				user: request.userId ?? raw.user,
			};
		}

		case "audio.speech": {
			const request = ir as IRAudioSpeechRequest;
			return {
				model: providerModel,
				input: request.input,
				voice: request.voice,
				format: request.format,
				response_format: request.responseFormat ?? request.format,
				stream_format: request.streamFormat,
				speed: request.speed,
				instructions: request.instructions,
				config: {
					elevenlabs: (request.vendor as any)?.elevenlabs,
				},
				user: request.userId,
			};
		}

		case "audio.transcription": {
			const request = ir as IRAudioTranscriptionRequest;
			return {
				model: providerModel,
				file: request.file,
				language: request.language,
				prompt: request.prompt,
				temperature: request.temperature,
				response_format: request.responseFormat,
				timestamp_granularities: request.timestampGranularities,
				include: request.include,
			};
		}

		case "audio.translations": {
			const request = ir as IRAudioTranslationRequest;
			return {
				model: providerModel,
				file: request.file,
				language: request.language,
				prompt: request.prompt,
				temperature: request.temperature,
				response_format: request.responseFormat,
			};
		}

		case "video.generation": {
			const request = ir as IRVideoGenerationRequest;
			const raw = (request.rawRequest ?? {}) as Record<string, any>;
			const canonicalSize = request.size ?? raw.size;
			const canonicalResolution = canonicalSize ? undefined : (request.resolution ?? raw.resolution);
			const inputReferences = Array.isArray(raw.input_references)
				? raw.input_references
				: Array.isArray(raw.inputReferences)
					? raw.inputReferences
					: undefined;
			const providerParams =
				raw.provider_params && typeof raw.provider_params === "object"
					? raw.provider_params
					: raw.providerParams && typeof raw.providerParams === "object"
						? raw.providerParams
						: undefined;
			return withDefinedValues({
				model: providerModel,
				prompt: request.prompt,
				duration: request.duration ?? request.durationSeconds ?? request.seconds,
				size: canonicalSize,
				resolution: canonicalResolution,
				aspect_ratio: canonicalSize ? undefined : request.aspectRatio,
				compression_quality: request.compressionQuality,
				negative_prompt: request.negativePrompt,
				sample_count: request.sampleCount,
				seed: request.seed,
				person_generation: request.personGeneration,
				generate_audio: request.generateAudio,
				enhance_prompt: request.enhancePrompt,
				input_references: inputReferences,
				provider_params: providerParams,
				output: request.outputAccess ? { access: request.outputAccess } : undefined,
				webhook: request.webhook,
			});
		}

		case "ocr": {
			const request = ir as IROcrRequest;
			return {
				model: providerModel,
				image: request.image,
				language: request.language,
			};
		}

		case "music.generate": {
			const request = ir as IRMusicGenerateRequest;
			return {
				model: providerModel,
				prompt: request.prompt,
				duration: request.duration,
				format: request.format,
				suno: (request.vendor as any)?.suno,
				elevenlabs: (request.vendor as any)?.elevenlabs,
				minimax: (request.vendor as any)?.minimax,
			};
		}
	}
}

async function adapterResultToIR(
	endpoint: NonTextEndpoint,
	args: ExecutorExecuteArgs,
	normalized: any,
	billUsage?: any,
): Promise<NonTextIRResponse> {
	const model = args.providerModelSlug || (args.ir as any).model;
	const provider = args.providerId;
	const requestId = args.requestId;
	const usage = normalizeUsage(normalized?.usage ?? billUsage, true);

	switch (endpoint) {
		case "images.generations":
		case "images.edits": {
			const payload = normalized ?? {};
			const created = Number(payload?.created);
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				created: Number.isFinite(created) ? created : Math.floor(Date.now() / 1000),
				model,
				provider,
				data: Array.isArray(payload?.data)
					? payload.data.map((item: any) => ({
						url: item?.url ?? null,
						b64Json: item?.b64_json ?? item?.b64Json ?? null,
						revisedPrompt: item?.revised_prompt ?? item?.revisedPrompt ?? null,
					}))
					: [],
				usage,
				rawResponse: payload,
			};
		}

		case "audio.speech": {
			const payload = normalized ?? {};
			let audioBase64 = payload?.audio_base64 ?? payload?.audio?.data;
			let mimeType = payload?.mime_type ?? payload?.audio?.mimeType;
			if (!audioBase64) {
				const buffer = await (payload?.upstream as Response).clone().arrayBuffer();
				audioBase64 = base64FromBuffer(buffer);
				mimeType = payload?.upstream?.headers?.get("content-type") ?? mimeType;
			}
			const speechInput =
				typeof (args.ir as IRAudioSpeechRequest)?.input === "string"
					? (args.ir as IRAudioSpeechRequest).input
					: "";
			const speechUsage: (IRUsage & Record<string, any>) =
				usage && typeof usage === "object"
					? { ...(usage as any) }
					: ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1 } as any);
			if (speechInput.length > 0 && typeof speechUsage.input_characters !== "number") {
				speechUsage.input_characters = speechInput.length;
			}
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				model,
				provider,
				audio: {
					data: audioBase64,
					url: payload?.audio_url ?? payload?.audio?.url,
					mimeType: mimeType ?? "application/octet-stream",
				},
				usage: speechUsage,
				rawResponse: payload,
			};
		}

		case "audio.transcription": {
			const payload = normalized ?? {};
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				model,
				provider,
				text: String(payload?.text ?? ""),
				segments: Array.isArray(payload?.segments) ? payload.segments : undefined,
				usage,
				rawResponse: payload,
			};
		}

		case "audio.translations": {
			const payload = normalized ?? {};
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				model,
				provider,
				text: String(payload?.text ?? ""),
				segments: Array.isArray(payload?.segments) ? payload.segments : undefined,
				usage,
				rawResponse: payload,
			};
		}

		case "video.generation": {
			const payload = normalized ?? {};
			const statusRaw = String(payload?.status ?? "").toLowerCase();
			const status: IRVideoGenerationResponse["status"] = statusRaw === "completed" || statusRaw === "succeeded"
				? "completed"
				: statusRaw === "cancelled" || statusRaw === "canceled"
					? "cancelled"
					: statusRaw === "expired"
						? "expired"
						: statusRaw === "failed" || statusRaw === "error"
							? "failed"
							: statusRaw === "processing" || statusRaw === "in_progress" || statusRaw === "running"
								? "in_progress"
								: "queued";
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				model,
				provider,
				status,
				output: Array.isArray(payload?.output)
					? payload.output
					: Array.isArray(payload?.data)
						? payload.data
						: undefined,
				result: payload?.result ?? payload,
				usage,
				rawResponse: payload,
			};
		}

		case "ocr": {
			const payload = normalized ?? {};
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				model: payload?.model ?? model,
				provider,
				text: String(payload?.text ?? ""),
				usage,
				rawResponse: payload,
			};
		}

		case "music.generate": {
			const payload = normalized ?? {};
			const outputItem = Array.isArray(payload?.output) ? payload.output[0] : undefined;
			return {
				id: requestId,
				nativeId: payload?.id ?? payload?.nativeResponseId ?? undefined,
				model: payload?.model ?? model,
				provider,
				status: payload?.status ?? "completed",
				audioUrl: payload?.audio_url ?? outputItem?.audio_url ?? undefined,
				audioBase64: payload?.audio_base64 ?? undefined,
				result: payload?.result ?? payload,
				usage,
				rawResponse: payload,
			};
		}
	}
}

async function parseJsonIfAny(response: Response): Promise<any | null> {
	const contentType = response.headers.get("content-type") || "";
	if (!contentType.toLowerCase().includes("application/json")) return null;
	return response.clone().json().catch(() => null);
}

async function executeProviderEndpoint(
	endpoint: NonTextEndpoint,
	providerId: string,
	providerArgs: ProviderExecuteArgs,
) {
	switch (endpoint) {
		case "images.generations":
			if (providerId === "google-ai-studio") {
				return googleAiStudioImages.exec(providerArgs);
			}
			if (!isOpenAICompatProvider(providerId)) {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return openaiImages.exec(providerArgs);
		case "images.edits":
			if (!isOpenAICompatProvider(providerId)) {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return openaiImagesEdits.exec(providerArgs);
		case "audio.speech":
			if (providerId === "elevenlabs") {
				return elevenLabsAudioSpeech.exec(providerArgs);
			}
			if (providerId === "xiaomi") {
				return xiaomiAudioSpeech.exec(providerArgs);
			}
			if (providerId === "x-ai" || providerId === "xai") {
				return xAiAudioSpeech.exec(providerArgs);
			}
			if (!isOpenAICompatProvider(providerId)) {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return openaiAudioSpeech.exec(providerArgs);
		case "audio.transcription":
			if (providerId === "elevenlabs") {
				return elevenLabsAudioTranscription.exec(providerArgs);
			}
			if (!isOpenAICompatProvider(providerId)) {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return openaiAudioTranscription.exec(providerArgs);
		case "audio.translations":
			if (!isOpenAICompatProvider(providerId)) {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return openaiAudioTranslation.exec(providerArgs);
		case "video.generation":
			if (!isOpenAICompatProvider(providerId)) {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return openaiVideo.exec(providerArgs);
		case "ocr":
			if (providerId !== "mistral") {
				throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
			}
			return mistralOcr.exec(providerArgs);
		case "music.generate":
			if (providerId === "suno") return sunoMusic.exec(providerArgs);
			if (providerId === "elevenlabs") return elevenLabsMusic.exec(providerArgs);
			throw new Error(`non_text_provider_not_supported_${providerId}_${endpoint}`);
		default:
			throw new Error(`non_text_unsupported_endpoint_${endpoint}`);
	}
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	if (!isNonTextEndpoint(args.endpoint)) {
		throw new Error(`non_text_unsupported_endpoint_${args.endpoint}`);
	}

	const providerModel = args.providerModelSlug || (args.ir as any).model;
	const isVideoGeneration = args.endpoint === "video.generation";
	const videoIr = isVideoGeneration ? (args.ir as IRVideoGenerationRequest) : null;
	const videoSeconds = videoIr ? resolveVideoSeconds({
		seconds: videoIr.seconds,
		duration_seconds: videoIr.durationSeconds,
		duration: videoIr.duration,
		video_params: ((videoIr.rawRequest ?? {}) as Record<string, any>).video_params,
	}) : undefined;
	const videoSize = videoIr ? resolveVideoSize({
		size: videoIr.size,
		resolution: videoIr.resolution,
		input_resolution: ((videoIr.rawRequest ?? {}) as Record<string, any>).input_resolution,
		video_params: ((videoIr.rawRequest ?? {}) as Record<string, any>).video_params,
	}) : undefined;
	const videoQuality = videoIr?.quality ?? null;
	const body = irToAdapterBody(args.endpoint, args.ir, providerModel);
	const mappedRequest = (() => {
		if (!(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)) return undefined;
		try {
			return JSON.stringify(body);
		} catch {
			return undefined;
		}
	})();

	let reservationId: string | null = null;
	let reservationStatus: string | null = null;
	let reservedNanos: number | null = null;
	let reservationGateError: { status: number; type: string; message: string } | null = null;
	if (isVideoGeneration) {
		try {
			const reserved = await reserveVideoGenerationCredits({
				workspaceId: args.workspaceId,
				videoId: args.requestId,
				providerId: args.providerId,
				model: providerModel,
				seconds: videoSeconds ?? null,
				pricingCard: args.pricingCard,
				requestOptions: buildVideoPricingRequestOptions({
					size: videoSize,
					resolution: videoIr?.resolution,
					quality: videoQuality,
					seconds: videoSeconds,
				}),
				isByok: Array.isArray(args.byokMeta) && args.byokMeta.length > 0,
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
			console.error("adapter_video_reservation_failed_pre_submit", {
				error: reserveErr,
				workspaceId: args.workspaceId,
				requestId: args.requestId,
				providerId: args.providerId,
			});
			reservationGateError = {
				status: 503,
				type: "reservation_unavailable",
				message: "Unable to reserve credits for video generation.",
			};
		}
	}

	const releaseVideoReservationOnFailure = async () => {
		if (!reservationId) return;
		try {
			await releaseWalletReservation({
				workspaceId: args.workspaceId,
				reservationId,
				releaseRefId: args.requestId,
			});
		} catch (releaseErr) {
			console.error("adapter_video_reservation_release_failed", {
				error: releaseErr,
				workspaceId: args.workspaceId,
				requestId: args.requestId,
				providerId: args.providerId,
				reservationId,
			});
		}
	};

	if (isInsufficientVideoReservationStatus(reservationStatus)) {
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream: jsonErrorResponse(402, "insufficient_funds", "Insufficient available credits for video reservation hold."),
			mappedRequest,
		};
	}
	if (reservationGateError) {
		return {
			kind: "completed",
			ir: undefined,
			bill: { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: undefined, finish_reason: null },
			upstream: jsonErrorResponse(
				reservationGateError.status,
				reservationGateError.type,
				reservationGateError.message,
			),
			mappedRequest,
		};
	}

	const providerArgs: ProviderExecuteArgs = {
		endpoint: args.endpoint,
		model: providerModel,
		body,
		meta: {
			requestId: args.requestId,
			apiKeyId: "",
			apiKeyRef: "",
			apiKeyKid: "",
			stream: false,
			debug: args.meta.debug,
			echoUpstreamRequest: args.meta.echoUpstreamRequest,
			returnUpstreamRequest: args.meta.returnUpstreamRequest,
			returnUpstreamResponse: args.meta.returnUpstreamResponse,
			upstreamStartMs: args.meta.upstreamStartMs,
			testId: args.meta.testId,
		},
		workspaceId: args.workspaceId,
		providerId: args.providerId,
		byokMeta: args.byokMeta,
		pricingCard: args.pricingCard,
		providerModelSlug: args.providerModelSlug,
		stream: false,
	};

	let adapterResult: Awaited<ReturnType<typeof executeProviderEndpoint>>;
	try {
		adapterResult = await executeProviderEndpoint(args.endpoint, args.providerId, providerArgs);
	} catch (error) {
		if (isVideoGeneration) await releaseVideoReservationOnFailure();
		throw error;
	}
	const keySource = adapterResult.keySource ?? "gateway";
	const byokKeyId = adapterResult.byokKeyId ?? null;

	if (adapterResult.kind === "stream") {
		return {
			kind: "stream",
			stream: adapterResult.stream ?? adapterResult.upstream.body ?? new ReadableStream<Uint8Array>(),
			usageFinalizer: adapterResult.usageFinalizer ?? (async () => null),
			bill: adapterResult.bill,
			upstream: adapterResult.upstream,
			keySource,
			byokKeyId,
			mappedRequest,
		};
	}

	if (!adapterResult.upstream.ok) {
		if (isVideoGeneration) await releaseVideoReservationOnFailure();
		return {
			kind: "completed",
			ir: undefined,
			bill: adapterResult.bill,
			upstream: adapterResult.upstream,
			keySource,
			byokKeyId,
			mappedRequest,
			rawResponse: await parseJsonIfAny(adapterResult.upstream),
		};
	}

	const normalized = adapterResult.normalized ?? await parseJsonIfAny(adapterResult.upstream);
	const irReadyPayload = {
		...(normalized && typeof normalized === "object" ? normalized : {}),
		upstream: adapterResult.upstream,
	};
	const ir = await adapterResultToIR(args.endpoint, args, irReadyPayload, adapterResult.bill?.usage);
	if (isVideoGeneration) {
		const videoResponse = ir as IRVideoGenerationResponse;
		if (!videoResponse.nativeId) {
			await releaseVideoReservationOnFailure();
			return {
				kind: "completed",
				ir: undefined,
				bill: adapterResult.bill,
				upstream: jsonErrorResponse(
					502,
					"invalid_upstream_response",
					"Video create response did not include a native video id.",
				),
				keySource,
				byokKeyId,
				mappedRequest,
				rawResponse: normalized,
			};
		}
		try {
			await saveVideoJobMeta(args.workspaceId, args.requestId, {
				provider: args.providerId,
				providerTaskId: String(videoResponse.nativeId),
				requestId: args.requestId,
				sessionId: args.meta.sessionId ?? null,
				appId: args.meta.appId ?? null,
				model: providerModel,
				seconds: videoSeconds ?? null,
				resolution: videoSize ?? null,
				quality: videoQuality,
				outputAccess: videoIr?.outputAccess ?? "both",
				webhook: videoIr?.webhook as Record<string, unknown> | null,
				reservationId,
				reservedNanos,
				reservationStatus,
				keySource,
				byokKeyId,
				createdAt: Date.now(),
			}, String(videoResponse.nativeId), videoResponse.status);
		} catch (error) {
			console.error("adapter_video_job_meta_store_failed", {
				error,
				workspaceId: args.workspaceId,
				videoId: args.requestId,
				nativeId: videoResponse.nativeId,
				providerId: args.providerId,
				reservationId,
				reservationStatus,
				note: "reservation_retained_for_manual_reconciliation",
			});
			return {
				kind: "completed",
				ir: undefined,
				bill: adapterResult.bill,
				upstream: jsonErrorResponse(
					502,
					"async_job_persistence_failed",
					"Video job was created upstream, but Phaseo could not persist gateway ownership metadata.",
					{
						native_video_id: String(videoResponse.nativeId),
						reservation_id: reservationId,
						reservation_status: reservationStatus,
					},
				),
				keySource,
				byokKeyId,
				mappedRequest,
				rawResponse: normalized,
			};
		}
	}

	const generationMs =
		numberOrUndefined(args.meta.upstreamStartMs != null ? Date.now() - args.meta.upstreamStartMs : undefined) ??
		undefined;

	return {
		kind: "completed",
		ir,
		bill: adapterResult.bill,
		upstream: adapterResult.upstream,
		keySource,
		byokKeyId,
		mappedRequest,
		rawResponse: normalized,
		timing: generationMs != null ? { generationMs } : undefined,
	};
}

export const nonTextAdapterExecutor: ProviderExecutor = execute;

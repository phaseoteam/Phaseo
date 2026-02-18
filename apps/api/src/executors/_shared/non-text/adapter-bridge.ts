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
	IRUsage,
} from "@core/ir";
import type { Endpoint } from "@core/types";
import type { ProviderExecuteArgs } from "@providers/types";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";
import { isOpenAICompatProvider } from "@providers/openai-compatible/config";
import * as openaiImages from "@providers/openai/endpoints/images";
import * as openaiImagesEdits from "@providers/openai/endpoints/images-edits";
import * as openaiAudioSpeech from "@providers/openai/endpoints/audio-speech";
import * as openaiAudioTranscription from "@providers/openai/endpoints/audio-transcription";
import * as openaiAudioTranslation from "@providers/openai/endpoints/audio-translation";
import * as mistralOcr from "@providers/mistral/endpoints/ocr";
import * as elevenLabsAudioSpeech from "@providers/elevenlabs/endpoints/audio-speech";
import * as elevenLabsAudioTranscription from "@providers/elevenlabs/endpoints/audio-transcription";
import * as elevenLabsMusic from "@providers/elevenlabs/endpoints/music-generate";
import * as sunoMusic from "@providers/suno/endpoints/music-generate";

type NonTextEndpoint =
	| "images.generations"
	| "images.edits"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "ocr"
	| "music.generate";

type NonTextIRResponse =
	| IRImageGenerationResponse
	| IRAudioSpeechResponse
	| IRAudioTranscriptionResponse
	| IRAudioTranslationResponse
	| IROcrResponse
	| IRMusicGenerateResponse;

function isNonTextEndpoint(endpoint: Endpoint): endpoint is NonTextEndpoint {
	return endpoint === "images.generations" ||
		endpoint === "images.edits" ||
		endpoint === "audio.speech" ||
		endpoint === "audio.transcription" ||
		endpoint === "audio.translations" ||
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
		source.embedding_tokens ??
		0,
	);
	const outputTokens = Number(
		source.outputTokens ??
		source.output_tokens ??
		source.output_text_tokens ??
		source.completion_tokens ??
		0,
	);
	const totalTokens = Number(source.totalTokens ?? source.total_tokens ?? inputTokens + outputTokens);

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
				usage,
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
	const body = irToAdapterBody(args.endpoint, args.ir, providerModel);
	const mappedRequest = (() => {
		if (!(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)) return undefined;
		try {
			return JSON.stringify(body);
		} catch {
			return undefined;
		}
	})();

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
		},
		teamId: args.teamId,
		providerId: args.providerId,
		byokMeta: args.byokMeta,
		pricingCard: args.pricingCard,
		providerModelSlug: args.providerModelSlug,
		stream: false,
	};

	const adapterResult = await executeProviderEndpoint(args.endpoint, args.providerId, providerArgs);
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

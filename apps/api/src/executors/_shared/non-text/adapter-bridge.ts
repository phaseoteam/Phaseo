// Purpose: Shared non-text executor bridge.
// Why: Reuses provider adapter endpoint logic while enforcing IR execution flow.
// How: Converts endpoint IR <-> adapter payloads and delegates upstream execution.

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
import { adapterFor } from "@providers/index";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "@executors/types";

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
				speed: request.speed,
				instructions: request.instructions,
				user: request.userId,
			};
		}

		case "audio.transcription": {
			const request = ir as IRAudioTranscriptionRequest;
			return {
				model: providerModel,
				audio_url: request.audioUrl,
				audio_b64: request.audioBase64,
				language: request.language,
				prompt: request.prompt,
				temperature: request.temperature,
			};
		}

		case "audio.translations": {
			const request = ir as IRAudioTranslationRequest;
			return {
				model: providerModel,
				audio_url: request.audioUrl,
				audio_b64: request.audioBase64,
				language: request.language,
				prompt: request.prompt,
				temperature: request.temperature,
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

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	if (!isNonTextEndpoint(args.endpoint)) {
		throw new Error(`adapter_bridge_non_text_unsupported_endpoint_${args.endpoint}`);
	}

	const providerModel = args.providerModelSlug || (args.ir as any).model;
	const adapter = adapterFor(args.providerId, args.endpoint);
	if (!adapter) {
		throw new Error(`adapter_bridge_missing_adapter_${args.providerId}_${args.endpoint}`);
	}

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

	const adapterResult = await adapter.execute(providerArgs);
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

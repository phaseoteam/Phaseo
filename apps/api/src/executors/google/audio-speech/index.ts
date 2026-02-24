// Purpose: Executor for google / audio-speech.
// Why: Runs Gemini native text-to-speech instead of relying on OpenAI-compatible routing.
// How: Maps IR audio.speech request to generateContent with AUDIO modality and voice config.

import type { IRAudioSpeechRequest, IRAudioSpeechResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import {
	resolveGoogleTtsVoiceName,
	validateGoogleTtsVoiceForModel,
} from "@providers/google-ai-studio/voices";
import type { ProviderExecutor } from "../../types";

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";

function resolveGeminiBaseUrl(bindings: Record<string, string | undefined>): string {
	const baseRoot = String(
		bindings.GOOGLE_BASE_URL || bindings.GOOGLE_AI_STUDIO_BASE_URL || GOOGLE_API_BASE,
	).replace(/\/+$/, "");
	return /\/v1(beta)?$/i.test(baseRoot) ? baseRoot : `${baseRoot}/v1beta`;
}

function nonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function resolveGoogleVoiceName(ir: IRAudioSpeechRequest): string | undefined {
	const directVoice = ir.voice;
	if (typeof directVoice === "string") return nonEmptyString(directVoice);
	if (directVoice && typeof directVoice === "object") {
		const objectVoice =
			nonEmptyString((directVoice as any).voiceName) ??
			nonEmptyString((directVoice as any).name) ??
			nonEmptyString((directVoice as any).id);
		if (objectVoice) return objectVoice;
	}

	const raw = ir.rawRequest && typeof ir.rawRequest === "object" ? ir.rawRequest : {};
	const googleConfig = (raw as any)?.config?.google ?? {};
	return nonEmptyString(googleConfig.voice_name) ?? nonEmptyString(googleConfig.voiceName);
}

function invalidVoiceResponse(voice: string, model: string, supported: string[]): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "invalid_request_error",
				message:
					`Invalid voice "${voice}" for Google model "${model}". ` +
					`Supported voices: ${supported.join(", ")}`,
				param: "voice",
			},
		}),
		{ status: 400, headers: { "Content-Type": "application/json" } },
	);
}

function irToGeminiTtsRequest(ir: IRAudioSpeechRequest): Record<string, any> {
	const voiceName = resolveGoogleVoiceName(ir);
	const text = nonEmptyString(ir.input) ?? "";
	const instructions = nonEmptyString(ir.instructions);
	const contentText = instructions ? `${instructions}\n\n${text}` : text;

	const generationConfig: Record<string, any> = {
		responseModalities: ["AUDIO"],
	};
	if (voiceName) {
		generationConfig.speechConfig = {
			voiceConfig: {
				prebuiltVoiceConfig: {
					voiceName,
				},
			},
		};
	}

	return {
		contents: [
			{
				role: "user",
				parts: [{ text: contentText }],
			},
		],
		generationConfig,
	};
}

function extractInlineAudio(part: any): { data?: string; mimeType?: string } | null {
	if (!part || typeof part !== "object") return null;
	if (part.inlineData && typeof part.inlineData === "object") {
		return {
			data: part.inlineData.data,
			mimeType: part.inlineData.mimeType ?? part.inlineData.mime_type,
		};
	}
	if (part.inline_data && typeof part.inline_data === "object") {
		return {
			data: part.inline_data.data,
			mimeType: part.inline_data.mimeType ?? part.inline_data.mime_type,
		};
	}
	return null;
}

function geminiTtsToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRAudioSpeechResponse | null {
	const parts = json?.candidates?.[0]?.content?.parts;
	const audioPart = Array.isArray(parts)
		? parts
			.map((part) => extractInlineAudio(part))
			.find((value) => Boolean(value?.data))
		: null;
	if (!audioPart?.data) return null;

	return {
		id: requestId,
		nativeId: json?.responseId ?? json?.id ?? undefined,
		model,
		provider,
		audio: {
			data: audioPart.data,
			mimeType: audioPart.mimeType ?? "audio/wav",
		},
		usage: googleUsageMetadataToIRUsage(json?.usageMetadata),
		rawResponse: json,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	let ir = args.ir as IRAudioSpeechRequest;
	const model = args.providerModelSlug || ir.model || "gemini-2.5-flash-preview-tts";
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GOOGLE_API_KEY,
	);

	const voiceCandidate = resolveGoogleVoiceName(ir);
	if (voiceCandidate != null) {
		const validation = validateGoogleTtsVoiceForModel(model, voiceCandidate);
		if (!validation.ok) {
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
				upstream: invalidVoiceResponse(voiceCandidate, model, validation.supported),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
		ir = {
			...ir,
			voice: validation.resolved,
		} as IRAudioSpeechRequest;
	}

	const bodyObject = irToGeminiTtsRequest(ir);
	const requestBody = JSON.stringify(bodyObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;
	const baseUrl = resolveGeminiBaseUrl(bindings);

	const upstream = await fetch(
		`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyInfo.key)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: requestBody,
		},
	);

	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as any,
		upstream_id: upstream.headers.get("x-request-id") ?? undefined,
		finish_reason: null as string | null,
	};

	if (!upstream.ok) {
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const json = await upstream.json().catch(() => ({}));
	const irResponse = geminiTtsToIR(json, args.requestId, model, args.providerId);
	if (!irResponse) {
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: new Response(
				JSON.stringify({
					error: {
						type: "upstream_protocol_error",
						message: "google_tts_audio_output_missing",
					},
				}),
				{ status: 502, headers: { "Content-Type": "application/json" } },
			),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json,
		};
	}

	return {
		kind: "completed",
		ir: irResponse,
		bill,
		upstream,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
	};
}

export const executor: ProviderExecutor = execute;

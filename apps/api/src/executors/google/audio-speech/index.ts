// Purpose: Executor for google / audio-speech.
// Why: Runs Gemini native text-to-speech instead of relying on OpenAI-compatible routing.
// How: Maps IR audio.speech request to generateContent with AUDIO modality, voice config
//      (prebuilt or, on 3.8, custom voice ids) and the requested output format.

import type { IRAudioSpeechRequest, IRAudioSpeechResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import {
	googleTtsSupportsCustomVoices,
	isGoogleCustomVoiceId,
	validateGoogleTtsVoiceForModel,
} from "@providers/google-ai-studio/voices";
import type { ProviderExecutor } from "../../types";

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";

// Gemini 3.8 TTS takes generationConfig.responseFormat.audio.mimeType. Google's speech guide
// lists WAV, L16, mu-law and A-law; Phaseo's schema exposes wav and pcm of those.
const GEMINI_38_AUDIO_MIME_TYPES: Record<string, string> = {
	wav: "AUDIO_WAV",
	pcm: "AUDIO_L16",
};
// Older Gemini TTS models have no documented format setting and return raw 24 kHz PCM;
// Phaseo adds a WAV header itself when wav is asked for.
const LEGACY_FORMATS = new Set(["wav", "pcm"]);

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

function invalidParamResponse(param: string, message: string): Response {
	return new Response(
		JSON.stringify({ error: { type: "invalid_request_error", message, param } }),
		{ status: 400, headers: { "Content-Type": "application/json" } },
	);
}

function invalidVoiceResponse(voice: string, model: string, supported: string[], message?: string): Response {
	return invalidParamResponse(
		"voice",
		message ??
			`Invalid voice "${voice}" for Google model "${model}". ` +
			`Supported voices: ${supported.join(", ")}`,
	);
}

/**
 * The format to return. Gemini only makes WAV or raw PCM; any other request (mp3 is what
 * most clients send by default) gets WAV with a matching content type rather than a 400,
 * so existing callers keep working.
 */
function resolveRequestedFormat(model: string, ir: IRAudioSpeechRequest): { format?: string } {
	const format = ir.responseFormat ?? ir.format;
	if (!format) return {};
	const allowed = googleTtsSupportsCustomVoices(model) ? Object.keys(GEMINI_38_AUDIO_MIME_TYPES) : [...LEGACY_FORMATS];
	return { format: allowed.includes(format) ? format : "wav" };
}

function irToGeminiTtsRequest(ir: IRAudioSpeechRequest, model: string, format?: string): Record<string, any> {
	const voiceName = resolveGoogleVoiceName(ir);
	const text = nonEmptyString(ir.input) ?? "";
	const instructions = nonEmptyString(ir.instructions);
	const contentText = instructions ? `${instructions}\n\n${text}` : text;

	const generationConfig: Record<string, any> = {
		responseModalities: ["AUDIO"],
	};
	if (voiceName) {
		// Custom voice ids go in voiceConfig.voice; prebuilt names keep prebuiltVoiceConfig.
		generationConfig.speechConfig = {
			voiceConfig: isGoogleCustomVoiceId(voiceName)
				? { voice: voiceName }
				: { prebuiltVoiceConfig: { voiceName } },
		};
	}
	const mimeType = format && googleTtsSupportsCustomVoices(model) ? GEMINI_38_AUDIO_MIME_TYPES[format] : undefined;
	if (mimeType) {
		generationConfig.responseFormat = { audio: { mimeType } };
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

function isRawPcmMimeType(mimeType: string | undefined): boolean {
	return /^audio\/(?:l16|pcm)\b/i.test(mimeType ?? "");
}

function base64ToBytes(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

// Google's raw speech audio is 16-bit mono PCM; the rate is in the MIME type (default 24 kHz).
function wrapPcmAsWav(base64Pcm: string, mimeType: string | undefined): string {
	const pcm = base64ToBytes(base64Pcm);
	const rate = Number(/rate=(\d+)/i.exec(mimeType ?? "")?.[1]) || 24000;
	const header = new DataView(new ArrayBuffer(44));
	const writeTag = (offset: number, tag: string) => {
		for (let i = 0; i < 4; i += 1) header.setUint8(offset + i, tag.charCodeAt(i));
	};
	writeTag(0, "RIFF");
	header.setUint32(4, 36 + pcm.length, true);
	writeTag(8, "WAVE");
	writeTag(12, "fmt ");
	header.setUint32(16, 16, true);
	header.setUint16(20, 1, true);
	header.setUint16(22, 1, true);
	header.setUint32(24, rate, true);
	header.setUint32(28, rate * 2, true);
	header.setUint16(32, 2, true);
	header.setUint16(34, 16, true);
	writeTag(36, "data");
	header.setUint32(40, pcm.length, true);
	const wav = new Uint8Array(44 + pcm.length);
	wav.set(new Uint8Array(header.buffer), 0);
	wav.set(pcm, 44);
	return bytesToBase64(wav);
}

function geminiTtsToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
	format?: string,
): IRAudioSpeechResponse | null {
	const parts = json?.candidates?.[0]?.content?.parts;
	const audioPart = Array.isArray(parts)
		? parts
			.map((part) => extractInlineAudio(part))
			.find((value) => Boolean(value?.data))
		: null;
	if (!audioPart?.data) return null;

	// Older models only return raw PCM, so a wav request gets a header added here.
	const wrapAsWav = format === "wav" && isRawPcmMimeType(audioPart.mimeType);
	return {
		id: requestId,
		nativeId: json?.responseId ?? json?.id ?? undefined,
		model,
		provider,
		audio: wrapAsWav
			? { data: wrapPcmAsWav(audioPart.data, audioPart.mimeType), mimeType: "audio/wav" }
			: { data: audioPart.data, mimeType: audioPart.mimeType ?? "audio/wav" },
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
		() => bindings.GOOGLE_AI_STUDIO_API_KEY,
	);

	const rejected = (upstream: Response): ExecutorResult => ({
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
	});

	const voiceCandidate = resolveGoogleVoiceName(ir);
	if (voiceCandidate != null) {
		const validation = validateGoogleTtsVoiceForModel(model, voiceCandidate);
		if (!validation.ok) {
			return rejected(invalidVoiceResponse(voiceCandidate, model, validation.supported, validation.message));
		}
		ir = {
			...ir,
			voice: validation.resolved,
		} as IRAudioSpeechRequest;
	}

	const requested = resolveRequestedFormat(model, ir);
	const bodyObject = irToGeminiTtsRequest(ir, model, requested.format);
	const requestBody = JSON.stringify(bodyObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;
	const baseUrl = resolveGeminiBaseUrl(bindings);

	const upstream = await fetchUpstream(
		args,
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
	const irResponse = geminiTtsToIR(json, args.requestId, model, args.providerId, requested.format);
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


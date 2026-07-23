import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
} from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function extractVoiceCandidate(voice: AudioSpeechRequest["voice"]): string | undefined {
	if (typeof voice === "string") {
		const trimmed = voice.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (voice && typeof voice === "object") {
		const candidate =
			(voice as Record<string, any>).id ??
			(voice as Record<string, any>).voice_id ??
			(voice as Record<string, any>).voiceId ??
			(voice as Record<string, any>).name ??
			(voice as Record<string, any>).voiceName;
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return undefined;
}

function mimeTypeForCodec(codec: string): string {
	switch (codec) {
		case "wav":
			return "audio/wav";
		case "pcm":
			return "audio/pcm";
		case "mulaw":
			return "audio/basic";
		case "alaw":
			return "audio/basic";
		case "mp3":
		default:
			return "audio/mpeg";
	}
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const adapterPayload = buildAdapterPayload(
		AudioSpeechSchema,
		args.body,
		[],
	).adapterPayload as AudioSpeechRequest;
	const body: AudioSpeechRequest = {
		...adapterPayload,
		model: args.providerModelSlug || adapterPayload.model,
	};

	const codec = body.response_format ?? body.format ?? "mp3";
	const requestBody = {
		text: body.input,
		voice_id: extractVoiceCandidate(body.voice) ?? "eve",
		output_format: {
			codec,
		},
	};

	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/tts"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
		body: JSON.stringify(requestBody),
	});

	const usage = {
		input_characters: typeof body.input === "string" ? body.input.length : 0,
		requests: 1,
	};

	const normalized = res.ok
		? {
				upstream: res.clone(),
				mime_type: res.headers.get("content-type") ?? mimeTypeForCodec(codec),
				usage,
			}
		: undefined;

	return {
		kind: "completed",
		upstream: res,
		bill: {
			cost_cents: 0,
			currency: "USD" as const,
			usage,
			upstream_id:
				res.headers.get("x-request-id") ??
				res.headers.get("request-id"),
			finish_reason: null,
		},
		normalized,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}

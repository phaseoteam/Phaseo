import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranscriptionSchema, type AudioTranscriptionRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveOpenAICompatKey } from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(JSON.stringify({ error: { type: "invalid_request_error", message, param } }), {
		status: 400,
		headers: { "Content-Type": "application/json" },
	});
}

function emptyBill() {
	return { cost_cents: 0, currency: "USD" as const, usage: undefined, upstream_id: null, finish_reason: null };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const body = buildAdapterPayload(AudioTranscriptionSchema, args.body, []).adapterPayload as AudioTranscriptionRequest;
	const unsupported = body.prompt !== undefined ? "prompt"
		: body.temperature !== undefined ? "temperature"
		: body.stream === true ? "stream"
		: (body.timestamp_granularities?.length ?? 0) > 0 ? "timestamp_granularities"
		: (body.include?.length ?? 0) > 0 ? "include"
		: body.chunking_strategy !== undefined ? "chunking_strategy"
		: body.response_format && body.response_format !== "json" ? "response_format"
		: null;
	if (unsupported) {
		return {
			kind: "completed",
			upstream: invalidParameterResponse(unsupported, `Meta Muse Voice Transcribe does not support ${unsupported} on the one-shot endpoint.`),
			bill: emptyBill(),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	if (!body.file) {
		return {
			kind: "completed",
			upstream: invalidParameterResponse("file", "Meta Muse Voice Transcribe requires a WAV file upload."),
			bill: emptyBill(),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const request = {
		mode: body.diarize || body.enable_diarization ? "DIARIZATION" : "PUSH_TO_TALK",
		model: args.providerModelSlug || body.model.split("/").pop(),
		audioEncoding: "WAV",
		...(body.keywords?.length ? { keywords: body.keywords } : {}),
		...(body.language ? { languageBias: [body.language] } : {}),
	};
	const form = new FormData();
	form.append("request", new Blob([JSON.stringify(request)], { type: "application/json" }));
	const filename = typeof File !== "undefined" && body.file instanceof File && body.file.name ? body.file.name : "audio.wav";
	form.append("audio", body.file, filename);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${keyInfo.key}`,
		...upstreamTestHeaders(args.meta),
	};
	const sessionId = body.session_id ? `?sessionId=${encodeURIComponent(body.session_id)}` : "";
	const res = await (args.upstreamTiming?.fetch ?? fetch)(`https://api.meta.ai/v1/asr/transcribe${sessionId}`, {
		method: "POST",
		headers,
		body: form,
	});
	const payload = await res.clone().json().catch(() => undefined);
	const duration = typeof payload?.audioDurationMs === "number" ? payload.audioDurationMs / 1000 : undefined;
	const turns = Array.isArray(payload?.turns) ? payload.turns : undefined;
	const normalized = payload && typeof payload === "object" ? {
		...payload,
		text: typeof payload.transcript === "string" ? payload.transcript : "",
		duration,
		segments: turns,
		diarization: turns?.filter((turn: any) => typeof turn?.speaker === "string"),
		usage: { requests: 1, ...(duration !== undefined ? { input_audio_seconds: duration } : {}) },
	} : undefined;
	return {
		kind: "completed",
		upstream: res,
		normalized,
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: normalized?.usage,
			upstream_id: payload?.sessionId ?? res.headers.get("x-request-id"),
			finish_reason: null,
		},
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}

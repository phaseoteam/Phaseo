import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranscriptionSchema, type AudioTranscriptionRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(JSON.stringify({ error: { type: "invalid_request_error", message, param } }), {
		status: 400, headers: { "Content-Type": "application/json" },
	});
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const body = buildAdapterPayload(AudioTranscriptionSchema, args.body, []).adapterPayload as AudioTranscriptionRequest;
	const unsupported = body.prompt !== undefined ? "prompt"
		: body.temperature !== undefined ? "temperature"
		: body.response_format !== undefined ? "response_format"
		: body.stream === true ? "stream"
		: (body.timestamp_granularities?.length ?? 0) > 0 ? "timestamp_granularities"
		: (body.include?.length ?? 0) > 0 ? "include"
		: body.chunking_strategy !== undefined ? "chunking_strategy"
		: null;
	if (unsupported) {
		const upstream = invalidParameterResponse(unsupported, `xAI REST speech-to-text does not support ${unsupported}.`);
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	if (!body.file) {
		const upstream = invalidParameterResponse("file", "The gateway xAI transcription integration currently requires a file upload.");
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	if ((body.keywords?.length ?? 0) > 100 || body.keywords?.some((value) => value.length > 50)) {
		const upstream = invalidParameterResponse("keywords", "xAI accepts at most 100 keyterms of at most 50 characters each.");
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	const form = new FormData();
	// xAI picks the model from this field (grok-transcribe, grok-voice-transcribe-2.0).
	const model = (args.providerModelSlug || body.model || "").split("/").pop();
	if (model) form.append("model", model);
	if (body.language) {
		form.append("format", "true");
		form.append("language", body.language);
	}
	if (body.diarize || body.enable_diarization) form.append("diarize", "true");
	for (const keyword of body.keywords ?? []) form.append("keyterm", keyword);
	const filename = typeof File !== "undefined" && body.file instanceof File && body.file.name ? body.file.name : "audio";
	form.append("file", body.file, filename);
	const headers = openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta));
	delete (headers as any)["Content-Type"];
	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/stt"), { method: "POST", headers, body: form });
	const normalized = await res.clone().json().catch(() => undefined);
	const duration = typeof normalized?.duration === "number" ? normalized.duration : undefined;
	const usage = { requests: 1, ...(duration !== undefined ? { input_audio_seconds: duration } : {}) };
	return {
		kind: "completed", upstream: res,
		bill: { cost_cents: 0, currency: "USD", usage, upstream_id: res.headers.get("x-request-id"), finish_reason: null },
		normalized: normalized ? { ...normalized, usage } : undefined,
		keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
	};
}

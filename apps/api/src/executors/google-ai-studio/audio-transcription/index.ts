import type { IRAudioTranscriptionRequest, IRAudioTranscriptionResponse } from "@core/ir";
import type { ExecutorResult, ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { fetchPublicMedia } from "@core/public-media-fetch";
import { imageBytesToBase64 } from "@executors/_shared/image-results";

const MAX_AUDIO_BYTES = 14 * 1024 * 1024; // Keep the base64 JSON body below the 20 MB inline request limit.
export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRAudioTranscriptionRequest;
	const fail = (status: number, message: string): ExecutorResult => ({ kind: "completed", upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" } });
	const model = args.providerModelSlug || ir.model;
	if (model !== "gemini-3.5-transcribe") return fail(400, "Unsupported Gemini transcription model.");
	for (const name of ["prompt", "temperature", "fileId", "include", "chunkingStrategy", "knownSpeakerNames", "knownSpeakerReferences"] as const) {
		if (ir[name] !== undefined && ir[name] !== null) return fail(400, `Gemini transcription does not support ${name}.`);
	}
	if (ir.stream) return fail(400, "Use the Live API for streaming Gemini transcription.");
	if (ir.timestampGranularities?.includes("segment")) return fail(400, "Gemini transcription supports word timestamps only.");
	if (ir.responseFormat && !["json", "text", "verbose_json"].includes(ir.responseFormat)) return fail(400, "Gemini transcription supports json, verbose_json and text responses.");
	const vocabulary = ir.contextBias ?? ir.keywords;
	const diarize = ir.diarize ?? ir.enableDiarization;
	const timestamps = ir.timestampGranularities?.length ? ir.timestampGranularities : undefined;
	if (vocabulary?.length && (diarize || timestamps)) return fail(400, "Custom vocabulary cannot be combined with diarization or timestamps.");
	if (vocabulary && vocabulary.length > 1000) return fail(400, "Gemini accepts at most 1,000 custom vocabulary terms.");
	const mode = ir.rawRequest?.config?.google?.transcription_mode;
	if (mode !== undefined && !["smart", "verbatim"].includes(mode)) return fail(400, "Unsupported transcription mode.");
	if (mode === "smart" && (diarize || timestamps)) return fail(400, "Smart transcription cannot include diarization or timestamps.");
	let bytes: Uint8Array;
	let mime: string;
	if (ir.file) {
		if (ir.file.size > MAX_AUDIO_BYTES) return fail(400, "Inline transcription audio exceeds 14 MB.");
		bytes = new Uint8Array(await ir.file.arrayBuffer());
		mime = ir.file.type;
	} else if (ir.fileUrl || ir.s3PresignedUrl) {
		const media = await fetchPublicMedia({ url: ir.fileUrl || ir.s3PresignedUrl!, maxBytes: MAX_AUDIO_BYTES, upstreamTiming: args.upstreamTiming });
		bytes = media.bytes; mime = media.contentType?.split(";")[0] ?? "";
	} else return fail(400, "An audio file or URL is required.");
	if (!/^audio\/(wav|mp3|aiff|aac|ogg|flac|mpeg|m4a|l16|opus|alaw|mulaw|webm)$/.test(mime)) return fail(400, "A supported audio MIME type is required.");
	const transcriptionConfig = {
		language_codes: ir.languages ?? (ir.language ? [ir.language] : undefined),
		custom_vocabulary: vocabulary,
		mode: mode === "smart" ? "smart" : { type: "verbatim", diarization_mode: diarize ? "speaker" : undefined, timestamp_granularities: timestamps },
	};
	const body = { model, store: false, input: [{ type: "audio", data: imageBytesToBase64(bytes), mime_type: mime }], generation_config: { transcription_config: transcriptionConfig } };
	const env = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => env.GOOGLE_AI_STUDIO_API_KEY || env.GOOGLE_API_KEY || env.GEMINI_API_KEY);
	const base = (env.GOOGLE_AI_STUDIO_BASE_URL || env.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "").replace(/\/v1(?:beta)?$/, "");
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(`${base}/v1beta/interactions`, { method: "POST", headers: { "x-goog-api-key": key.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const raw: any = await upstream.clone().json().catch(() => null);
	const common = { upstream, rawResponse: raw, keySource: key.source, byokKeyId: key.byokId };
	if (!upstream.ok) return { kind: "completed", ...common, bill: { cost_cents: 0, currency: "USD" } };
	if (raw?.status !== "completed") return fail(502, "Gemini did not complete transcription.");
	const content = (raw.steps ?? []).filter((step: any) => step.type === "model_output").flatMap((step: any) => step.content ?? []);
	const text = content.filter((part: any) => part.type === "text").map((part: any) => part.text ?? "").join("");
	const words = content.flatMap((part: any) => part.annotations ?? []).filter((annotation: any) => annotation.type === "word_info").map((word: any) => ({ word: word.text, ...(word.start_offset ? { start: parseFloat(word.start_offset) } : {}), ...(word.end_offset ? { end: parseFloat(word.end_offset) } : {}), ...(word.speaker ? { speaker: word.speaker } : {}) }));
	const audioTokens = raw.usage?.input_tokens_by_modality?.find((entry: any) => entry.modality === "audio")?.tokens ?? raw.usage?.total_input_tokens;
	const outputTokens = raw.usage?.total_output_tokens;
	const usage = { requests: 1, ...(typeof audioTokens === "number" ? { input_audio_tokens: audioTokens } : {}), ...(typeof outputTokens === "number" ? { output_text_tokens: outputTokens } : {}) };
	const response: IRAudioTranscriptionResponse = { id: args.requestId, nativeId: raw.id, model, provider: args.providerId, text, words: words.length ? words : undefined, usage: usage as any, rawResponse: raw };
	return { kind: "completed", ...common, ir: response, bill: { cost_cents: 0, currency: "USD", usage, upstream_id: raw.id, finish_reason: "stop" } };
};

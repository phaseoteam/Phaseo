import type { IRAudioTranscriptionRequest, IRAudioTranscriptionResponse } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { resolveVertexAccessToken, resolveVertexApiBase } from "@providers/google-vertex/auth";
import { fetchPublicMedia } from "@core/public-media-fetch";
import { imageBytesToBase64 } from "@executors/_shared/image-results";

// https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe
export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRAudioTranscriptionRequest;
	const fail = (message: string, status = 400) => ({ kind: "completed" as const, upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" } });
	const model = args.providerModelSlug || ir.model;
	if (model !== "gemini-3.5-transcribe-preview") return fail("Unsupported Vertex transcription model.");
	for (const name of ["prompt", "temperature", "fileId", "include", "chunkingStrategy", "knownSpeakerNames", "knownSpeakerReferences"] as const) if (ir[name] != null) return fail(`Vertex transcription does not support ${name}.`);
	if (ir.stream) return fail("Streaming transcription requires the Live API.");
	if (ir.timestampGranularities?.includes("segment")) return fail("Vertex transcription supports word timestamps only.");
	if (ir.responseFormat && !["json", "text", "verbose_json"].includes(ir.responseFormat)) return fail("Unsupported transcription response format.");
	const vocabulary = ir.contextBias ?? ir.keywords;
	if (vocabulary && vocabulary.length > 1000) return fail("At most 1,000 custom vocabulary terms are supported.");
	const diarization = ir.diarize ?? ir.enableDiarization;
	const wordTimestamp = ir.timestampGranularities?.includes("word");
	const mode = ir.rawRequest?.config?.google?.transcription_mode;
	if (mode !== undefined && !["smart", "verbatim"].includes(mode)) return fail("Unsupported transcription mode.");
	if (mode === "smart" && (diarization || wordTimestamp)) return fail("Smart mode cannot include diarization or timestamps.");
	const env = getBindings() as unknown as Record<string, string | undefined>;
	const base = resolveVertexApiBase(env);
	if (!base.endsWith("/locations/global")) return fail("Vertex Gemini transcription is available in the global location only.");
	const maxBytes = 14 * 1024 * 1024;
	let bytes: Uint8Array;
	let mime: string;
	if (ir.file) {
		if (ir.file.size > maxBytes) return fail("Inline transcription audio exceeds 14 MB.");
		bytes = new Uint8Array(await ir.file.arrayBuffer()); mime = ir.file.type;
	} else if (ir.fileUrl || ir.s3PresignedUrl) {
		const media = await fetchPublicMedia({ url: ir.fileUrl || ir.s3PresignedUrl!, maxBytes, upstreamTiming: args.upstreamTiming });
		bytes = media.bytes; mime = media.contentType?.split(";")[0] ?? "";
	} else return fail("An audio file or URL is required.");
	if (!/^audio\/(wav|mp3|aiff|aac|ogg|flac|mpeg|m4a|l16|opus|alaw|mulaw|webm)$/.test(mime)) return fail("A supported audio MIME type is required.");
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => env.GOOGLE_VERTEX_ACCESS_TOKEN || env.GOOGLE_VERTEX_API_KEY);
	const token = await resolveVertexAccessToken(key.key, args.upstreamTiming);
	const body = { contents: [{ role: "user", parts: [{ inlineData: { data: imageBytesToBase64(bytes), mimeType: mime } }] }], generationConfig: { audioTranscriptionConfig: { languageCodes: ir.languages ?? (ir.language ? [ir.language] : undefined), customVocabulary: vocabulary, diarization, wordTimestamp, mode: mode?.toUpperCase() } } };
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(`${base}/publishers/google/models/${model}:generateContent`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const common = { upstream, keySource: key.source, byokKeyId: key.byokId };
	if (!upstream.ok) return { kind: "completed", ...common, bill: { cost_cents: 0, currency: "USD" } };
	const raw: any = await upstream.clone().json();
	const candidate = raw.candidates?.[0];
	if (!candidate?.content?.parts || (candidate.finishReason && candidate.finishReason !== "STOP")) return fail("Vertex did not complete transcription.", 502);
	const parts: any[] = candidate.content.parts;
	const text = parts.map(part => part.text ?? part.audioTranscription?.text ?? "").join("");
	const words = parts.flatMap(part => (part.audioTranscription?.words ?? []).map((word: any) => ({ word: word.word, start: parseFloat(word.startOffset ?? "0"), end: parseFloat(word.endOffset ?? "0"), ...(part.audioTranscription?.speakerLabel ? { speaker: part.audioTranscription.speakerLabel } : {}) })));
	const meta = raw.usageMetadata;
	const input = meta?.promptTokensDetails?.find((detail: any) => detail.modality === "AUDIO")?.tokenCount ?? meta?.promptTokenCount;
	const output = meta?.candidatesTokenCount;
	if (![input, output].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) return fail("Vertex transcription returned no billable token usage.", 502);
	const usage = { requests: 1, input_audio_tokens: input, output_text_tokens: output };
	const response: IRAudioTranscriptionResponse = { id: args.requestId, nativeId: raw.responseId, model, provider: args.providerId, text, words: words.length ? words : undefined, usage: usage as any, rawResponse: raw };
	return { kind: "completed", ...common, ir: response, bill: { cost_cents: 0, currency: "USD", usage, upstream_id: raw.responseId, finish_reason: "stop" } };
};

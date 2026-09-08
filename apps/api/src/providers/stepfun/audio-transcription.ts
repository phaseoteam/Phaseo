import { z } from "zod";
import { parseBuffer } from "music-metadata";
import { AudioTranscriptionSchema } from "@core/schemas";
import type { AdapterResult, ProviderExecuteArgs } from "../types";
import { resolveOpenAITransport } from "../shared/openai-transport";
import { exec as legacyTranscription } from "../openai/endpoints/audio-transcription";

const configSchema = z.object({
    enable_itn: z.boolean().optional(),
    format: z.object({ type: z.enum(["wav", "mp3", "ogg", "pcm"]), codec: z.string().optional(), rate: z.number().int().positive().optional(), bits: z.literal(16).optional(), channel: z.number().int().min(1).max(2).optional() }).optional(),
}).strict();

async function finalTranscript(stream: ReadableStream<Uint8Array>): Promise<any> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final: any;
    const consume = (frame: string) => {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") return;
        const event = JSON.parse(data);
        if (event.type === "error") throw new Error(`stepfun_transcription_failed: ${event.message ?? "upstream error"}`);
        if (event.type === "transcript.text.done") final = event;
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
            let boundary: number;
            while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
                consume(buffer.slice(0, boundary));
                buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
            }
            if (done) break;
        }
        if (buffer.trim()) consume(buffer);
        if (!final) throw new Error("stepfun_transcription_missing_final_event");
        return final;
    } finally { reader.releaseLock(); }
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const model = args.providerModelSlug || args.model;
    if (model === "step-asr") return legacyTranscription({ ...args, body: { ...args.body, response_format: args.body.response_format ?? "json" } });
    if (!["stepaudio-2.5-asr", "stepaudio-2-asr-pro", "step-asr-1.1-stream"].includes(model)) {
        return { kind: "completed", upstream: Response.json({ error: { type: "invalid_request_error", message: "This StepFun model requires the asynchronous file-recognition API." } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } };
    }
    const body = AudioTranscriptionSchema.parse(args.body);
    const config = configSchema.parse(body.config?.stepfun ?? {});
    const unsupported = ["temperature", "timestamp_granularities", "include", "diarize", "enable_diarization", "languages", "chunking_strategy", "known_speaker_names", "known_speaker_references"].find(key => (body as any)[key] != null);
    const param = unsupported ?? (body.prompt && model !== "stepaudio-2-asr-pro" ? "prompt" : body.response_format && !["json", "text"].includes(body.response_format) ? "response_format" : undefined);
    if (param) return { kind: "completed", upstream: Response.json({ error: { type: "invalid_request_error", param, message: `Unsupported StepFun transcription ${param}.` } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } };
    const file = body.file!;
    const mime = file.type.toLowerCase().split(";")[0].trim();
    const formats: Record<string, "wav" | "mp3" | "ogg" | "pcm"> = {
        "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/vnd.wave": "wav",
        "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mpga": "mp3",
        "audio/ogg": "ogg", "application/ogg": "ogg", "audio/opus": "ogg", "audio/pcm": "pcm",
    };
    const inferredType = formats[mime];
    const format = config.format ?? (inferredType ? { type: inferredType } : undefined);
    if (!format || (mime && mime !== "application/octet-stream" && !inferredType) || (inferredType && inferredType !== format.type)) {
        return { kind: "completed", upstream: Response.json({ error: { type: "invalid_request_error", param: "file", message: "StepFun transcription requires WAV, MP3, OGG, or explicitly configured PCM audio with a matching format." } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let duration: number | undefined;
    if (format.type === "pcm") {
        if (!format.rate || !format.bits || !format.channel) throw new Error("stepfun_pcm_format_requires_rate_bits_channel");
        duration = bytes.length / (format.rate * format.channel * format.bits / 8);
    } else {
        duration = (await parseBuffer(bytes, { mimeType: file.type, size: bytes.length }, { duration: true, skipCovers: true })).format.duration;
    }
    if (duration == null || !Number.isFinite(duration) || duration <= 0) throw new Error("stepfun_audio_duration_unavailable");
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    const { keyInfo, url, headers } = resolveOpenAITransport(args, "/audio/asr/sse", { Accept: "text/event-stream" });
    const upstream = await (args.upstreamTiming?.fetch ?? fetch)(url, { method: "POST", headers, body: JSON.stringify({ audio: { data: btoa(binary), input: { format, transcription: { model, language: body.language, hotwords: body.keywords ?? body.context_bias, prompt: body.prompt, enable_itn: config.enable_itn } } } }) });
    const bill = { cost_cents: 0, currency: "USD", usage: undefined as any, upstream_id: upstream.headers.get("x-request-id") };
    if (!upstream.ok || !upstream.body) return { kind: "completed", upstream, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    if (body.stream === true) {
        const [stream, accounting] = upstream.body.tee();
        return { kind: "stream", upstream, stream, bill, usageFinalizer: async () => { await finalTranscript(accounting); return { ...bill, usage: { input_audio_seconds: duration } }; }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    }
    const final = await finalTranscript(upstream.body);
    bill.usage = { input_audio_seconds: duration };
    return { kind: "completed", upstream: Response.json({ text: final.text, usage: bill.usage }), normalized: { text: final.text, usage: bill.usage }, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}

import type { AdapterResult, ProviderExecuteArgs } from "../types";
import { AudioTranscriptionSchema } from "@core/schemas";
import { buildAdapterPayload } from "../utils";
import { resolveOpenAITransport } from "../shared/openai-transport";
import { collectTranscriptionStreamUsage } from "../openai/endpoints/audio-transcription";

function normalizeUsage(usage: any) {
    const milliseconds = usage?.input_audio_length_ms;
    return typeof milliseconds === "number" && Number.isFinite(milliseconds) && milliseconds >= 0
        ? { input_audio_seconds: milliseconds / 1000 } : undefined;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const { keyInfo, url, headers } = resolveOpenAITransport(args, "/audio/transcriptions");
    const { adapterPayload: body } = buildAdapterPayload(AudioTranscriptionSchema, args.body, []);
    const bill = { cost_cents: 0, currency: "USD" as const, usage: undefined as any, upstream_id: null, finish_reason: null };
    const unsupported = ["prompt", "timestamp_granularities", "include", "languages", "keywords", "diarize", "known_speaker_names", "known_speaker_references"].find(key => body[key] != null);
    const param = unsupported ?? (body.response_format && body.response_format !== "json" ? "response_format" : null);
    if (param) {
        return { kind: "completed", upstream: Response.json({ error: { type: "invalid_request_error", param, message: `Friendli transcription does not support ${param} in this route.` } }, { status: 400 }), bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    }
    const form = new FormData();
    form.append("model", args.providerModelSlug || args.model);
    form.append("file", body.file, "audio");
    if (body.stream != null) form.append("stream", String(body.stream));
    if (body.language) form.append("language", body.language);
    if (body.temperature != null) form.append("temperature", String(body.temperature));
    if (body.chunking_strategy != null) form.append("chunking_strategy", typeof body.chunking_strategy === "string" ? body.chunking_strategy : JSON.stringify(body.chunking_strategy));
    delete headers["Content-Type"];
    const upstream = await (args.upstreamTiming?.fetch ?? fetch)(url, { method: "POST", headers, body: form });
    if (upstream.ok && body.stream === true && upstream.body && upstream.headers.get("content-type")?.includes("text/event-stream")) {
        const [stream, accounting] = upstream.body.tee();
        return { kind: "stream", upstream, stream, bill, usageFinalizer: async () => ({ ...bill, usage: normalizeUsage(await collectTranscriptionStreamUsage(accounting)) }), keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    }
    const json = await upstream.clone().json().catch(() => null) as any;
    if (upstream.ok) bill.usage = normalizeUsage(json?.usage);
    return { kind: "completed", upstream, bill, normalized: json ? { ...json, usage: bill.usage } : undefined, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}

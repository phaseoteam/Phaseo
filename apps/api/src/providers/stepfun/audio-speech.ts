import { z } from "zod";
import { AudioSpeechSchema } from "@core/schemas";
import type { AdapterResult, ProviderExecuteArgs } from "../types";
import { resolveOpenAITransport } from "../shared/openai-transport";

const configSchema = z.object({
    volume: z.number().min(0.1).max(2).optional(),
    sample_rate: z.union([z.literal(8000), z.literal(16000), z.literal(22050), z.literal(24000), z.literal(48000)]).optional(),
    pronunciation_map: z.object({ tone: z.array(z.string()) }).optional(),
    markdown_filter: z.boolean().optional(),
    voice_label: z.object({ language: z.string().optional(), emotion: z.string().optional(), style: z.string().optional() }).strict().refine(value => Object.values(value).filter(Boolean).length <= 1, "Only one voice label can be supplied").optional(),
}).strict();

export function countStepSpeechCharacters(input: string): number {
    return Array.from(input).reduce((count, character) => count + (/\p{Script=Han}/u.test(character) ? 1 : 0.5), 0);
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const body = AudioSpeechSchema.parse(args.body);
    const options = configSchema.parse(body.config?.stepfun ?? {});
    const { keyInfo, url, headers } = resolveOpenAITransport(args, "/audio/speech");
    const format = body.response_format ?? body.format ?? "mp3";
    const model = args.providerModelSlug || body.model;
    const param = typeof body.voice !== "string" || !body.voice ? "voice"
        : model === "stepaudio-2.5-tts" && options.voice_label ? "voice_label"
        : model !== "stepaudio-2.5-tts" && body.instructions ? "instructions"
        : body.input.length > 1000 ? "input"
        : body.instructions && body.instructions.length > 200 ? "instructions"
        : body.speed != null && (body.speed < 0.5 || body.speed > 2) ? "speed"
        : !["wav", "mp3", "flac", "opus", "pcm"].includes(format) ? "response_format" : undefined;
    if (param) return { kind: "completed", upstream: Response.json({ error: { type: "invalid_request_error", param, message: `Unsupported StepFun speech ${param}.` } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    const upstream = await (args.upstreamTiming?.fetch ?? fetch)(url, { method: "POST", headers, body: JSON.stringify({
        model, input: body.input, voice: body.voice,
        response_format: format, stream_format: body.stream_format, speed: body.speed,
        instruction: body.instructions, ...options,
    }) });
    const bill = { cost_cents: 0, currency: "USD", usage: upstream.ok ? { input_characters: countStepSpeechCharacters(body.input) } : undefined, upstream_id: upstream.headers.get("x-request-id") };
    if (upstream.ok && upstream.body) return { kind: "stream", upstream, stream: upstream.body, bill, usageFinalizer: async () => bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    return { kind: "completed", upstream, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}

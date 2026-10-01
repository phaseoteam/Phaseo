import { z } from "zod";
import { AudioSpeechSchema } from "@core/schemas";
import type { AdapterResult, ProviderExecuteArgs } from "@providers/types";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

const optionsSchema = z.object({
	service_tier: z.enum(["default", "priority", "flex"]).optional(),
	fail_fast: z.boolean().optional(),
	extra_body: z.record(z.string(), z.unknown()).optional(),
}).strict();

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const body = AudioSpeechSchema.parse(args.body);
	const options = optionsSchema.parse(body.config?.deepinfra ?? {});
	const format = body.response_format ?? body.format ?? "wav";
	const model = args.providerModelSlug || body.model;
	const isQwen = model === "Qwen/Qwen3-TTS" || model === "Qwen/Qwen3-TTS-VoiceDesign";
	const isVoiceDesign = model === "Qwen/Qwen3-TTS-VoiceDesign";
	const unsupported = options.service_tier !== undefined && options.service_tier !== "default" ? "service_tier"
		: body.stream_format === "sse" ? "stream_format"
		: body.instructions !== undefined && (!isQwen || isVoiceDesign) ? "instructions"
		: isQwen && body.input.length > 4000 ? "input"
		: isQwen && body.speed !== undefined && body.speed !== 1 ? "speed"
		: isVoiceDesign && !body.voice ? "voice"
		: !["mp3", "opus", "flac", "wav", "pcm"].includes(format) ? "response_format"
		: body.voice !== undefined && typeof body.voice !== "string" ? "voice" : undefined;
	if (unsupported) {
		return {
			kind: "completed",
			upstream: new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "unsupported_parameter", param: unsupported, message: `DeepInfra speech does not support this ${unsupported} value.` } }), { status: 400, headers: { "Content-Type": "application/json" } }),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}
	const keyInfo = resolveOpenAICompatKey(args);
	const speechUrl = openAICompatUrl(args.providerId, "/audio/speech");
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(isQwen ? speechUrl.replace(/\/audio\/speech$/, `/inference/${model}`) : speechUrl, {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
		body: JSON.stringify(isQwen
			? { input: body.input, voice: body.voice, response_format: format, instruct: body.instructions, language: options.extra_body?.language, service_tier: "default", fail_fast: options.fail_fast }
			: { model, input: body.input, voice: body.voice, response_format: format, speed: body.speed, ...options }),
	});
	const bill = { cost_cents: 0, currency: "USD", usage: upstream.ok ? { requests: 1, input_characters: body.input.length } : undefined, upstream_id: upstream.headers.get("x-request-id") };
	if (upstream.ok && upstream.body) {
		return { kind: "stream", upstream, stream: upstream.body, bill, usageFinalizer: async () => bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	return { kind: "completed", upstream, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}

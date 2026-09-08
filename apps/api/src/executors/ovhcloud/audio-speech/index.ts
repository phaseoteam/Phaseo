import type { IRAudioSpeechRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";

const MODELS: Record<string, { language: string; voice: string }> = {
	"nvr-tts-en-us": { language: "en-US", voice: "English-US.Female-1" },
	"nvr-tts-de-de": { language: "de-DE", voice: "German-DE-Male-1" },
	"nvr-tts-es-es": { language: "es-ES", voice: "Spanish-ES-Female-1" },
	"nvr-tts-it-it": { language: "it-IT", voice: "Italian-IT-Female-1" },
};

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRAudioSpeechRequest;
	const model = args.providerModelSlug || ir.model;
	const config = MODELS[model];
	const format = ir.responseFormat ?? ir.format ?? "wav";
	const unsupported = !config ? "model" : format !== "wav" ? "response_format" : ir.streamFormat === "sse" ? "stream_format" : ir.speed !== undefined ? "speed" : ir.instructions !== undefined ? "instructions" : ir.voice !== undefined && typeof ir.voice !== "string" ? "voice" : undefined;
	if (unsupported) return { kind: "completed", upstream: Response.json({ error: { message: `OVHcloud Riva speech does not support this ${unsupported}.` } }, { status: 400 }), bill: { cost_cents: 0, currency: "EUR" } };
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const body = { text: ir.input, language_code: config.language, voice_name: ir.voice ?? config.voice, sample_rate_hz: 16000, encoding: 1 };
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(`https://${model}.endpoints.kepler.ai.cloud.ovh.net/api/v1/tts/text_to_audio`, { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json", Accept: "application/octet-stream" }, body: JSON.stringify(body) });
	const bill = { cost_cents: 0, currency: "EUR", usage: upstream.ok ? { input_characters: ir.input.length, requests: 1 } : undefined };
	const common = { upstream, bill, keySource: key.source, byokKeyId: key.byokId, mappedRequest: args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? JSON.stringify(body) : undefined };
	if (!upstream.ok || !upstream.body) return { kind: "completed", ...common };
	return { kind: "stream", ...common, stream: upstream.body, usageFinalizer: async () => bill };
};

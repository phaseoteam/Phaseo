import type { IRAudioSpeechRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { executeMiniMaxSpeech, isMiniMaxSpeechModel } from "./minimax";

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRAudioSpeechRequest;
	const model = args.providerModelSlug || ir.model;
	if (isMiniMaxSpeechModel(model)) return executeMiniMaxSpeech(args, model);
	const format = ir.responseFormat ?? ir.format ?? "mp3";
	const unsupported = model !== "s1" ? "model"
		: !["mp3", "wav", "pcm", "opus"].includes(format) ? "response_format"
		: ir.streamFormat === "sse" ? "stream_format"
		: ir.instructions !== undefined ? "instructions"
		: ir.voice !== undefined && typeof ir.voice !== "string" ? "voice"
		: ir.vendor && Object.values(ir.vendor).some(value => value !== undefined) ? "vendor"
		: undefined;
	if (unsupported) return {
		kind: "completed", localClientError: true,
		upstream: Response.json({ error: { type: "invalid_request_error", code: "unsupported_parameter", param: unsupported, message: `Novita Fish Audio S1 does not support this ${unsupported}.` } }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => bindings.NOVITA_API_KEY);
	const body = {
		text: ir.input, format,
		...(ir.voice ? { reference_id: ir.voice } : {}),
		...(ir.speed !== undefined ? { prosody: { speed: ir.speed } } : {}),
	};
	const upstream = await fetchUpstream(args, "https://api.novita.ai/v4beta/txt2speech", {
		method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json", model: "s1" },
		body: JSON.stringify(body),
	});
	const bill = { cost_cents: 0, currency: "USD", usage: upstream.ok && upstream.body ? { input_characters: ir.input.length, requests: 1 } : undefined, upstream_id: upstream.headers.get("x-request-id") };
	const common = { upstream, bill, keySource: key.source, byokKeyId: key.byokId,
		...(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? { mappedRequest: JSON.stringify(body) } : {}),
	};
	if (!upstream.ok || !upstream.body) return { kind: "completed", ...common };
	return { kind: "stream", ...common, stream: upstream.body, usageFinalizer: async () => bill };
};

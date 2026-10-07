import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import { readStreamTextWithLimit } from "@core/bounded-stream";
import { normalizeOpenAIImageTokenUsage } from "@core/image-request-options";
import type { ProviderExecutor } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRImageGenerationRequest;
	const model = args.providerModelSlug || ir.model;
	const format = ir.outputFormat ?? "png";
	const responseFormat = ir.responseFormat ?? "b64_json";
	const size = ir.size ?? "auto";
	const dimensions = size.match(/^(\d+)x(\d+)$/);
	const unsupported = model !== "ming-image-0.1-design" ? "model"
		: args.endpoint !== "images.generations" ? "endpoint"
		: ir.image || ir.mask ? "image"
		: (ir.n ?? 1) !== 1 ? "n"
		: ir.stream || ir.partialImages !== undefined ? "stream"
		: !["png", "jpeg"].includes(format) ? "output_format"
		: !["url", "b64_json"].includes(responseFormat) ? "response_format"
		: size !== "auto" && (!dimensions || Number(dimensions[1]) < 1024 || Number(dimensions[2]) < 1024) ? "size"
		: ir.quality || ir.style || ir.background || ir.moderation || ir.outputCompression !== undefined || ir.inputFidelity ? "image_controls"
		: ir.rawRequest?.provider_params && Object.keys(ir.rawRequest.provider_params).length ? "provider_params"
		: undefined;
	if (unsupported) return { kind: "completed", localClientError: true,
		upstream: Response.json({ error: { type: "invalid_request_error", code: "unsupported_parameter", param: unsupported, message: `Novita Ming Image does not support this ${unsupported}.` } }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => bindings.NOVITA_API_KEY);
	const body = { model, prompt: ir.prompt, size, output_format: format, response_format: responseFormat };
	const upstream = await fetchUpstream(args, "https://api.novita.ai/openai/v1/images/generations", {
		method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
	});
	const common = { keySource: key.source, byokKeyId: key.byokId,
		...(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? { mappedRequest: JSON.stringify(body) } : {}),
	};
	if (!upstream.ok) return { kind: "completed", upstream, ...common, bill: { cost_cents: 0, currency: "USD" } };
	let json: any;
	try {
		json = JSON.parse(await readStreamTextWithLimit(upstream.body, 16 * 1024 * 1024, "novita_image_response_too_large"));
	} catch {
		return { kind: "completed", terminal: true, ...common, upstream: Response.json({ error: { type: "invalid_upstream_response", message: "Novita returned an invalid or oversized image response." } }, { status: 502 }), bill: { cost_cents: 0, currency: "USD" } };
	}
	if (!Array.isArray(json?.data) || !json.data.length || json.data.some((image: any) => !image || !(typeof image.url === "string" && image.url || typeof image.b64_json === "string" && image.b64_json))) {
		return { kind: "completed", terminal: true, ...common, upstream: Response.json({ error: { type: "invalid_upstream_response", message: "Novita returned no usable image output." } }, { status: 502 }), bill: { cost_cents: 0, currency: "USD" } };
	}
	const meters = normalizeOpenAIImageTokenUsage(json.usage);
	if (!json.usage || ![meters.input_text_tokens, meters.output_image_tokens].every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) {
		return { kind: "completed", terminal: true, ...common, upstream: Response.json({ error: { type: "invalid_upstream_response", message: "Novita returned no valid image billing usage." } }, { status: 502 }), bill: { cost_cents: 0, currency: "USD" } };
	}
	const usage = { ...meters, inputTokens: Number(json.usage?.input_tokens ?? 0), outputTokens: Number(json.usage?.output_tokens ?? 0), totalTokens: Number(json.usage?.total_tokens ?? 0), requests: 1, output_image: json.data.length };
	const response: IRImageGenerationResponse = {
		id: args.requestId, nativeId: json.id, created: json.created ?? Math.floor(Date.now() / 1000), model: ir.model, provider: args.providerId,
		outputFormat: json.output_format ?? format, size: json.size ?? undefined,
		data: json.data.map((image: any) => ({ url: image.url, b64Json: image.b64_json })), usage, rawResponse: json,
	};
	const headers = new Headers(upstream.headers);
	headers.delete("content-length");
	headers.delete("content-encoding");
	return { kind: "completed", ...common, ir: response, upstream: Response.json(json, { headers }),
		bill: { cost_cents: 0, currency: "USD", usage, upstream_id: json.id }, rawResponse: json,
	};
};

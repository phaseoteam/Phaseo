import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { readStreamBytesWithLimit } from "@core/bounded-stream";
import { imageBytesToBase64, unsupportedImageOption } from "@executors/_shared/image-results";
import { upstreamTestHeaders } from "@providers/shared/testing";

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRImageGenerationRequest;
	const unsupported = unsupportedImageOption(ir) ?? (ir.n !== undefined && ir.n !== 1 ? "n" : ir.size !== undefined && ir.size !== "1024x1024" ? "size" : ir.responseFormat === "url" ? "response_format=url" : ir.image ? "image" : undefined);
	if (unsupported) return { kind: "completed", upstream: Response.json({ error: { message: `OVHcloud SDXL does not support ${unsupported}.` } }, { status: 400 }), bill: { cost_cents: 0, currency: "USD" } };
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const body = { prompt: ir.prompt, negative_prompt: ir.rawRequest?.negative_prompt };
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)("https://stable-diffusion-xl.endpoints.kepler.ai.cloud.ovh.net/api/text2image", { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json", Accept: "application/octet-stream", ...upstreamTestHeaders(args.meta) }, body: JSON.stringify(body) });
	const common = { upstream, keySource: key.source, byokKeyId: key.byokId };
	if (!upstream.ok) return { kind: "completed", ...common, bill: { cost_cents: 0, currency: "USD" } };
	const bytes = await readStreamBytesWithLimit(upstream.clone().body, 20 * 1024 * 1024);
	const usage = { output_image: 1, requests: 1 };
	const response: IRImageGenerationResponse = { id: args.requestId, created: Math.floor(Date.now() / 1000), model: args.providerModelSlug || ir.model, provider: args.providerId, size: "1024x1024", data: [{ b64Json: imageBytesToBase64(bytes) }], usage: usage as any };
	return { kind: "completed", ...common, ir: response, bill: { cost_cents: 0, currency: "USD", usage, finish_reason: "stop" } };
};

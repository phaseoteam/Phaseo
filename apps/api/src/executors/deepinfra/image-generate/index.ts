import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { imageBytesToBase64, imageResultData } from "@executors/_shared/image-results";
import { resolveUploadableFromString } from "@providers/openai/endpoints/uploadable";
import { readStreamTextWithLimit } from "@core/bounded-stream";

// These are model-specific native schemas, not the compatible image facade.
// Source: https://api.deepinfra.com/models/{model}/schema/default (2026-09-07).
const contracts: Record<string, { multi?: boolean; dimensions?: "pixels" | "size" | "ratio"; partner?: boolean; images?: string[]; requiredImage?: boolean; extras: string[] }> = {
	"black-forest-labs/FLUX-1-dev": { multi: true, dimensions: "pixels", extras: ["seed", "num_inference_steps", "guidance_scale"] },
	"black-forest-labs/FLUX-1-schnell": { multi: true, dimensions: "pixels", extras: ["seed", "num_inference_steps"] },
	"black-forest-labs/FLUX-1.1-pro": { dimensions: "pixels", partner: true, extras: ["seed", "prompt_upsampling", "safety_tolerance"] },
	"black-forest-labs/FLUX-2-dev": { dimensions: "pixels", images: ["input_image_1", "input_image_2", "input_image_3", "input_image_4"], extras: ["seed", "num_inference_steps", "guidance_scale", "match_image_size"] },
	"black-forest-labs/FLUX-2-klein-4b": { dimensions: "pixels", images: ["input_image_1", "input_image_2", "input_image_3", "input_image_4"], extras: ["seed", "safety_tolerance", "output_format"] },
	"black-forest-labs/FLUX-2-klein-9b": { dimensions: "pixels", images: ["input_image_1", "input_image_2", "input_image_3", "input_image_4"], extras: ["seed", "safety_tolerance", "output_format"] },
	"black-forest-labs/FLUX-2-pro": { dimensions: "pixels", partner: true, images: ["input_image", "input_image_2", "input_image_3", "input_image_4"], extras: ["seed", "safety_tolerance", "output_format"] },
	"black-forest-labs/FLUX-2-max": { dimensions: "pixels", partner: true, images: ["input_image", "input_image_2", "input_image_3", "input_image_4", "input_image_5", "input_image_6", "input_image_7", "input_image_8"], extras: ["seed", "safety_tolerance", "output_format"] },
	"google/gemini-3-pro-image": { dimensions: "ratio", images: ["image"], extras: ["seed", "aspect_ratio"] },
	"Qwen/Qwen-Image-Edit": { multi: true, images: ["image"], requiredImage: true, extras: ["seed", "num_inference_steps", "guidance_scale", "negative_prompt"] },
	"Qwen/Qwen-Image-Max": { multi: true, dimensions: "size", extras: ["seed", "negative_prompt", "prompt_extend", "watermark"] },
};

function error(status: number, message: string): ExecutorResult {
	return { kind: "completed", ir: undefined, upstream: Response.json({ error: { message, type: "invalid_request_error" } }, { status }),
		bill: { cost_cents: 0, currency: "USD" }, keySource: null, byokKeyId: null };
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRImageGenerationRequest;
	const model = args.providerModelSlug || ir.model;
	const contract = contracts[model];
	if (!contract) return error(400, "No validated DeepInfra native image contract for this model.");
	if (ir.mask || ir.stream || ir.partialImages != null || ir.quality != null || ir.style != null || ir.background != null || ir.moderation != null || ir.inputFidelity != null || ir.outputCompression != null) return error(400, "Unsupported DeepInfra image control.");
	if (ir.responseFormat && !["url", "b64_json"].includes(ir.responseFormat)) return error(400, "Unsupported image response format.");
	const count = ir.n ?? 1;
	if (!Number.isInteger(count) || count < 1 || count > (contract.multi ? 4 : 1)) return error(400, "Image count exceeds the native model limit.");
	const raw = ir.rawRequest ?? {};
	const extra = raw.provider_options?.deepinfra ?? {};
	if (!extra || typeof extra !== "object" || Array.isArray(extra) || Object.keys(extra).some((key) => !contract.extras.includes(key))) return error(400, "Unsupported DeepInfra image provider option.");
	const body: Record<string, unknown> = { prompt: ir.prompt, ...extra };
	for (const key of contract.extras) if (raw[key] !== undefined) body[key] = raw[key];
	if (ir.outputFormat) body.output_format = ir.outputFormat;
	if (body.output_format != null && (!contract.extras.includes("output_format") || !["png", "jpeg"].includes(String(body.output_format)))) return error(400, "The selected model does not support that output format.");
	if (contract.multi) body.num_images = count;
	if (ir.size) {
		const match = /^(\d+)x(\d+)$/.exec(ir.size);
		if (!match || !contract.dimensions) return error(400, "This model requires native size controls or does not accept a size.");
		const width = Number(match[1]); const height = Number(match[2]);
		if (contract.dimensions === "pixels") {
			const min = contract.partner ? 256 : 128; const max = contract.partner ? 1440 : 1920;
			if ([width, height].some((value) => value < min || value > max || (contract.partner && value % 32 !== 0))) return error(400, "Size is outside the native model dimensions.");
			body.width = width; body.height = height;
		} else if (contract.dimensions === "size") body.size = `${width}*${height}`;
		else return error(400, "Use provider_options.deepinfra.aspect_ratio for this model instead of size.");
	}
	if (body.seed != null && (!Number.isSafeInteger(body.seed) || Number(body.seed) < 0)) return error(400, "Seed must be a nonnegative safe integer.");
	if (body.num_inference_steps != null && (!Number.isInteger(body.num_inference_steps) || Number(body.num_inference_steps) < 1 || Number(body.num_inference_steps) > (model.endsWith("FLUX-2-dev") ? 100 : 50))) return error(400, "Invalid native inference step count.");
	if (body.guidance_scale != null && (typeof body.guidance_scale !== "number" || !Number.isFinite(body.guidance_scale) || body.guidance_scale < 0 || body.guidance_scale > 20)) return error(400, "Invalid guidance scale.");
	const inputs = ir.image == null ? [] : Array.isArray(ir.image) ? ir.image : [ir.image];
	if (inputs.length > (contract.images?.length ?? 0) || (contract.requiredImage && inputs.length === 0) || (args.capability === "image.edit" && inputs.length === 0)) return error(400, "Image inputs do not match the selected native model.");
	try {
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i];
			const blob = typeof input === "string" ? (await resolveUploadableFromString(input, { defaultMimeType: "image/png", fallbackFilename: "image", maxBytes: 10 * 1024 * 1024, upstreamTiming: args.upstreamTiming })).blob : input;
			if (blob.size > 10 * 1024 * 1024) return error(400, "Input image exceeds 10 MB.");
			body[contract.images![i]] = imageBytesToBase64(new Uint8Array(await blob.arrayBuffer()));
		}
	} catch { return error(400, "Unable to read the image input."); }
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => bindings.DEEPINFRA_API_KEY);
	const root = (bindings.DEEPINFRA_BASE_URL || "https://api.deepinfra.com").replace(/\/+$/, "").replace(/\/v1(?:\/openai)?$/, "");
	const upstream = await fetchUpstream(args, `${root}/v1/inference/${model}`, { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	if (!upstream.ok) return { kind: "completed", ir: undefined, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId };
	const response = JSON.parse(await readStreamTextWithLimit(upstream.clone().body!, 32 * 1024 * 1024)) as any;
	if ((response.status && response.status !== "ok") || response.inference_status?.status === "failed") return error(422, "DeepInfra image generation did not succeed.");
	const cost = response.inference_status?.cost;
	if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return error(502, "DeepInfra omitted native cost usage required for settlement.");
	const images: unknown[] = Array.isArray(response.images) ? response.images : [response.image_url];
	if (images.length === 0 || images.some((item) => typeof item !== "string" || !item)) return error(502, "DeepInfra omitted its generated images.");
	const data: IRImageGenerationResponse["data"] = [];
	for (const value of images as string[]) {
		const inline = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/s.exec(value);
		if (inline) data.push(ir.responseFormat === "url" ? { url: value } : { b64Json: inline[1] });
		else data.push(...await imageResultData([new URL(value, root).toString()], ir.responseFormat ?? "b64_json", args.upstreamTiming));
	}
	const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, output_image: data.length, deepinfra_cost_usd: cost, requests: 1 };
	return { kind: "completed", upstream, keySource: key.source, byokKeyId: key.byokId,
		ir: { id: args.requestId, nativeId: response.request_id, model, provider: args.providerId, created: Math.floor(Date.now() / 1000), data, usage },
		bill: { cost_cents: cost * 100, currency: "USD", usage },
		...(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? { mappedRequest: JSON.stringify(body) } : {}) };
}

export const executor: ProviderExecutor = execute;

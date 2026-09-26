import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ExecutorCompletedResult, ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { imageInputUrl, unsupportedImageOption } from "@executors/_shared/image-results";
import { executeGmiQueueRequest, queueKeyMeta } from "../request-queue";

const MODEL = "hy-image-v3.5-preview";

function errorResult(args: ExecutorExecuteArgs, upstream: Response, mappedRequest?: string): ExecutorCompletedResult {
	const key = queueKeyMeta(args);
	return { kind: "completed", ir: undefined, upstream, bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId, mappedRequest };
}

function validationError(args: ExecutorExecuteArgs, reason: string): ExecutorResult {
	return {
		...errorResult(args, new Response(JSON.stringify({ error: "validation_error", reason }), { status: 400, headers: { "Content-Type": "application/json" } })),
		terminal: true,
		localClientError: true,
	};
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRImageGenerationRequest;
	if (args.providerModelSlug !== MODEL) return validationError(args, "unsupported_gmicloud_image_model");
	if (!ir.prompt?.trim()) return validationError(args, "prompt_required");
	if (ir.n != null && ir.n !== 1) return validationError(args, "gmicloud_image_requires_n_1");
	if (unsupportedImageOption(ir) || ir.responseFormat === "b64_json") return validationError(args, "unsupported_gmicloud_image_option");
	const images = ir.image == null ? [] : Array.isArray(ir.image) ? ir.image : [ir.image];
	if (images.length > 5 || images.some((image) => typeof image !== "string" && !(image instanceof Blob))) {
		return validationError(args, "gmicloud_image_requires_up_to_five_images");
	}
	if (images.some((image) => image instanceof Blob && image.size > 10 * 1024 * 1024)) return validationError(args, "gmicloud_image_upload_exceeds_10mb");
	if (args.capability === "image.edit" && images.length === 0) return validationError(args, "image_required_for_edit");
	const imageInputs = await Promise.all(images.map((image) => imageInputUrl(image)));
	if (imageInputs.some((image) => !/^https:\/\//i.test(image) && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image))) {
		return validationError(args, "gmicloud_image_requires_https_or_image_upload");
	}
	const size = ir.size ?? "1024x1024";
	const dimensions = /^(\d+)x(\d+)$/i.exec(size);
	if (!dimensions || Number(dimensions[1]) < 256 || Number(dimensions[2]) < 256 || Number(dimensions[1]) > 8192 || Number(dimensions[2]) > 8192 || Number(dimensions[1]) * Number(dimensions[2]) > 4194304) {
		return validationError(args, "gmicloud_image_size_exceeds_2k");
	}
	const pixels = Number(dimensions[1]) * Number(dimensions[2]);
	const generateMaxPixels = pixels <= 1048576 ? 1048576 : pixels <= 2359296 ? 2359296 : 4194304;
	const payload = { prompt: ir.prompt, size, generate_max_pixels: generateMaxPixels, ...(imageInputs.length ? { image: imageInputs } : {}) };
	const mappedRequest = args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest
		? JSON.stringify({ model: MODEL, payload })
		: undefined;
	const result = await executeGmiQueueRequest(args, MODEL, payload);
	if (!result.response.ok) return errorResult(args, result.response, mappedRequest);
	const outcome = result.json?.outcome ?? result.json?.result ?? result.json?.data ?? {};
	const candidate = outcome.image_url ?? outcome.imageUrl ?? outcome.image_urls?.[0] ?? outcome.url ?? outcome.media_urls?.[0]?.url ?? outcome.media_urls?.[0] ?? outcome.images?.[0]?.url;
	if (typeof candidate !== "string" || !/^https:\/\//i.test(candidate)) {
		return errorResult(args, new Response(JSON.stringify({ error: "gmicloud_image_output_missing", request_id: result.requestId }), { status: 502, headers: { "Content-Type": "application/json" } }), mappedRequest);
	}
	const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1, output_image: 1 };
	const response: IRImageGenerationResponse = {
		id: args.requestId, nativeId: result.requestId, created: Math.floor(Date.now() / 1000),
		model: ir.model, provider: args.providerId, size, data: [{ url: candidate, b64Json: null, revisedPrompt: null }], usage, rawResponse: result.json,
	};
	const key = queueKeyMeta(args);
	return { kind: "completed", ir: response, upstream: result.response, bill: { cost_cents: 0, currency: "USD", usage, upstream_id: result.requestId }, keySource: key.source, byokKeyId: key.byokId, mappedRequest, rawResponse: result.json };
}

export const executor: ProviderExecutor = execute;

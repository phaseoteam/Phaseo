// Native Qwen multimodal image API: generation and editing share one synchronous endpoint.
import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ExecutorResult, ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { imageInputUrl, imageResultData, unsupportedImageOption } from "@executors/_shared/image-results";

export const executor: ProviderExecutor = async (args) => {
	const ir = args.ir as IRImageGenerationRequest;
	const env = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => env.ALIBABA_CLOUD_API_KEY || env.DASHSCOPE_API_KEY);
	const fail = (status: number, message: string): ExecutorResult => ({ kind: "completed", upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId });
	const unsupported = unsupportedImageOption(ir);
	if (unsupported) return fail(400, `Alibaba Qwen images do not support ${unsupported}.`);
	const model = args.providerModelSlug || ir.model;
	if (!/^qwen-image(?:$|-)/.test(model)) return fail(400, "Unsupported Alibaba image model.");
	const edit = args.endpoint === "images.edits" || args.capability === "image.edit";
	const images = ir.image === undefined ? [] : Array.isArray(ir.image) ? ir.image : [ir.image];
	if (edit && (images.length < 1 || images.length > 3)) return fail(400, "Qwen image editing requires one to three images.");
	if (!edit && images.length) return fail(400, "Input images require images.edits.");
	if (model === "qwen-image-edit" && ir.size !== undefined) return fail(400, "qwen-image-edit does not support custom output sizes.");
	const multiOutput = /^qwen-image-(?:2\.0|3\.0|edit-(?:plus|max))/.test(model);
	if (ir.n !== undefined && (!Number.isInteger(ir.n) || ir.n < 1 || ir.n > (multiOutput ? 6 : 1))) return fail(400, `This Qwen model supports ${multiOutput ? "one to six images" : "one output image"}.`);
	if (ir.size !== undefined && !/^\d+[x*]\d+$/.test(ir.size)) return fail(400, "Image size must be WIDTHxHEIGHT.");
	const raw = ir.rawRequest ?? {};
	const native = raw.config?.alibaba ?? raw.alibaba ?? {};
	const parameters: Record<string, unknown> = {};
	for (const name of ["seed", "negative_prompt", "prompt_extend", "watermark", "prompt_extend_mode", "enable_thinking"]) {
		if (native[name] !== undefined || raw[name] !== undefined) parameters[name] = native[name] ?? raw[name];
	}
	if (ir.size !== undefined) parameters.size = ir.size.replace("x", "*");
	if (ir.n !== undefined) parameters.n = ir.n;
	let inputImages: string[];
	try { inputImages = await Promise.all(images.map(imageInputUrl)); } catch (error) { return fail(400, (error as Error).message); }
	const body = { model, input: { messages: [{ role: "user", content: [...inputImages.map(image => ({ image })), { text: ir.prompt }] }] }, parameters };
	const base = (env.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "").replace(/\/(?:compatible-mode\/v1|api\/v1)$/, "");
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(`${base}/api/v1/services/aigc/multimodal-generation/generation`, { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const rawResponse: any = await upstream.clone().json().catch(() => null);
	if (!upstream.ok) return { kind: "completed", upstream, rawResponse, bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId };
	if (rawResponse?.code) return fail(502, "Alibaba image generation failed.");
	const urls = (rawResponse?.output?.choices ?? []).flatMap((choice: any) => (choice?.message?.content ?? []).map((part: any) => part.image)).filter((url: unknown): url is string => typeof url === "string" && url.length > 0);
	if (!urls.length) return fail(502, "Alibaba returned no output images.");
	const data = await imageResultData(urls, ir.responseFormat, args.upstreamTiming);
	const usage = { output_image: data.length, requests: 1 };
	const response: IRImageGenerationResponse = { id: args.requestId, nativeId: rawResponse.request_id, created: Math.floor(Date.now() / 1000), model, provider: args.providerId, data, usage: usage as any, rawResponse };
	return { kind: "completed", upstream, ir: response, bill: { cost_cents: 0, currency: "USD", usage, upstream_id: rawResponse.request_id, finish_reason: "stop" }, keySource: key.source, byokKeyId: key.byokId, rawResponse, mappedRequest: args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? JSON.stringify(body) : undefined };
};

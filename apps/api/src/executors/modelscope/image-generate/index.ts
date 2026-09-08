// ModelScope returns a task ID, not an OpenAI image response. Poll the same task to completion.
import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ExecutorResult, ProviderExecutor } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { imageInputUrl, imageResultData, unsupportedImageOption } from "@executors/_shared/image-results";

export const executor: ProviderExecutor = async (args) => {
	const ir = args.ir as IRImageGenerationRequest;
	const env = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => env.MODELSCOPE_API_KEY);
	const fail = (status: number, message: string): ExecutorResult => ({ kind: "completed", upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId });
	const unsupported = unsupportedImageOption(ir);
	if (unsupported) return fail(400, `ModelScope images do not support ${unsupported}.`);
	if (ir.n !== undefined && ir.n !== 1) return fail(400, "ModelScope image requests support one output image.");
	if (ir.size !== undefined) return fail(400, "ModelScope custom image sizes are not supported by this adapter.");
	const edit = args.endpoint === "images.edits" || args.capability === "image.edit";
	const images = ir.image === undefined ? [] : Array.isArray(ir.image) ? ir.image : [ir.image];
	if (edit && images.length !== 1) return fail(400, "ModelScope Qwen-Image-Edit requires one input image.");
	if (!edit && images.length) return fail(400, "Input images require images.edits.");
	const model = args.providerModelSlug || ir.model;
	const body: Record<string, unknown> = { model, prompt: ir.prompt };
	if (edit) {
		try { body.image_url = await imageInputUrl(images[0]); } catch (error) { return fail(400, (error as Error).message); }
	}
	const loras = ir.rawRequest?.config?.modelscope?.loras ?? ir.rawRequest?.loras;
	if (loras !== undefined) body.loras = loras;
	const base = (env.MODELSCOPE_BASE_URL || "https://api-inference.modelscope.cn/v1").replace(/\/+$/, "").replace(/\/v1$/, "");
	const headers = { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" };
	let upstream = await (args.upstreamTiming?.fetch ?? fetch)(`${base}/v1/images/generations`, { method: "POST", headers: { ...headers, "X-ModelScope-Async-Mode": "true" }, body: JSON.stringify(body) });
	let rawResponse: any = await upstream.clone().json().catch(() => null);
	const errorResult = (): ExecutorResult => ({ kind: "completed", upstream, rawResponse, bill: { cost_cents: 0, currency: "USD" }, keySource: key.source, byokKeyId: key.byokId });
	if (!upstream.ok) return errorResult();
	const taskId = rawResponse?.task_id;
	if (typeof taskId !== "string" || !taskId) return fail(502, "ModelScope did not return an image task ID.");
	const deadline = Date.now() + 120_000;
	for (;;) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return fail(504, "ModelScope image task did not complete within two minutes.");
		const init = { headers: { ...headers, "X-ModelScope-Task-Type": "image_generation" }, signal: AbortSignal.timeout(remaining) };
		upstream = await (args.upstreamTiming ? args.upstreamTiming.fetch(`${base}/v1/tasks/${encodeURIComponent(taskId)}`, init, "poll") : fetch(`${base}/v1/tasks/${encodeURIComponent(taskId)}`, init));
		rawResponse = await upstream.clone().json().catch(() => null);
		if (!upstream.ok) return errorResult();
		if (rawResponse?.task_status === "SUCCEED") break;
		if (["FAILED", "CANCELED", "CANCELLED"].includes(rawResponse?.task_status)) return fail(502, "ModelScope image generation failed.");
		if (!["PENDING", "RUNNING", "PROCESSING"].includes(rawResponse?.task_status)) return fail(502, "ModelScope returned an unknown image task status.");
		await new Promise(resolve => setTimeout(resolve, Math.min(5000, Math.max(0, deadline - Date.now()))));
	}
	const urls = Array.isArray(rawResponse?.output_images) ? rawResponse.output_images.filter((url: unknown): url is string => typeof url === "string" && url.length > 0) : [];
	if (!urls.length) return fail(502, "ModelScope returned no output images.");
	const data = await imageResultData(urls, ir.responseFormat, args.upstreamTiming);
	const usage = { output_image: data.length, requests: 1 };
	const response: IRImageGenerationResponse = { id: args.requestId, nativeId: taskId, created: Math.floor(Date.now() / 1000), model, provider: args.providerId, data, usage: usage as any, rawResponse };
	return { kind: "completed", upstream, ir: response, bill: { cost_cents: 0, currency: "USD", usage, upstream_id: taskId, finish_reason: "stop" }, keySource: key.source, byokKeyId: key.byokId, rawResponse, mappedRequest: args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? JSON.stringify(body) : undefined };
};

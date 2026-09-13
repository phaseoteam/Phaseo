import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";
import { imageResultData, unsupportedImageOption } from "@executors/_shared/image-results";

// https://cloud.baidu.com/doc/qianfan-api/s/8m7u6un8a
export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRImageGenerationRequest;
	const fail = (message: string, status = 400) => ({ kind: "completed" as const, upstream: Response.json({ error: { message } }, { status }), bill: { cost_cents: 0, currency: "USD" } });
	const model = args.providerModelSlug || ir.model;
	if (model !== "qwen-image") return fail("Unsupported Qianfan image model.");
	const unsupported = unsupportedImageOption(ir) ?? (ir.image ? "image" : ir.n !== undefined && ir.n !== 1 ? "n" : undefined);
	if (unsupported) return fail(`Qianfan qwen-image does not support ${unsupported}.`);
	if (!ir.prompt || ir.prompt.length > 800) return fail("Qianfan image prompts must contain 1–800 characters.");
	const size = ir.size || "1024x1024";
	if (size !== "1024x1024") return fail("Qianfan image pricing is currently configured for 1024x1024 only.");
	const raw = ir.rawRequest ?? {};
	const options = { ...raw, ...(raw.provider_options?.baidu ?? {}) };
	const body: Record<string, unknown> = { model, prompt: ir.prompt, n: 1, size };
	for (const key of ["negative_prompt", "steps", "seed", "guidance", "prompt_extend", "watermark", "user"]) {
		if (options[key] !== undefined) body[key] = options[key];
	}
	if (body.negative_prompt !== undefined && (typeof body.negative_prompt !== "string" || body.negative_prompt.length > 500)) return fail("negative_prompt must be a string of at most 500 characters.");
	for (const [key, min, max, integer] of [["steps", 1, 50, true], ["seed", 0, 4294967295, true], ["guidance", 0, 20, false]] as const) {
		const value = body[key];
		if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))) return fail(`Invalid Qianfan ${key}.`);
	}
	for (const key of ["prompt_extend", "watermark"]) if (body[key] !== undefined && typeof body[key] !== "boolean") return fail(`${key} must be boolean.`);
	const key = resolveOpenAICompatKey({ ...args, forceGatewayKey: args.meta.forceGatewayKey });
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)("https://qianfan.baidubce.com/v2/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const common = { upstream, keySource: key.source, byokKeyId: key.byokId };
	if (!upstream.ok) return { kind: "completed", ...common, bill: { cost_cents: 0, currency: "USD" } };
	const result: any = await upstream.clone().json();
	if (!Array.isArray(result.data) || result.data.length !== 1 || result.data.some((item: any) => typeof item.url !== "string" || (item.task_status && item.task_status !== "SUCCESS"))) return fail("Qianfan did not return a completed image.", 502);
	const usage = { output_image: result.data.length, requests: 1 };
	const response: IRImageGenerationResponse = { id: args.requestId, created: result.created ?? Math.floor(Date.now() / 1000), model, provider: args.providerId, size, data: await imageResultData(result.data.map((item: any) => item.url), ir.responseFormat, args.upstreamTiming), usage: usage as any };
	return { kind: "completed", ...common, ir: response, bill: { cost_cents: 0, currency: "USD", usage, finish_reason: "stop" } };
};

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { ExecutorExecuteArgs } from "@executors/types";

beforeEach(() => setupRuntimeFromEnv({ DEEPINFRA_API_KEY: "test" }));
afterEach(teardownTestRuntime);
const args = (model: string, ir: Record<string, unknown> = {}): ExecutorExecuteArgs => ({ providerId: "deepinfra", providerModelSlug: model, workspaceId: "ws", requestId: "req", byokMeta: [], meta: {}, ir: { model, prompt: "A tree", ...ir } } as ExecutorExecuteArgs);

describe("DeepInfra native image contracts", () => {
	it("preserves native cost for variable megapixel pricing", async () => {
		const mock = installFetchMock([{ match: url => url.endsWith("/v1/inference/black-forest-labs/FLUX-2-pro"), response: jsonResponse({ status: "ok", image_url: "data:image/png;base64,AQID", request_id: "native", inference_status: { cost: 0.0473 } }) }]);
		try {
			const result = await execute(args("black-forest-labs/FLUX-2-pro", { size: "1024x1024", image: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), outputFormat: "png" }));
			expect(mock.calls[0].bodyJson).toEqual({ prompt: "A tree", width: 1024, height: 1024, input_image: "AQID", output_format: "png" });
			expect(result.bill.usage?.deepinfra_cost_usd).toBe(0.0473);
			const price = computeBillSummary(result.bill.usage!, { rules: [{ meter: "deepinfra_cost_usd", unit_size: 1, price_per_unit: 1, currency: "USD", pricing_plan: "standard", match: [], priority: 100 }] } as any, {}, "standard");
			expect(price.cost_usd_str).toBe("0.047300000");
			expect(result.ir).toMatchObject({ nativeId: "native", data: [{ b64Json: "AQID" }] });
		} finally { mock.restore(); }
	});
	it("maps Qwen edit input and native step controls", async () => {
		const mock = installFetchMock([{ match: url => url.endsWith("/Qwen/Qwen-Image-Edit"), response: jsonResponse({ images: ["data:image/png;base64,AQID"], inference_status: { cost: 0.025 } }) }]);
		try {
			await execute(args("Qwen/Qwen-Image-Edit", { image: "data:image/png;base64,AQID", rawRequest: { provider_options: { deepinfra: { num_inference_steps: 25, negative_prompt: "blur" } } } }));
			expect(mock.calls[0].bodyJson).toEqual({ prompt: "A tree", image: "AQID", num_images: 1, num_inference_steps: 25, negative_prompt: "blur" });
		} finally { mock.restore(); }
	});
	it.each([{ n: 2 }, { size: "2048x2048" }, { quality: "hd" }, { rawRequest: { provider_options: { deepinfra: { unknown: true } } } }])("rejects unsupported FLUX Pro controls before inference", async ir => {
		const mock = installFetchMock([]);
		try {
			expect((await execute(args("black-forest-labs/FLUX-2-pro", ir))).upstream?.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
});

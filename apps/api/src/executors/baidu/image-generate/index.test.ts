import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ BAIDU_QIANFAN_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any) => ({ ir: { model: "qwen-image", prompt: "A dog", ...ir }, providerId: "baidu", endpoint: "images.generations" as any, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });

it("maps native generation controls and bills the completed image", async () => {
	const mock = installFetchMock([{ match: url => url === "https://qianfan.baidubce.com/v2/images/generations", response: jsonResponse({ created: 123, data: [{ url: "https://images.example.com/dog.png" }] }) }]);
	try {
		const result = await executor(args({ rawRequest: { provider_options: { baidu: { steps: 30, guidance: 4, seed: 1, prompt_extend: false, negative_prompt: "blurry" } } } }));
		expect(mock.calls[0].bodyJson).toEqual({ model: "qwen-image", prompt: "A dog", n: 1, size: "1024x1024", steps: 30, guidance: 4, seed: 1, prompt_extend: false, negative_prompt: "blurry" });
		expect(result.kind === "completed" && result.ir).toMatchObject({ data: [{ url: "https://images.example.com/dog.png" }] });
		expect(result.bill.usage?.output_image).toBe(1);
	} finally { mock.restore(); }
});

it.each([{ n: 2 }, { size: "2048x2048" }, { quality: "hd" }, { rawRequest: { steps: 51 } }])("rejects unsupported or invalid controls: %j", async ir => {
	const mock = installFetchMock([]);
	try { expect((await executor(args(ir))).upstream.status).toBe(400); expect(mock.calls).toHaveLength(0); } finally { mock.restore(); }
});

it("does not bill incomplete or failed generation", async () => {
	const mock = installFetchMock([{ match: () => true, response: jsonResponse({ data: [{ task_status: "FAILED", task_error_code: "image_generation_output_image_unsafe" }] }) }]);
	try { const result = await executor(args({})); expect(result.upstream.status).toBe(502); expect(result.bill.cost_cents).toBe(0); } finally { mock.restore(); }
});

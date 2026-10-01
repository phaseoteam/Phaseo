import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ ALIBABA_CLOUD_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any, endpoint: any = "images.generations") => ({ ir, endpoint, providerId: "alibaba-cloud", requestId: "image", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
describe("Alibaba Qwen native images", () => {
	it("maps prompt and native controls into multimodal generation and counts returned images", async () => {
		const mock = installFetchMock([{ match: url => url.endsWith("/api/v1/services/aigc/multimodal-generation/generation"), response: jsonResponse({ request_id: "native", output: { choices: [{ message: { content: [{ image: "https://example.com/image.png" }] } }] } }) }]);
		try {
			const result = await executor(args({ model: "qwen-image", prompt: "A tree", size: "1328x1328", n: 1, rawRequest: { config: { alibaba: { seed: 0, watermark: false, prompt_extend: false } } } }));
			expect(mock.calls[0].bodyJson).toEqual({ model: "qwen-image", input: { messages: [{ role: "user", content: [{ text: "A tree" }] }] }, parameters: { size: "1328*1328", n: 1, seed: 0, watermark: false, prompt_extend: false } });
			expect(result.bill.usage?.output_image).toBe(1);
		} finally { mock.restore(); }
	});
	it("maps multipart image content into native data URLs", async () => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({ output: { choices: [{ message: { content: [{ image: "https://example.com/image.png" }] } }] } }) }]);
		try {
			await executor(args({ model: "qwen-image-edit", prompt: "Blue", image: new Blob(["image"], { type: "image/png" }) }, "images.edits"));
			expect(mock.calls[0].bodyJson.input.messages[0].content[0].image).toBe("data:image/png;base64,aW1hZ2U=");
		} finally { mock.restore(); }
	});
	it.each([{ model: "qwen-image-edit", size: "1024x1024", image: "https://example.com/i.png" }, { model: "qwen-image", n: 2 }, { model: "qwen-image", mask: "mask" }])("rejects unsupported controls before submitting", async ir => {
		const mock = installFetchMock([]);
		try { expect((await executor(args({ prompt: "test", ...ir }))).upstream.status).toBe(400); expect(mock.calls).toHaveLength(0); } finally { mock.restore(); }
	});
});

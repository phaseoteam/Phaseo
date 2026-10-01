import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ MODELSCOPE_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any, endpoint: any = "images.generations") => ({ ir, endpoint, providerId: "modelscope", requestId: "image", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
describe("ModelScope native image tasks", () => {
	it("submits once and polls with the required task type header", async () => {
		const mock = installFetchMock([
			{ match: url => url.endsWith("/v1/images/generations"), response: jsonResponse({ task_id: "task-1" }) },
			{ match: url => url.endsWith("/v1/tasks/task-1"), response: jsonResponse({ task_status: "SUCCEED", output_images: ["https://example.com/image.png"] }) },
		]);
		try {
			const result = await executor(args({ model: "Qwen/Qwen-Image-Edit", prompt: "Blue hair", image: "https://example.com/input.png" }, "images.edits"));
			expect(mock.calls[0].bodyJson).toEqual({ model: "Qwen/Qwen-Image-Edit", prompt: "Blue hair", image_url: "https://example.com/input.png" });
			expect(new Headers(mock.calls[0].headers).get("X-ModelScope-Async-Mode")).toBe("true");
			expect(new Headers(mock.calls[1].headers).get("X-ModelScope-Task-Type")).toBe("image_generation");
			expect(result.bill.usage?.output_image).toBe(1);
		} finally { mock.restore(); }
	});
	it("returns a provider task failure without inventing images or usage", async () => {
		const mock = installFetchMock([{ match: url => url.endsWith("generations"), response: jsonResponse({ task_id: "task" }) }, { match: () => true, response: jsonResponse({ task_status: "FAILED" }) }]);
		try { const result = await executor(args({ model: "Qwen/Qwen-Image", prompt: "test" })); expect(result.upstream.status).toBe(502); expect(result.bill.usage).toBeUndefined(); } finally { mock.restore(); }
	});
});

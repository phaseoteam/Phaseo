import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ OVH_AI_ENDPOINTS_ACCESS_TOKEN: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any) => ({ ir, providerId: "ovhcloud", endpoint: "images.generations" as const, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
it("maps native SDXL binary output to base64 and image usage", async () => {
	const mock = installFetchMock([{ match: url => url.endsWith("/api/text2image"), response: new Response(new Uint8Array([1, 2, 3])) }]);
	try {
		const result = await executor(args({ model: "stable-diffusion-xl", prompt: "sea", rawRequest: { negative_prompt: "blur" } }));
		expect(mock.calls[0].bodyJson).toEqual({ prompt: "sea", negative_prompt: "blur" });
		expect(result.kind === "completed" && result.ir).toMatchObject({ data: [{ b64Json: "AQID" }], size: "1024x1024" });
		expect(result.bill.usage?.output_image).toBe(1);
	} finally { mock.restore(); }
});
it("rejects unsupported dimensions before submission", async () => {
	const result = await executor(args({ model: "stable-diffusion-xl", prompt: "sea", size: "512x512" }));
	expect(result.upstream.status).toBe(400);
});

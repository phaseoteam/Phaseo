import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), key: vi.fn() }));
vi.mock("@executors/_shared/timing/upstream", () => ({ fetchUpstream: mocks.fetch }));
vi.mock("@providers/keys", () => ({ resolveProviderKey: mocks.key }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ NOVITA_API_KEY: "gateway-key" }) }));
import { executor } from "./index";

function args(extra: Record<string, unknown> = {}): ExecutorExecuteArgs {
	return { workspaceId: "ws", requestId: "image", providerId: "novita", providerModelSlug: "ming-image-0.1-design", endpoint: "images.generations", byokMeta: [], pricingCard: {}, meta: {}, ir: { model: "inclusionai/ming-image-0.1-design", prompt: "A landscape", ...extra } };
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.key.mockReturnValue({ source: "gateway", key: "gateway-key", byokId: null });
});
describe("Novita Ming Image", () => {
	it.each(["resolution", "aspect_ratio", "width", "height", "seed", "prompt_optimizer"])("rejects public %s controls that are not mapped by the IR", async field => {
		expect((await executor(args({ rawRequest: { [field]: field === "prompt_optimizer" ? false : 1 } }))).upstream.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it("prevents replay after an uncertain submission", async () => {
		mocks.fetch.mockRejectedValue(new Error("connection lost"));
		expect(await executor(args())).toMatchObject({ terminal: true, upstream: expect.objectContaining({ status: 502 }) });
	});
	it.each(["url", "b64_json"])("maps %s output and canonical token meters", async responseFormat => {
		const image = responseFormat === "url" ? { url: "https://example.com/image.png" } : { b64_json: "aW1hZ2U=" };
		mocks.fetch.mockResolvedValue(Response.json({ id: "native", created: 123, data: [image], usage: { input_tokens: 12, input_tokens_details: { text_tokens: 12 }, output_tokens: 48, output_tokens_details: { image_tokens: 48 }, total_tokens: 60 } }));
		const result = await executor(args({ size: "1024x1024", outputFormat: "jpeg", responseFormat }));
		expect(mocks.fetch.mock.calls[0][1]).toBe("https://api.novita.ai/openai/v1/images/generations");
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ model: "ming-image-0.1-design", prompt: "A landscape", size: "1024x1024", output_format: "jpeg", response_format: responseFormat });
		expect(result.ir).toMatchObject({ model: "inclusionai/ming-image-0.1-design", nativeId: "native", data: [responseFormat === "url" ? image : { b64Json: "aW1hZ2U=" }] });
		expect(result.bill.usage).toMatchObject({ input_text_tokens: 12, output_image_tokens: 48, requests: 1, output_image: 1 });
		expect(result.bill.usage).not.toHaveProperty("output_tokens");
	});
	it("uses documented defaults and BYOK attribution", async () => {
		mocks.key.mockReturnValue({ source: "byok", key: "customer-key", byokId: "byok-id" });
		mocks.fetch.mockResolvedValue(Response.json({ data: [{ b64_json: "image" }], usage: { input_tokens: 0, output_tokens: 16384 } }));
		const result = await executor(args());
		expect(result).toMatchObject({ keySource: "byok", byokKeyId: "byok-id" });
		expect(mocks.fetch.mock.calls[0][2].headers.Authorization).toBe("Bearer customer-key");
		expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toMatchObject({ size: "auto", output_format: "png", response_format: "b64_json" });
	});
	it.each([{ n: 2 }, { stream: true }, { image: "input" }, { quality: "high" }, { size: "512x512" }, { outputFormat: "webp" }])("rejects unsupported controls before fetching", async extra => {
		expect((await executor(args(extra))).upstream?.status).toBe(400);
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
	it.each(["not json", JSON.stringify({ data: [] }), JSON.stringify({ data: [{}] })])("prevents retry after an unusable success response", async body => {
		mocks.fetch.mockResolvedValue(new Response(body));
		expect(await executor(args())).toMatchObject({ terminal: true, upstream: expect.objectContaining({ status: 502 }) });
	});
	it("bounds base64 response buffering", async () => {
		mocks.fetch.mockResolvedValue(new Response(new Uint8Array(16 * 1024 * 1024 + 1)));
		expect(await executor(args())).toMatchObject({ terminal: true, upstream: expect.objectContaining({ status: 502 }) });
	});
	it.each([undefined, { input_tokens: 0, output_tokens: -1 }, { input_tokens: 0 }])("rejects unusable billing usage rather than serving an unpriced image", async usage => {
		mocks.fetch.mockResolvedValue(Response.json({ data: [{ b64_json: "image" }], usage }));
		expect(await executor(args())).toMatchObject({ terminal: true, upstream: expect.objectContaining({ status: 502 }) });
	});
	it("preserves upstream rejection without fabricating usage", async () => {
		mocks.fetch.mockResolvedValue(Response.json({ error: "rejected" }, { status: 429 }));
		const result = await executor(args());
		expect(result.upstream?.status).toBe(429);
		expect(result.bill.usage).toBeUndefined();
	});
});

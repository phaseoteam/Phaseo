import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("../../openai-compatible/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../openai-compatible/config")>();
	return {
		...actual,
		resolveOpenAICompatKey: vi.fn(async () => ({ key: "test-minimax-key", source: "gateway", byokId: null })),
	};
});

import { exec } from "./images";
import { isMiniMaxH3ImageModel } from "./images-h3";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());
afterEach(() => vi.restoreAllMocks());

function rule(meter: string, pricePerMillion: number) {
	return { meter, unit: "token", unit_size: 1_000_000, price_per_unit: String(pricePerMillion), currency: "USD", pricing_plan: "standard", match: [], priority: 100 };
}

// MiniMax-H3-Image standard prices, USD per 1M tokens (platform.minimax.io pricing, 2026-11-10).
const h3Card = {
	provider: "minimax", model: "minimax/minimax-h3-image", endpoint: "image.generate", currency: "USD",
	effective_from: null, effective_to: null, version: null,
	rules: [rule("input_text_tokens", 2.3), rule("input_image_tokens", 1.5), rule("output_image_tokens", 3.8)],
} as unknown as PriceCard;

function args(endpoint: "images.generations" | "images.edits", body: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	return {
		endpoint,
		model: "minimax/minimax-h3-image",
		providerModelSlug: "MiniMax-H3-Image",
		body: { model: "minimax/minimax-h3-image", prompt: "A lighthouse at dusk", ...body },
		meta: { requestId: "req_minimax_h3", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
		workspaceId: "team_test",
		providerId: "minimax",
		byokMeta: [],
		pricingCard: null,
		stream: false,
		...extra,
	} as any;
}

const usage = {
	generated_images: 1,
	total_tokens: 20_000,
	input_tokens: 2_000,
	output_tokens: 18_000,
	input_tokens_details: { text_tokens: 2_000, image_tokens: 0 },
	output_tokens_details: { image_tokens: 18_000 },
};

describe("isMiniMaxH3ImageModel", () => {
	it("matches both H3-Image upstream IDs and not Image-01", () => {
		expect(isMiniMaxH3ImageModel("MiniMax-H3-Image")).toBe(true);
		expect(isMiniMaxH3ImageModel("MiniMax-H3-Image-Highspeed")).toBe(true);
		expect(isMiniMaxH3ImageModel("minimax/minimax-h3-image")).toBe(true);
		expect(isMiniMaxH3ImageModel("image-01")).toBe(false);
	});
});

describe("MiniMax H3-Image generation", () => {
	it("calls the OpenAI-style route, maps size conveniences and prices tokens", async () => {
		let requestBody: any;
		let requestUrl = "";
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({
				created: 1762790400,
				output_format: "jpeg",
				data: [{ url: "https://cdn.example.com/a.jpeg", size: "2720x1536", revised_prompt: "A lighthouse, dusk light" }],
				usage,
				request_id: "trace-h3",
			}),
			onRequest: (call) => { requestBody = call.bodyJson; requestUrl = call.url; },
		}]);

		const result = await exec(args("images.generations", { size: "16:9", resolution: "2K", n: 1 }, { pricingCard: h3Card }));
		mock.restore();

		expect(requestUrl).toContain("/v1/images/generations");
		expect(requestBody).toEqual({ model: "MiniMax-H3-Image", prompt: "A lighthouse at dusk", aspect_ratio: "16:9", area: "2K", n: 1 });
		expect(result.normalized).toMatchObject({
			data: [{ url: "https://cdn.example.com/a.jpeg", size: "2720x1536", revised_prompt: "A lighthouse, dusk light" }],
			usage: { input_text_tokens: 2_000, input_image_tokens: 0, output_image_tokens: 18_000, output_image: 1, requests: 1 },
		});
		// 2,000 × $2.30/M + 18,000 × $3.80/M = $0.0046 + $0.0684 = $0.073
		expect(result.bill.usage.pricing.total_nanos).toBe(73_000_000);
		expect(result.bill.upstream_id).toBe("trace-h3");
	});

	it("sends an explicit size alone and maps prompt_optimizer false to disable_prompt_enhanced", async () => {
		let requestBody: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({ data: [{ b64_json: "abc", size: "2048x2048" }], usage }),
			onRequest: (call) => { requestBody = call.bodyJson; },
		}]);
		await exec(args("images.generations", { size: "2048x2048", prompt_optimizer: false, response_format: "b64_json", output_format: "webp" }));
		mock.restore();
		expect(requestBody).toEqual({
			model: "MiniMax-H3-Image", prompt: "A lighthouse at dusk", size: "2048x2048",
			response_format: "b64_json", output_format: "webp", disable_prompt_enhanced: true,
		});
	});

	it("keeps successful images and lists per-image failures from a partial 200", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({
				data: [
					{ url: "https://cdn.example.com/ok.jpeg", size: "4096x4096" },
					{ error: { code: "1027", message: "output image failed content safety check" } },
				],
				usage,
			}),
		}]);
		const result = await exec(args("images.generations", { n: 2 }));
		mock.restore();
		expect(result.upstream.ok).toBe(true);
		expect(result.normalized.data).toEqual([{ url: "https://cdn.example.com/ok.jpeg", size: "4096x4096" }]);
		expect(result.normalized.errors).toEqual([{ index: 1, code: "1027", message: "output image failed content safety check" }]);
	});

	it.each([
		[{ size: "512x512" }, "size"],
		[{ size: "4000x1000" }, "size"],
		[{ size: "2048x2048", aspect_ratio: "1:1" }, "size"],
		[{ aspect_ratio: "4:1" }, "aspect_ratio"],
		[{ area: "8K" }, "area"],
		[{ disable_prompt_enhanced: true }, "disable_prompt_enhanced"],
		[{ stream: true }, "stream"],
		[{ seed: 7 }, "seed"],
		[{ quality: "high" }, "quality"],
		[{ background: "transparent" }, "background"],
	])("rejects %j before calling MiniMax", async (body, param) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await exec(args("images.generations", body));
		expect(result.upstream.status).toBe(400);
		expect((result.normalized as any).error.param).toBe(param);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("maps an all-failed safety response to its status and charges nothing", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({
				data: [{ error: { code: "1027", message: "output image failed content safety check" } }],
				usage: { generated_images: 0, total_tokens: 0, input_tokens: 0, output_tokens: 0 },
			}, { status: 422 }),
		}]);
		const result = await exec(args("images.generations", {}, { pricingCard: h3Card }));
		mock.restore();
		expect(result.upstream.status).toBe(422);
		expect(result.normalized).toEqual({ error: { type: "minimax_1027", message: "output image failed content safety check" } });
		expect(result.bill.cost_cents).toBe(0);
	});

	it("reports MiniMax's own insufficient balance as an upstream error, not a 402", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/generations"),
			response: jsonResponse({ data: [{ error: { code: "1008", message: "insufficient balance" } }], usage: { generated_images: 0 } }, { status: 402 }),
		}]);
		const result = await exec(args("images.generations", {}));
		mock.restore();
		expect(result.upstream.status).toBe(502);
	});

	it("marks a lost connection terminal so the gateway does not resubmit and bill twice", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection reset"); }));
		const result: any = await exec(args("images.generations", {}));
		vi.unstubAllGlobals();
		expect(result.terminal).toBe(true);
		expect(result.upstream.status).toBe(502);
	});
});

describe("MiniMax H3-Image editing", () => {
	it("sends reference images as JSON images[].image_url on /images/edits", async () => {
		let requestBody: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/images/edits"),
			response: jsonResponse({
				data: [{ url: "https://cdn.example.com/edit.jpeg", size: "2048x2048" }],
				usage: { ...usage, input_tokens: 3_000, input_tokens_details: { text_tokens: 2_000, image_tokens: 1_000 } },
			}),
			onRequest: (call) => { requestBody = call.bodyJson; },
		}]);
		const result = await exec(args("images.edits", {
			image: ["https://example.com/cat.jpg", "data:image/png;base64,abc"],
			size: "2K",
		}, { pricingCard: h3Card }));
		mock.restore();

		expect(requestBody).toEqual({
			model: "MiniMax-H3-Image",
			prompt: "A lighthouse at dusk",
			area: "2K",
			images: [{ image_url: "https://example.com/cat.jpg" }, { image_url: "data:image/png;base64,abc" }],
		});
		// 2,000 × $2.30/M + 1,000 × $1.50/M + 18,000 × $3.80/M = $0.0745
		expect(result.bill.usage.pricing.total_nanos).toBe(74_500_000);
	});

	it("rejects masks and disabling prompt enhancement on edits", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const masked = await exec(args("images.edits", { image: "https://example.com/cat.jpg", mask: "data:image/png;base64,m" }));
		const unenhanced = await exec(args("images.edits", { image: "https://example.com/cat.jpg", disable_prompt_enhanced: true, size: "2048x2048" }));
		vi.unstubAllGlobals();
		expect(masked.upstream.status).toBe(400);
		expect(unenhanced.upstream.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

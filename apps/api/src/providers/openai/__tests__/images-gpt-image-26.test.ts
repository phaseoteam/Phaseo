import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const loadPriceCardMock = vi.hoisted(() => vi.fn());
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: loadPriceCardMock }));

import { exec as generateImage } from "../endpoints/images";
import { exec as editImage } from "../endpoints/images-edits";
import { normalizeSvgAuthorModel, priceSvgAuthorUsage, resolveSvgAuthor } from "../endpoints/images-svg";
import { calculatePricing } from "@pipeline/after/pricing";

function rule(meter: string, pricePerMillion: number) {
	return { meter, unit: "token", unit_size: 1_000_000, price_per_unit: String(pricePerMillion), currency: "USD", pricing_plan: "standard", match: [], priority: 100 };
}

// GPT Image 2.6 Flare and GPT-5 nano standard prices (USD per 1M tokens).
const imageCard = {
	provider: "openai", model: "openai/gpt-image-2.6-flare", endpoint: "image.generate", currency: "USD",
	effective_from: null, effective_to: null, version: null,
	rules: [rule("input_text_tokens", 5), rule("input_image_tokens", 8), rule("output_image_tokens", 30)],
} as unknown as PriceCard;
const nanoCard = {
	provider: "openai", model: "openai/gpt-5-nano", endpoint: "text.generate", currency: "USD",
	effective_from: null, effective_to: null, version: null,
	rules: [rule("input_text_tokens", 0.05), rule("output_text_tokens", 0.4)],
} as unknown as PriceCard;

// The usage OpenAI returned for a real low-quality SVG request on 2026-11-05.
const svgResponse = {
	created: 1,
	output_format: "svg",
	quality: "low",
	size: "1024x1024",
	data: [{ b64_json: "PHN2Zz48L3N2Zz4=" }],
	svg_usage: { input_tokens: 1860, model: "gpt-5-nano-2025-08-07", output_tokens: 9628, reasoning_tokens: 8960, total_tokens: 11488 },
	usage: {
		input_tokens: 81, input_tokens_details: { image_tokens: 0, text_tokens: 81 },
		output_tokens: 824, output_tokens_details: { image_tokens: 824, text_tokens: 0 }, total_tokens: 905,
	},
};
// 81 × $5/M + 824 × $30/M
const IMAGE_NANOS = 405_000 + 24_720_000;
// 1,860 × $0.05/M + 9,628 × $0.40/M (reasoning sits inside output and is not billed again)
const AUTHOR_NANOS = 93_000 + 3_851_200;

const baseArgs = {
	meta: { requestId: "req_gpt_image_26", apiKeyId: "key_test", apiKeyRef: "kid_test", apiKeyKid: "kid_test" },
	workspaceId: "team_test",
	providerId: "openai",
	byokMeta: [],
	endpoint: "images.generations",
	model: "openai/gpt-image-2.6-flare",
	providerModelSlug: "gpt-image-2.6-flare",
	stream: false,
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);
beforeEach(() => {
	loadPriceCardMock.mockReset();
	loadPriceCardMock.mockImplementation(async (_provider: string, model: string) => model === "openai/gpt-5-nano" ? nanoCard : null);
});

describe("GPT Image 2.6 request fields", () => {
	it("forwards complexity and GIF frame settings", async () => {
		let upstreamBody: Record<string, unknown> | undefined;
		await generateImage({
			...baseArgs,
			pricingCard: null,
			body: { model: "openai/gpt-image-2.6-flare", prompt: "A bouncing ball", output_format: "gif", frame_count: 4, frame_duration_ms: 120, complexity: "low", size: "512x512" },
			upstreamTiming: { fetch: async (_input: unknown, init?: RequestInit) => {
				upstreamBody = JSON.parse(String(init?.body));
				return jsonResponse({ created: 1, data: [{ b64_json: "R0lG" }], usage: { input_tokens: 1, output_tokens: 1 } });
			} },
		} as any);

		expect(upstreamBody).toMatchObject({ model: "gpt-image-2.6-flare", output_format: "gif", frame_count: 4, frame_duration_ms: 120, complexity: "low", size: "512x512" });
		expect(upstreamBody).not.toHaveProperty("svg");
	});

	it("sends OpenAI's id for the SVG author and returns svg_usage", async () => {
		let upstreamBody: Record<string, unknown> | undefined;
		const result = await generateImage({
			...baseArgs,
			pricingCard: imageCard,
			body: { model: "openai/gpt-image-2.6-flare", prompt: "An apple icon", output_format: "svg", quality: "low", svg: { model: "openai/gpt-5-nano", reasoning: { effort: "low" } } },
			upstreamTiming: { fetch: async (_input: unknown, init?: RequestInit) => {
				upstreamBody = JSON.parse(String(init?.body));
				return jsonResponse(svgResponse);
			} },
		} as any);

		expect(upstreamBody).toMatchObject({ output_format: "svg", svg: { model: "gpt-5-nano", reasoning: { effort: "low" } } });
		expect(loadPriceCardMock).toHaveBeenCalledWith("openai", "openai/gpt-5-nano", "text.generate");
		expect(result.kind).toBe("completed");
		expect((result as any).normalized.svg_usage).toMatchObject({ model: "gpt-5-nano-2025-08-07", output_tokens: 9628 });
		expect(result.bill.usage.svg_author_pricing).toMatchObject({
			model: "openai/gpt-5-nano", upstream_model: "gpt-5-nano-2025-08-07",
			input_tokens: 1860, output_tokens: 9628, reasoning_tokens: 8960, total_nanos: AUTHOR_NANOS,
		});
		expect(result.bill.cost_cents).toBe(Math.trunc((IMAGE_NANOS + AUTHOR_NANOS) / 10_000_000));
	});

	it("refuses an SVG author without Phaseo pricing before calling OpenAI", async () => {
		const fetchMock = vi.fn();
		const result = await generateImage({
			...baseArgs,
			pricingCard: imageCard,
			body: { model: "openai/gpt-image-2.6-flare", prompt: "An apple icon", output_format: "svg", svg: { model: "gpt-unknown" } },
			upstreamTiming: { fetch: fetchMock },
		} as any);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.json()).toMatchObject({ error: { param: "svg.model", code: "invalid_svg_model" } });
	});

	it("forwards markup and complexity on edits", async () => {
		let upstreamBody: FormData | undefined;
		await editImage({
			...baseArgs,
			endpoint: "images.edits",
			pricingCard: null,
			body: {
				model: "openai/gpt-image-2.6-flare",
				prompt: "Add a sun in the circle",
				image: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
				markup: new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" }),
				complexity: "medium",
			},
			upstreamTiming: { fetch: async (_input: unknown, init?: RequestInit) => {
				upstreamBody = init?.body as FormData;
				return jsonResponse({ created: 1, data: [{ b64_json: "abc" }], usage: { input_tokens: 1, output_tokens: 1 } });
			} },
		} as any);

		expect(upstreamBody?.get("markup")).toBeInstanceOf(Blob);
		expect(upstreamBody?.get("complexity")).toBe("medium");
	});
});

describe("SVG author pricing", () => {
	it("accepts OpenAI ids with or without the openai/ prefix only", () => {
		expect(normalizeSvgAuthorModel("gpt-5-nano")).toBe("openai/gpt-5-nano");
		expect(normalizeSvgAuthorModel(" OpenAI/GPT-5-nano ")).toBe("openai/gpt-5-nano");
		expect(normalizeSvgAuthorModel("anthropic/claude-haiku-5-5")).toBeNull();
		expect(normalizeSvgAuthorModel("openai/")).toBeNull();
	});

	it("needs standard input and output text prices", async () => {
		expect(await resolveSvgAuthor("gpt-5-nano")).toMatchObject({ model: "openai/gpt-5-nano", upstreamModel: "gpt-5-nano" });
		const inputOnly = { ...nanoCard, rules: [rule("input_text_tokens", 0.05)] };
		expect(await resolveSvgAuthor("gpt-5-nano", async () => inputOnly as PriceCard)).toBeNull();
	});

	it("adds the author's cost to the request total when pricing runs again after the response", async () => {
		const author = (await resolveSvgAuthor("gpt-5-nano"))!;
		const svgAuthorPricing = priceSvgAuthorUsage(svgResponse.svg_usage, author)!;
		const usage = { input_text_tokens: 81, output_image_tokens: 824, requests: 1, svg_author_pricing: svgAuthorPricing };

		const priced = calculatePricing(usage, imageCard, { model: "openai/gpt-image-2.6-flare", output_format: "svg" }, "basic", null);

		expect(priced.totalNanos).toBe(IMAGE_NANOS + AUTHOR_NANOS);
		expect(priced.totalCents).toBe(Math.trunc((IMAGE_NANOS + AUTHOR_NANOS) / 10_000_000));
		expect(priced.pricedUsage.pricing.total_nanos).toBe(IMAGE_NANOS + AUTHOR_NANOS);
		expect(priced.pricedUsage.pricing.lines.filter((line: any) => line.component === "svg_author").map((line: any) => line.dimension))
			.toEqual(["input_text_tokens", "output_text_tokens"]);
	});

	it("rejects a malformed author total instead of billing it", () => {
		const usage = { input_text_tokens: 81, output_image_tokens: 824, svg_author_pricing: { total_nanos: -1, lines: [] } };
		expect(() => calculatePricing(usage, imageCard, { model: "openai/gpt-image-2.6-flare" }, "basic", null)).toThrow("svg_author_pricing_invalid");
	});
});

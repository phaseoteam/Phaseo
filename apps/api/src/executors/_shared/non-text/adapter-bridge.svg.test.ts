import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";

const loadPriceCardMock = vi.hoisted(() => vi.fn());
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: loadPriceCardMock }));

import { execute as executeNonTextAdapter } from "./adapter-bridge";
import { encodeNonTextResponse } from "@pipeline/surfaces/non-text";

function rule(meter: string, pricePerMillion: number) {
	return { meter, unit: "token", unit_size: 1_000_000, price_per_unit: pricePerMillion, currency: "USD", pricing_plan: "standard", match: [], priority: 100 };
}

const svgUsage = { input_tokens: 1860, model: "gpt-5-nano-2025-08-07", output_tokens: 9628, reasoning_tokens: 8960, total_tokens: 11488 };

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

describe("GPT Image SVG through the non-text surface", () => {
	it("returns svg_usage on the public response and sends the 2.6 fields upstream", async () => {
		loadPriceCardMock.mockResolvedValue({
			provider: "openai", model: "openai/gpt-5-nano", endpoint: "text.generate", currency: "USD",
			effective_from: null, effective_to: null, version: null,
			rules: [rule("input_text_tokens", 0.05), rule("output_text_tokens", 0.4)],
		});
		let sent: Record<string, unknown> | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (!url.includes("/images/generations")) return false;
				sent = JSON.parse(String(init?.body));
				return true;
			},
			response: jsonResponse({
				created: 1,
				output_format: "svg",
				size: "1024x1024",
				quality: "low",
				data: [{ b64_json: "PHN2Zz48L3N2Zz4=" }],
				svg_usage: svgUsage,
				usage: { input_tokens: 81, input_tokens_details: { text_tokens: 81, image_tokens: 0 }, output_tokens: 824, output_tokens_details: { image_tokens: 824, text_tokens: 0 }, total_tokens: 905 },
			}),
		}]);
		const body = { model: "openai/gpt-image-2.6-flare", prompt: "An apple icon", output_format: "svg", quality: "low", complexity: "low", svg: { model: "openai/gpt-5-nano" } };
		const result = await executeNonTextAdapter({
			ir: { model: body.model, prompt: body.prompt, outputFormat: "svg", quality: "low", rawRequest: body },
			requestId: "req_svg_surface",
			workspaceId: "team_test",
			providerId: "openai",
			endpoint: "images.generations",
			providerModelSlug: "gpt-image-2.6-flare",
			byokMeta: [],
			pricingCard: {
				provider: "openai", model: body.model, endpoint: "image.generate", currency: "USD",
				effective_from: null, effective_to: null, version: null,
				rules: [rule("input_text_tokens", 5), rule("output_image_tokens", 30)],
			},
			meta: {},
		} as any);
		mock.restore();

		expect(sent).toMatchObject({ output_format: "svg", complexity: "low", svg: { model: "gpt-5-nano" } });
		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.bill.usage.svg_author_pricing.total_nanos).toBe(93_000 + 3_851_200);
		const encoded = encodeNonTextResponse("images.generations", result.ir as any, "req_svg_surface");
		expect(encoded).toMatchObject({ output_format: "svg", svg_usage: svgUsage });
	});
});

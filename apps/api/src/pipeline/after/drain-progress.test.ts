import { describe, expect, it } from "vitest";
import { estimateDrainProgressUsage, estimateRequestInputTokens } from "./drain-progress";
import { computeBill } from "../pricing/engine";

describe("estimateDrainProgressUsage", () => {
	const requestBody = { model: "m", messages: [{ role: "user", content: "x".repeat(2_000) }] };

	it("estimates the prompt from the request until the provider reports input", () => {
		// 2,000 prompt characters and 1,000 streamed characters, at 5 characters per token.
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 1_000, requestBody }))
			.toEqual({ usage: { input_tokens: 400, input_tokens_details: { cached_tokens: 400 }, output_tokens: 200 }, inputReported: false });
		expect(estimateDrainProgressUsage({ usage: { output_tokens: 3 }, outputChars: 1_000, requestBody }))
			.toEqual({ usage: { input_tokens: 400, input_tokens_details: { cached_tokens: 400 }, output_tokens: 200 }, inputReported: false });
	});

	it("counts the prompt when nothing has streamed yet", () => {
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 0, requestBody }))
			.toEqual({ usage: { input_tokens: 400, input_tokens_details: { cached_tokens: 400 }, output_tokens: 0 }, inputReported: false });
	});

	it("prices the estimated prompt at the cache-read rate, or the input rate without one", () => {
		const rule = (meter: string, price: string) => ({ pricing_plan: "standard", meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100 });
		const card = (rules: unknown[]) => ({ provider: "openai", model: "m", endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null, rules }) as any;
		const { usage } = estimateDrainProgressUsage({ usage: null, outputChars: 0, requestBody })!;
		const withCacheRate = computeBill(usage, card([rule("input_text_tokens", "10"), rule("cached_read_text_tokens", "1"), rule("output_text_tokens", "40")]));
		expect(withCacheRate.pricing.total_nanos).toBe(400_000);
		const withoutCacheRate = computeBill(usage, card([rule("input_text_tokens", "10"), rule("output_text_tokens", "40")]));
		expect(withoutCacheRate.pricing.total_nanos).toBe(4_000_000);
	});

	it("counts only the streamed output when the request has no prompt text", () => {
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 1_000 }))
			.toEqual({ usage: { input_tokens: 0, output_tokens: 200 }, inputReported: false });
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 1_000, requestBody: { model: "m", messages: [] } }))
			.toEqual({ usage: { input_tokens: 0, output_tokens: 200 }, inputReported: false });
	});

	it("prefers reported input over the request estimate", () => {
		expect(estimateDrainProgressUsage({ usage: { input_tokens: 40 }, outputChars: 500, requestBody }))
			.toEqual({ usage: { input_tokens: 40, output_tokens: 100 }, inputReported: true });
	});

	it("keeps reported input and cache counts and never lowers reported output", () => {
		const usage = { input_tokens: 40, cache_read_input_tokens: 900, output_tokens: 300 };
		expect(estimateDrainProgressUsage({ usage, outputChars: 500 }))
			.toEqual({ usage: { ...usage, output_tokens: 300 }, inputReported: true });
		expect(estimateDrainProgressUsage({ usage: { prompt_tokens: 40 }, outputChars: 500 }))
			.toEqual({ usage: { prompt_tokens: 40, completion_tokens: 100 }, inputReported: true });
	});

	it("returns nothing when there is nothing to charge", () => {
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 0 })).toBeNull();
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 0, requestBody: { model: "m", messages: [{ role: "user", content: "hi" }] } })).toBeNull();
	});
});

describe("estimateRequestInputTokens", () => {
	it("counts prompt text across request shapes at 5 characters per token", () => {
		const text = "x".repeat(50);
		expect(estimateRequestInputTokens({ messages: [{ role: "system", content: text }, { role: "user", content: [{ type: "text", text }] }] })).toBe(20);
		expect(estimateRequestInputTokens({ instructions: text, input: text })).toBe(20);
		expect(estimateRequestInputTokens({ input: [{ role: "user", content: [{ type: "input_text", text }] }] })).toBe(10);
		expect(estimateRequestInputTokens({ system: [{ type: "text", text }], messages: [{ role: "user", content: text }] })).toBe(20);
		expect(estimateRequestInputTokens({ contents: [{ role: "user", parts: [{ text }] }] })).toBe(10);
		expect(estimateRequestInputTokens({ prompt: text })).toBe(10);
	});

	it("leaves out media payloads, URLs, tool arguments and fields that are not prompt text", () => {
		const data = "A".repeat(10_000);
		expect(estimateRequestInputTokens({
			model: "m".repeat(100),
			metadata: { note: data },
			tools: [{ type: "function", function: { name: "f", description: data } }],
			messages: [
				{ role: "user", content: [
					{ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } },
					{ type: "input_audio", input_audio: { data, format: "wav" } },
					{ type: "image", source: { type: "base64", media_type: "image/png", data } },
				] },
				{ role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "f", arguments: data } }] },
			],
		})).toBe(0);
	});

	it("returns 0 for a missing or non-object body", () => {
		expect(estimateRequestInputTokens(undefined)).toBe(0);
		expect(estimateRequestInputTokens("text")).toBe(0);
		expect(estimateRequestInputTokens({})).toBe(0);
	});
});

import { describe, expect, it } from "vitest";
import { formatClientPayload, usageCostFields } from "./payload";

// What the after stage attaches to usage once a request is priced and settled.
const settledPricing = {
	total_nanos: 1_234_567,
	total_usd_str: "0.001234567",
	total_cents: 0,
	currency: "USD",
	lines: [{ dimension: "input_text_tokens", line_nanos: 1_234_567 }],
};

const byokPricing = {
	...settledPricing,
	// The BYOK service fee is the charge; the reference total is the provider's cost.
	total_nanos: 61_728,
	total_usd_str: "0.000061728",
	byok_reference_total_nanos: 1_234_567,
	byok_reference_total_usd_str: "0.001234567",
};

const chatIr = {
	choices: [{
		index: 0,
		message: { role: "assistant", content: [{ type: "text", text: "OK" }] },
		finishReason: "stop",
	}],
	usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
};

function chatPayload(pricing: Record<string, unknown> | undefined) {
	return formatClientPayload({
		ctx: {
			endpoint: "chat.completions",
			protocol: "openai.chat.completions",
			requestId: "req_cost_chat",
			model: "openai/gpt-5-mini",
			body: {},
			meta: {},
		} as any,
		result: { provider: "openai", ir: chatIr } as any,
		payload: {
			id: "req_cost_chat",
			model: "openai/gpt-5-mini",
			choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
			usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, ...(pricing ? { pricing } : {}) },
		},
		includeMeta: false,
	});
}

describe("usage.cost on text responses", () => {
	it("reports the charged amount in USD on buffered Chat Completions usage", () => {
		const body = chatPayload(settledPricing);

		expect(body.usage.cost).toBe(0.001234567);
		expect(body.usage.cost_details).toEqual({ upstream_inference_cost: null });
		// Existing pricing fields stay as they were.
		expect(body.usage.pricing.total_nanos).toBe(1_234_567);
		expect(body.usage.pricing.total_usd_str).toBe("0.001234567");
		expect(body.cost_nanos).toBe(1_234_567);
		expect(body.usage.prompt_tokens).toBe(10);
	});

	it("reports the BYOK fee as cost and the provider's cost as upstream_inference_cost", () => {
		const body = chatPayload(byokPricing);

		expect(body.usage.cost).toBe(0.000061728);
		expect(body.usage.cost_details).toEqual({ upstream_inference_cost: 0.001234567 });
		expect(body.cost_nanos).toBe(61_728);
	});

	it("reports a zero cost when the settled charge is zero", () => {
		const body = chatPayload({ ...settledPricing, total_nanos: 0, total_usd_str: "0.000000000", lines: [], billing_suppressed: true });

		expect(body.usage.cost).toBe(0);
	});

	it("omits cost when the response has no pricing result", () => {
		const body = chatPayload(undefined);

		expect(body.usage).not.toHaveProperty("cost");
		expect(body.usage).not.toHaveProperty("cost_details");
	});

	it("reports cost on buffered Responses usage next to pricing_breakdown", () => {
		const body = formatClientPayload({
			ctx: {
				endpoint: "responses",
				protocol: "openai.responses",
				requestId: "req_cost_responses",
				model: "openai/gpt-5-mini",
				body: {},
				meta: {},
			} as any,
			result: { provider: "openai", ir: chatIr } as any,
			payload: {
				id: "req_cost_responses",
				object: "response",
				status: "completed",
				output: [],
				usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, pricing: settledPricing },
			},
			includeMeta: false,
		});

		expect(body.usage.cost).toBe(0.001234567);
		expect(body.usage.cost_details).toEqual({ upstream_inference_cost: null });
		expect(body.usage.pricing_breakdown.total_nanos).toBe(1_234_567);
		expect(body.usage.input_tokens).toBe(10);
	});

	it("reports cost on buffered Messages usage", () => {
		const body = formatClientPayload({
			ctx: {
				endpoint: "messages",
				protocol: "anthropic.messages",
				requestId: "req_cost_messages",
				model: "anthropic/claude-sonnet-4.6",
				body: {},
				meta: {},
			} as any,
			result: { provider: "anthropic", ir: chatIr } as any,
			payload: {
				usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, pricing: settledPricing },
			},
			includeMeta: false,
		});

		expect(body.type).toBe("message");
		expect(body.usage.input_tokens).toBe(10);
		expect(body.usage.output_tokens).toBe(2);
		expect(body.usage.cost).toBe(0.001234567);
		expect(body.usage.cost_details).toEqual({ upstream_inference_cost: null });
	});

	it("reports cost on embeddings usage", () => {
		const body = formatClientPayload({
			ctx: { endpoint: "embeddings", protocol: "openai.compat", requestId: "req_cost_embeddings" } as any,
			result: { provider: "openai" } as any,
			payload: {
				object: "list",
				data: [],
				usage: { input_tokens: 12, total_tokens: 12, pricing_breakdown: { ...settledPricing, total_nanos: 240 } },
			},
			includeMeta: false,
		});

		expect(body.usage.cost).toBe(0.00000024);
		expect(body.usage.pricing_breakdown.total_nanos).toBe(240);
	});

	it("reads cost from the pricing result without pricing again", () => {
		expect(usageCostFields({ total_nanos: 2_500_000_000 })).toEqual({
			cost: 2.5,
			cost_details: { upstream_inference_cost: null },
		});
		expect(usageCostFields({ total_cents: 5 })).toBeUndefined();
		expect(usageCostFields(null)).toBeUndefined();
	});
});

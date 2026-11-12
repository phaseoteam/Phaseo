import { describe, expect, it } from "vitest";
import { applySuccessfulResponseBillingPolicy, suppressFailedResponseBilling } from "./billing-policy";
import { calculatePricing } from "./pricing";

describe("suppressFailedResponseBilling", () => {
	it("charges extraction aggregate input once despite zero output tokens", () => {
		const price = calculatePricing({ input_tokens: 655, output_tokens: 0, total_tokens: 655 }, {
			provider: "cloudflare", model: "cloudflare/clairic", endpoint: "extraction.extract",
			currency: "USD", effective_from: null, effective_to: null, version: null,
			rules: [{ meter: "input_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.1", currency: "USD", pricing_plan: "standard", note: null, match: [], priority: 100 }],
		}, {});
		expect(price.totalNanos).toBe(65_500);
		const result = applySuccessfulResponseBillingPolicy({ endpoint: "extractions", ...price });
		expect(result).toMatchObject({ totalNanos: 65_500, billingSuppressed: false });
	});
	it("preserves observed usage for audit but forces the customer charge to zero", () => {
		const result: any = {
			bill: {
				cost_cents: 12,
				currency: "USD",
				usage: { input_tokens: 120, output_tokens: 0, pricing: { total_nanos: 120_000_000 } },
			},
			ir: { usage: { input_tokens: 120, output_tokens: 0 } },
		};
		suppressFailedResponseBilling({
			ctx: { endpoint: "responses", body: {} } as any,
			result,
			reason: "empty_response",
		});
		expect(result.bill.cost_cents).toBe(0);
		expect(result.bill.usage).toMatchObject({
			input_tokens: 120,
			output_tokens: 0,
			pricing: {
				total_nanos: 0,
				lines: [],
				billing_suppressed: true,
				billing_suppression_reason: "empty_response",
			},
		});
	});

	it("does not bill a zero-output text generation the provider reports as free", () => {
		const result = applySuccessfulResponseBillingPolicy({
			endpoint: "responses",
			pricedUsage: { input_tokens: 120, output_tokens: 0, cost: 0, pricing: { total_nanos: 120_000_000, lines: [{ line_nanos: 120_000_000 }] } },
			totalNanos: 120_000_000,
			totalCents: 12,
		});
		expect(result).toMatchObject({ totalNanos: 0, totalCents: 0, billingSuppressed: true });
		expect(result.pricedUsage.pricing).toMatchObject({
			lines: [],
			billing_suppression_reason: "zero_output_tokens",
		});
	});

	it("bills the input and cache writes of a zero-output text generation", () => {
		for (const pricedUsage of [
			{ input_tokens: 200_000, output_tokens: 0 },
			{ input_tokens: 0, cached_write_text_tokens: 50_000, output_tokens: 0 },
			{ prompt_tokens: 1_000, completion_tokens: 0, output_tokens: 0 },
		]) {
			const result = applySuccessfulResponseBillingPolicy({
				endpoint: "messages",
				pricedUsage: { ...pricedUsage, pricing: { total_nanos: 600_000_000, lines: [{ line_nanos: 600_000_000 }] } },
				totalNanos: 600_000_000,
				totalCents: 60,
			});
			expect(result).toMatchObject({ totalNanos: 600_000_000, billingSuppressed: false });
		}
	});

	it("adds server-tool model calls as their own lines, even when the main usage is waived", () => {
		const charges = [
			{ kind: "advisor" as const, model: "anthropic/claude-opus-5.5", provider: "anthropic", keySource: "gateway" as const, totalNanos: 450_000_000, currency: "USD", inputTokens: 2_000, outputTokens: 32_000 },
			{ kind: "image_generation" as const, model: "openai/gpt-image-2", provider: "openai", keySource: "gateway" as const, totalNanos: 40_000_000, currency: "USD" },
		];
		const paid = applySuccessfulResponseBillingPolicy({
			endpoint: "chat.completions",
			pricedUsage: { input_tokens: 100, output_tokens: 20, pricing: { total_nanos: 0, total_cents: 0, lines: [{ dimension: "input_text_tokens", line_nanos: 0 }] } },
			totalNanos: 0,
			totalCents: 0,
			subCallCharges: charges,
		});
		expect(paid).toMatchObject({ totalNanos: 490_000_000, totalCents: 49, billingSuppressed: false });
		expect(paid.pricedUsage.pricing.total_nanos).toBe(490_000_000);
		expect(paid.pricedUsage.pricing.lines.map((line: any) => line.dimension)).toEqual([
			"input_text_tokens",
			"server_tool_advisor_model_call",
			"server_tool_image_generation_model_call",
		]);
		expect(paid.pricedUsage.pricing.lines[1]).toMatchObject({
			line_nanos: 450_000_000,
			sub_call: { kind: "advisor", model: "anthropic/claude-opus-5.5", provider: "anthropic", output_tokens: 32_000 },
		});

		const waived = applySuccessfulResponseBillingPolicy({
			endpoint: "chat.completions",
			pricedUsage: { output_tokens: 0, pricing: { total_nanos: 0, lines: [] } },
			totalNanos: 0,
			totalCents: 0,
			subCallCharges: charges,
		});
		expect(waived).toMatchObject({ totalNanos: 490_000_000, billingSuppressed: true });
	});

	it("reconciles BYOK billing metadata when a response is suppressed", () => {
		const result = applySuccessfulResponseBillingPolicy({
			endpoint: "responses",
			pricedUsage: {
				output_tokens: 0,
				pricing: { total_nanos: 50_000_000 },
				byok_billing: { fee_applied: true, fee_nanos: 50_000_000, charged_nanos: 50_000_000 },
			},
			totalNanos: 50_000_000,
			totalCents: 5,
		});
		expect(result.pricedUsage.byok_billing).toMatchObject({
			fee_applied: false,
			fee_nanos: 0,
			charged_nanos: 0,
		});
	});

	it("keeps valid tool and non-text output surfaces billable", () => {
		expect(applySuccessfulResponseBillingPolicy({
			endpoint: "responses",
			pricedUsage: { output_tokens: 0, output_tool_call_count: 1 },
			totalNanos: 50,
			totalCents: 1,
		}).totalNanos).toBe(50);
		expect(applySuccessfulResponseBillingPolicy({
			endpoint: "embeddings",
			pricedUsage: { output_tokens: 0 },
			totalNanos: 50,
			totalCents: 1,
		}).totalNanos).toBe(50);
	});
});

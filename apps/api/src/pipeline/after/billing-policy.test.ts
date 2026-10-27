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

	it("does not bill a text generation with explicitly zero output tokens", () => {
		const result = applySuccessfulResponseBillingPolicy({
			endpoint: "responses",
			pricedUsage: { input_tokens: 120, output_tokens: 0, pricing: { total_nanos: 120_000_000, lines: [{ line_nanos: 120_000_000 }] } },
			totalNanos: 120_000_000,
			totalCents: 12,
		});
		expect(result).toMatchObject({ totalNanos: 0, totalCents: 0, billingSuppressed: true });
		expect(result.pricedUsage.pricing).toMatchObject({
			lines: [],
			billing_suppression_reason: "zero_output_tokens",
		});
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

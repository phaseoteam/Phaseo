import { describe, expect, it, vi } from "vitest";

// A BYOK request is charged 2.5% of its provider cost (the monthly free requests are byok-fee's concern).
vi.mock("./byok-fee", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./byok-fee")>();
	return {
		...actual,
		applyByokServiceFee: vi.fn(async (args: any) => {
			const base = Number(args.pricedUsage?.pricing?.total_nanos ?? args.baseCostNanos ?? 0);
			const charged = args.isByok ? Math.round(base * actual.BYOK_SERVICE_FEE_RATE) : base;
			return {
				pricedUsage: {
					...args.pricedUsage,
					pricing: {
						...args.pricedUsage?.pricing,
						total_nanos: charged,
						...(args.isByok ? { lines: [{ dimension: "byok_fee", line_nanos: charged }] } : {}),
					},
				},
				totalNanos: charged,
				totalCents: Math.trunc(charged / 10_000_000),
				currency: "USD",
				byokFeeNanos: args.isByok ? charged : 0,
				byokMonthlyRequestCount: null,
				byokFreeRequestsRemaining: null,
				chargedCostsNanos: null,
			};
		}),
	};
});

import { applyByokServiceFeeWithToolCharges } from "./byok-tool-charges";

const CHAT_NANOS = 1_000_000;
const IMAGE_NANOS = 25_125_000;

function pricedWithTool() {
	return {
		pricing: {
			total_nanos: CHAT_NANOS + IMAGE_NANOS,
			server_tool_nanos: IMAGE_NANOS,
			lines: [{ dimension: "output_text_tokens", line_nanos: CHAT_NANOS }, { dimension: "output_image_tokens", component: "image_generation", line_nanos: IMAGE_NANOS }],
		},
	};
}

function charge(keySource: "byok" | "gateway") {
	return { component: "image_generation", model: "openai/gpt-image-2.6-flare", total_nanos: IMAGE_NANOS, key_source: keySource, lines: [{ dimension: "output_image_tokens", line_nanos: IMAGE_NANOS }] };
}

const base = { workspaceId: "team_test", idempotencyKey: "req_test", currencyHint: "USD" };

describe("applyByokServiceFeeWithToolCharges", () => {
	it("charges a managed tool image in full on a managed request", async () => {
		const result = await applyByokServiceFeeWithToolCharges({ ...base, isByok: false, baseCostNanos: CHAT_NANOS + IMAGE_NANOS, pricedUsage: pricedWithTool(), toolCharges: [charge("gateway")] });
		expect(result.totalNanos).toBe(CHAT_NANOS + IMAGE_NANOS);
	});

	it("charges only the BYOK fee for a tool image run on the customer's key", async () => {
		const result = await applyByokServiceFeeWithToolCharges({ ...base, isByok: false, baseCostNanos: CHAT_NANOS + IMAGE_NANOS, pricedUsage: pricedWithTool(), toolCharges: [charge("byok")] });
		expect(result.totalNanos).toBe(CHAT_NANOS + Math.round(IMAGE_NANOS * 0.025));
		expect(result.pricedUsage.server_tool_charges).toEqual([
			expect.objectContaining({ key_source: "byok", provider_reference_nanos: IMAGE_NANOS, charged_nanos: Math.round(IMAGE_NANOS * 0.025) }),
		]);
	});

	it("keeps a managed tool image at full cost when the request itself is BYOK", async () => {
		const result = await applyByokServiceFeeWithToolCharges({ ...base, isByok: true, baseCostNanos: CHAT_NANOS + IMAGE_NANOS, pricedUsage: pricedWithTool(), toolCharges: [charge("gateway")] });
		expect(result.totalNanos).toBe(Math.round(CHAT_NANOS * 0.025) + IMAGE_NANOS);
		expect(result.pricedUsage.pricing.lines.map((line: any) => line.dimension)).toEqual(["byok_fee", "output_image_tokens"]);
	});

	it("adds tool charges not already in the priced total", async () => {
		const result = await applyByokServiceFeeWithToolCharges({ ...base, isByok: false, baseCostNanos: CHAT_NANOS, pricedUsage: { pricing: { total_nanos: CHAT_NANOS } }, toolCharges: [charge("gateway")] });
		expect(result.totalNanos).toBe(CHAT_NANOS + IMAGE_NANOS);
	});

	it("leaves requests without tool charges to applyByokServiceFee", async () => {
		const result = await applyByokServiceFeeWithToolCharges({ ...base, isByok: true, baseCostNanos: CHAT_NANOS, pricedUsage: { pricing: { total_nanos: CHAT_NANOS } }, toolCharges: [] });
		expect(result.totalNanos).toBe(Math.round(CHAT_NANOS * 0.025));
		expect(result.pricedUsage).not.toHaveProperty("server_tool_charges");
	});
});

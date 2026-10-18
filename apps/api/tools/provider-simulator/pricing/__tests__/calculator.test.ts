// Purpose: Unit tests for the pricing sweep's independent oracle.
// Why: The sweep's findings are only as good as the oracle; its rule selection and money maths must be pinned.
// How: Small hand-built rule sets with costs worked out by hand.

import { describe, expect, it } from "vitest";
import { activeWindow, conditionHolds, expectedBill, lineNanos, parseDecimal, planChain, type CalcRule } from "../calculator";
import { solveGroup } from "../cases";

const per1M = (id: string, meter: string, price: string, extra: Partial<CalcRule> = {}): CalcRule => ({
	id, pricing_plan: "standard", meter, unit_size: 1_000_000, price_per_unit: price, ...extra,
});

const NOW = Date.parse("2026-10-18T12:00:00Z");

describe("money", () => {
	it("parses decimals and exponents exactly", () => {
		expect(parseDecimal("0.25")).toEqual({ num: 25n, den: 100n });
		expect(parseDecimal(1.25e-7)).toEqual({ num: 125n, den: 1_000_000_000n });
		expect(parseDecimal("3")).toEqual({ num: 3n, den: 1n });
	});

	it("prices pro rata by unit size and rounds half up once", () => {
		// 12,347 tokens at $3 / 1M = $0.037041 = 37,041,000 nanos
		expect(lineNanos(12_347, 1_000_000, "3")).toBe(37_041_000);
		// 1 token at $0.0000005 / token = 500 nanos; 1 token at $0.0000000015 = 1.5 nanos → 2
		expect(lineNanos(1, 1, "0.0000005")).toBe(500);
		expect(lineNanos(1, 1, "0.0000000015")).toBe(2);
		// Sub-nano precision is kept until the final rounding: 3 × 0.0000000375 = 112.5 nanos → 113
		expect(lineNanos(3, 1, "0.0000000375")).toBe(113);
		// Fractional quantities (USD-denominated meters)
		expect(lineNanos(0.0123, 1, "1")).toBe(12_300_000);
	});
});

describe("conditions", () => {
	it("evaluates numeric thresholds strictly on numbers", () => {
		expect(conditionHolds({ path: "input_tokens", op: "lte", value: 200_000 }, { input_tokens: 200_000 })).toBe(true);
		expect(conditionHolds({ path: "input_tokens", op: "gt", value: 200_000 }, { input_tokens: 200_000 })).toBe(false);
		expect(conditionHolds({ path: "image_params.quality", op: "eq", value: "high" }, { image_params: { quality: "high" } })).toBe(true);
		expect(conditionHolds({ path: "x", op: "in", value: ["a", "b"] }, { x: "b" })).toBe(true);
	});

	it("solves a group with boundary values", () => {
		const solved = solveGroup([
			{ path: "input_tokens", op: "gt", value: 128_000, or_group: 1 },
			{ path: "input_tokens", op: "lte", value: 256_000, or_group: 1 },
			{ path: "video_params.resolution", op: "in", value: ["720p", "1080p"], or_group: 1 },
		]);
		expect(solved.unsolvable).toBeUndefined();
		expect(solved.values.get("input_tokens")).toBe(256_000);
		expect(solved.values.get("video_params.resolution")).toBe("720p");
		expect(solveGroup([{ path: "input_tokens", op: "gt", value: 200_000 }]).values.get("input_tokens")).toBe(200_001);
	});
});

describe("rule selection", () => {
	const longContext: CalcRule[] = [
		per1M("in-base", "input_text_tokens", "3", { match: [{ path: "input_tokens", op: "lte", value: 200_000 }] }),
		per1M("in-long", "input_text_tokens", "6", { match: [{ path: "input_tokens", op: "gt", value: 200_000 }] }),
		per1M("out", "output_text_tokens", "15"),
	];

	it("picks the long-context tier from the prompt length", () => {
		const bill = expectedBill({ rules: longContext, usage: { input_text_tokens: 200_001, input_tokens: 200_001, output_text_tokens: 1_000 }, context: {}, plan: "standard", timestampMs: NOW });
		expect(bill.lines.find((l) => l.meter === "input_text_tokens")?.ruleId).toBe("in-long");
		expect(bill.nanos).toBe(lineNanos(200_001, 1_000_000, "6") + lineNanos(1_000, 1_000_000, "15"));
	});

	it("prefers the more specific matching rule over an unconditional one", () => {
		const rules = [per1M("base", "output_image", "0.04"), per1M("hd", "output_image", "0.08", { match: [{ path: "image_params.quality", op: "eq", value: "high" }] })];
		rules.forEach((r) => (r.unit_size = 1));
		const bill = expectedBill({ rules, usage: { output_image: 2 }, context: { image_params: { quality: "high" } }, plan: "standard", timestampMs: NOW });
		expect(bill.nanos).toBe(160_000_000);
	});

	it("falls back to standard for meters the requested tier does not price", () => {
		const rules = [
			per1M("in", "input_text_tokens", "2"),
			per1M("read", "cached_read_text_tokens", "0.2"),
			per1M("in-p", "input_text_tokens", "4", { pricing_plan: "priority" }),
		];
		const bill = expectedBill({ rules, usage: { input_text_tokens: 1_000_000, cached_read_text_tokens: 1_000_000 }, context: {}, plan: "fast", timestampMs: NOW });
		expect(bill.lines.map((l) => l.ruleId)).toEqual(["read", "in-p"]);
		expect(bill.nanos).toBe(4_200_000_000);
	});

	it("treats a provider SKU label as standard when the card has no standard rules", () => {
		expect(planChain([per1M("a", "input_text_tokens", "1", { pricing_plan: "default" })], "standard")).toEqual(["default"]);
		expect(planChain([per1M("a", "input_text_tokens", "1"), per1M("b", "input_text_tokens", "2", { pricing_plan: "fast" })], "priority")).toEqual(["fast", "standard"]);
	});
});

describe("fallbacks", () => {
	it("bills a cache read with no cache price at the input price", () => {
		const bill = expectedBill({ rules: [per1M("in", "input_text_tokens", "1")], usage: { input_text_tokens: 1_000, cached_read_text_tokens: 500 }, context: {}, plan: "standard", timestampMs: NOW });
		expect(bill.nanos).toBe(1_500_000);
		expect(bill.lines.find((l) => l.meter === "cached_read_text_tokens")?.source?.kind).toBe("gateway-docs");
	});

	it("bills reasoning at the output price when it has no price of its own", () => {
		const bill = expectedBill({ rules: [per1M("out", "output_text_tokens", "10")], usage: { output_text_tokens: 400, output_reasoning_tokens: 100 }, context: {}, plan: "standard", timestampMs: NOW });
		expect(bill.nanos).toBe(5_000_000);
	});

	it("prices a write without a TTL split at the requested TTL", () => {
		const rules = [per1M("w5", "cached_write_text_tokens_5m", "3.75"), per1M("w1", "cached_write_text_tokens_1h", "6")];
		const oneHour = expectedBill({ rules, usage: { cached_write_text_tokens: 1_000_000 }, context: { cache_ttl: "1h" }, plan: "standard", timestampMs: NOW });
		const fiveMinutes = expectedBill({ rules, usage: { cached_write_text_tokens: 1_000_000 }, context: {}, plan: "standard", timestampMs: NOW });
		expect(oneHour.nanos).toBe(6_000_000_000);
		expect(fiveMinutes.nanos).toBe(3_750_000_000);
	});
});

describe("time windows and included quantities", () => {
	const rule = per1M("in", "input_text_tokens", "0.28", {
		time_windows: [{ label: "peak", timezone: "UTC", start_time: "01:00", end_time: "04:00", price_per_unit: 0.44 }],
	});

	it("uses the window price inside the window only", () => {
		expect(activeWindow(rule, Date.parse("2026-10-18T02:30:00Z"))?.label).toBe("peak");
		expect(activeWindow(rule, Date.parse("2026-10-18T04:00:00Z"))).toBeNull();
		const peak = expectedBill({ rules: [rule], usage: { input_text_tokens: 1_000_000 }, context: {}, plan: "standard", timestampMs: Date.parse("2026-10-18T02:30:00Z") });
		expect(peak.nanos).toBe(440_000_000);
		expect(peak.lines[0].window).toBe("peak");
	});

	it("bills only the quantity above the included amount", () => {
		const seconds: CalcRule = { id: "s", pricing_plan: "standard", meter: "output_video_seconds", unit_size: 1, price_per_unit: "0.1", included_quantity: 5 };
		expect(expectedBill({ rules: [seconds], usage: { output_video_seconds: 7 }, context: {}, plan: "standard", timestampMs: NOW }).nanos).toBe(200_000_000);
	});
});

describe("provider-specific output pricing", () => {
	it("bills the answer at the thinking-mode price when the provider says the price covers both", () => {
		const rules = [per1M("out", "output_text_tokens", "0.7"), per1M("think", "output_reasoning_tokens", "2.1")];
		const usage = { output_text_tokens: 1_000_000, output_reasoning_tokens: 1_000_000 };
		const plain = expectedBill({ rules, usage, context: {}, plan: "standard", timestampMs: NOW });
		const thinking = expectedBill({ rules, usage, context: {}, plan: "standard", timestampMs: NOW, thinkingModeBillsAnswer: { kind: "assumed", reason: "test" } });
		expect(plain.nanos).toBe(2_800_000_000);
		expect(thinking.nanos).toBe(4_200_000_000);
	});
});

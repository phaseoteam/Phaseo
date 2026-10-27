// Purpose: Fast-mode Claude responses are billed on the priority plan on every path.
// Why: Anthropic reports `usage.speed: "fast"` next to `usage.service_tier: "standard"`
//      (https://platform.claude.com/docs/en/build-with-claude/fast-mode), and the observed
//      `standard` tier won, so fast requests were billed at standard rates.
// How: Build usage the way the buffered and streamed paths do, then price it.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return { ...actual, getBindings: () => ({}) as any };
});

import { anthropicMessagesToIR, anthropicUsageForPricing } from "../index";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { ANTHROPIC_CACHE_USAGE_SEMANTICS } from "../stream-transformer";
import { calculatePricing } from "@pipeline/after/pricing";
import type { PriceCard } from "@pipeline/pricing/types";

const rule = (plan: string, meter: string, price: string) => ({
	pricing_plan: plan, meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100,
});

const CARD: PriceCard = {
	provider: "anthropic",
	model: "anthropic/claude-opus-5.5",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		rule("standard", "input_text_tokens", "4"),
		rule("standard", "output_text_tokens", "20"),
		rule("priority", "input_text_tokens", "8"),
		rule("priority", "output_text_tokens", "40"),
	],
} as PriceCard;

const FAST_USAGE = { input_tokens: 1_000_000, output_tokens: 1_000_000, service_tier: "standard", speed: "fast" };

const totalUsd = (usage: Record<string, unknown>) =>
	calculatePricing(usage, CARD, { speed: "fast" }).pricedUsage.pricing.lines
		.reduce((sum: number, line: any) => sum + Number(line.line_nanos), 0) / 1e9;

describe("Claude fast-mode billing", () => {
	it("bills a streamed fast response at the fast price", () => {
		const meters = anthropicUsageForPricing(FAST_USAGE)!;
		expect(meters.service_tier).toBe("priority");
		expect(totalUsd(meters)).toBe(48);
	});

	it("bills a buffered fast response at the fast price", () => {
		const ir = anthropicMessagesToIR({ id: "msg_1", content: [{ type: "text", text: "ok" }], usage: FAST_USAGE }, "req_1", "claude-opus-5-5", "anthropic");
		const meters = normalizeTextUsageForPricing(ir.usage, ANTHROPIC_CACHE_USAGE_SEMANTICS)!;
		expect(totalUsd(meters)).toBe(48);
	});

	it("prices US-only inference from usage.inference_geo on both paths", () => {
		// The 1.1x uplift is a price row matching inference_geo
		// (https://platform.claude.com/docs/en/manage-claude/data-residency).
		const geoCard = {
			...CARD,
			rules: [
				...CARD.rules,
				{ ...rule("standard", "input_text_tokens", "4.4"), match: [{ path: "inference_geo", op: "eq", value: "us" }] },
				{ ...rule("standard", "output_text_tokens", "22"), match: [{ path: "inference_geo", op: "eq", value: "us" }] },
			],
		} as PriceCard;
		const usd = (usage: Record<string, unknown>) =>
			calculatePricing(usage, geoCard, {}).pricedUsage.pricing.lines
				.reduce((sum: number, line: any) => sum + Number(line.line_nanos), 0) / 1e9;
		const usUsage = { input_tokens: 1_000_000, output_tokens: 1_000_000, inference_geo: "us" };
		expect(usd(anthropicUsageForPricing(usUsage)!)).toBeCloseTo(26.4, 9);
		const ir = anthropicMessagesToIR({ id: "msg_1", content: [{ type: "text", text: "ok" }], usage: usUsage }, "req_1", "claude-opus-5-5", "anthropic");
		expect(usd(normalizeTextUsageForPricing(ir.usage, ANTHROPIC_CACHE_USAGE_SEMANTICS)!)).toBeCloseTo(26.4, 9);
		expect(usd(anthropicUsageForPricing({ ...usUsage, inference_geo: "global" })!)).toBe(24);
	});

	it("keeps a standard-speed response at the standard price", () => {
		const meters = anthropicUsageForPricing({ ...FAST_USAGE, speed: "standard" })!;
		expect(totalUsd(meters)).toBe(24);
	});
});

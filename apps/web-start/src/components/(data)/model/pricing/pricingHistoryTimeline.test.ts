import {
	getPricingHistoryTimestamps,
	pricingHistoryToCsv,
} from "./pricingHistoryTimeline";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";

function rule(overrides: Partial<ModelPricingHistoryRule>): ModelPricingHistoryRule {
	return {
		ruleId: "rule",
		providerId: "openai",
		providerName: "OpenAI",
		modelKey: "openai:model:responses",
		pricingPlan: "standard",
		meter: "input_text_tokens",
		unit: "token",
		unitSize: 1_000_000,
		pricePerUnit: 1,
		pricePer1MUnits: 1,
		currency: "USD",
		priority: 100,
		effectiveFrom: null,
		effectiveTo: null,
		note: null,
		match: [],
		timeWindows: [],
		...overrides,
	};
}

describe("pricing history timeline", () => {
	it("preserves multiple price boundaries on the same day", () => {
		const firstChange = "2026-08-10T09:15:00.000Z";
		const secondChange = "2026-08-10T16:45:00.000Z";
		const timestamps = getPricingHistoryTimestamps({
			range: "7d",
			rules: [
				rule({ effectiveFrom: firstChange, effectiveTo: secondChange }),
				rule({ ruleId: "rule-2", effectiveFrom: secondChange }),
			],
			usageDays: [],
			nowMs: Date.parse("2026-08-10T20:00:00.000Z"),
		});

		expect(timestamps).toContain(Date.parse(firstChange));
		expect(timestamps).toContain(Date.parse(secondChange));
	});

	it("includes recurring UTC schedule changes in the one-week view", () => {
		const timestamps = getPricingHistoryTimestamps({
			range: "7d",
			rules: [rule({
				timeWindows: [{
					label: "off peak",
					timezone: "UTC",
					start_time: "00:00",
					end_time: "16:30",
					price_per_unit: "0.5",
				}],
			})],
			usageDays: [],
			nowMs: Date.parse("2026-08-10T20:00:00.000Z"),
		});

		expect(timestamps).toContain(Date.parse("2026-08-10T16:30:00.000Z"));
	});

	it("clips timestamps to a custom date range", () => {
		const customStartMs = Date.parse("2026-07-01T00:00:00.000Z");
		const customEndMs = Date.parse("2026-07-31T23:59:59.999Z");
		const timestamps = getPricingHistoryTimestamps({
			range: "all",
			rules: [
				rule({ effectiveFrom: "2026-06-15T00:00:00.000Z" }),
				rule({ ruleId: "july", effectiveFrom: "2026-07-15T12:00:00.000Z" }),
				rule({ ruleId: "august", effectiveFrom: "2026-08-01T00:00:00.000Z" }),
			],
			usageDays: [],
			nowMs: Date.parse("2026-08-10T20:00:00.000Z"),
			customStartMs,
			customEndMs,
		});

		expect(timestamps[0]).toBe(customStartMs);
		expect(timestamps.at(-1)).toBe(customEndMs);
		expect(timestamps).toContain(Date.parse("2026-07-15T12:00:00.000Z"));
		expect(timestamps).not.toContain(Date.parse("2026-08-01T00:00:00.000Z"));
	});

	it("exports UTC timestamps first and one column per provider", () => {
		const csv = pricingHistoryToCsv({
			points: [
				{
					timestamp: "2026-08-10T09:15:00.000Z",
					openai: 1.25,
					anthropic: 3,
				},
			],
			series: [
				{ key: "openai", providerName: "OpenAI" },
				{ key: "anthropic", providerName: "Anthropic" },
			],
		});

		expect(csv).toBe(
			'"timestamp_utc","OpenAI","Anthropic"\n"2026-08-10T09:15:00.000Z","1.25","3"',
		);
	});
});

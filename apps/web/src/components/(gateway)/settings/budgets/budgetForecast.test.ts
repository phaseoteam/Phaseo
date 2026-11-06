import { describe, test, expect } from "vitest";
import type { SettingsWorkspaceBudget } from "@/lib/fetchers/internal/settingsTypes";
import { budgetPercentFraction, budgetProjection, budgetSlots, budgetTone } from "./budgetForecast";
import { parseBudgetInterval, parseBudgetLimitUsd } from "./workspaceBudgets";

const at = (iso: string) => Date.parse(iso);

function budget(overrides: Partial<SettingsWorkspaceBudget> = {}): SettingsWorkspaceBudget {
	const limit = overrides.limit_usd ?? 100;
	const usage = overrides.usage_usd ?? 10;
	return {
		id: "b1", interval: "monthly", limit_usd: limit, limit_nanos: limit * 1e9, usage_usd: usage, usage_nanos: usage * 1e9,
		remaining_nanos: Math.max(limit - usage, 0) * 1e9, percent_used: (usage / limit) * 100, exceeded: usage >= limit,
		window_start: null, reset_at: null, created_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
		...overrides,
	};
}

describe("budgetSlots", () => {
	test("gives one slot per interval, shortest first, whatever order the budgets come in", () => {
		const monthly = budget({ id: "m", interval: "monthly" });
		const daily = budget({ id: "d", interval: "daily" });
		expect(budgetSlots([monthly, daily])).toEqual([
			{ interval: "daily", budget: daily },
			{ interval: "weekly", budget: null },
			{ interval: "monthly", budget: monthly },
			{ interval: "lifetime", budget: null },
		]);
	});
});

describe("budgetProjection", () => {
	test("projects the UTC month straight-line from the pace so far", () => {
		// 10 of 31 days gone at $40 → $124 by 1 Nov, reaching the $100 limit on 26 Oct.
		const forecast = budgetProjection(budget({ usage_usd: 40 }), at("2026-10-11T00:00:00Z"));
		expect(forecast?.projected).toBeCloseTo(124, 5);
		expect(new Date(forecast!.reachesLimitAt!).toISOString()).toBe("2026-10-26T00:00:00.000Z");
	});

	test("uses the UTC day and the Monday week", () => {
		const daily = budgetProjection(budget({ interval: "daily", usage_usd: 5, limit_usd: 20 }), at("2026-10-21T06:00:00Z"));
		expect(daily?.projected).toBeCloseTo(20, 5);
		expect(daily?.reachesLimitAt).toBeNull();
		// Wednesday noon: 2.5 of 7 days since Monday.
		const weekly = budgetProjection(budget({ interval: "weekly", usage_usd: 25, limit_usd: 50 }), at("2026-10-21T12:00:00Z"));
		expect(weekly?.projected).toBeCloseTo(70, 5);
	});

	test("shows nothing for lifetime budgets, used-up budgets, early windows or no spend", () => {
		expect(budgetProjection(budget({ interval: "lifetime" }), at("2026-10-21T12:00:00Z"))).toBeNull();
		expect(budgetProjection(budget({ usage_usd: 100 }), at("2026-10-21T12:00:00Z"))).toBeNull();
		expect(budgetProjection(budget({ interval: "daily" }), at("2026-10-21T01:00:00Z"))).toBeNull();
		expect(budgetProjection(budget({ usage_usd: 0 }), at("2026-10-21T12:00:00Z"))).toBeNull();
	});
});

describe("budgetPercentFraction and budgetTone", () => {
	test("keeps a decimal for small shares only", () => {
		expect(budgetPercentFraction({ percent_used: 4.25 })).toEqual({ fraction: 0.0425, digits: 1 });
		expect(budgetPercentFraction({ percent_used: 80 })).toEqual({ fraction: 0.8, digits: 0 });
		expect(budgetPercentFraction({ percent_used: 0 })).toEqual({ fraction: 0, digits: 0 });
	});

	test("warns from 80% and flags used-up budgets", () => {
		expect(budgetTone({ percent_used: 79.9, exceeded: false })).toBe("ok");
		expect(budgetTone({ percent_used: 80, exceeded: false })).toBe("warning");
		expect(budgetTone({ percent_used: 100, exceeded: true })).toBe("exceeded");
	});
});

describe("shared budget validation", () => {
	test("accepts what the control API accepts", () => {
		expect(parseBudgetInterval(" Weekly ")).toBe("weekly");
		expect(parseBudgetInterval("hourly")).toBeNull();
		expect(parseBudgetLimitUsd("12.50")).toBe(12.5);
		expect(parseBudgetLimitUsd(0.000000001)).toBe(0.000000001);
	});

	test("rejects empty, zero, negative, non-numeric and oversized limits", () => {
		for (const value of ["", "  ", null, undefined, 0, -1, "abc", true, Number.NaN, 1e12, 0.0000000001]) {
			expect(parseBudgetLimitUsd(value)).toBeNull();
		}
	});
});

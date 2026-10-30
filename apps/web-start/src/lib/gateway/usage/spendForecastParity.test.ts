import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { FORECAST_MIN_ELAPSED_HOURS } from "@/components/(gateway)/settings/spend-rules/spendRules";

import { MIN_ELAPSED_MS, forecastCalendarWindow, forecastLimitWindow, utcLimitWindow, type LimitWindow } from "./limitForecast";
import { forecastMonthSpend } from "./monthSpendForecast";
import { resolvePreviousUsageTimeRange, type UsageRangePreset } from "./timeRange";

/**
 * Spend rule forecasts are computed in SQL (`private.spend_rule_values`) and
 * must match the dashboard's. Both this test and
 * `supabase/tests/spend-rules-forecast.test.mjs` check the shared fixture's
 * expected values, so the SQL and these helpers agree.
 */
type ForecastCase = {
	name: string;
	period: LimitWindow;
	timeZone: string;
	now: string;
	start: string;
	end: string;
	usage: Array<{ at: string; nanos: number }>;
	limitNanos: number;
	expected: { usedNanos: number; forecastFrom: string; ready: boolean; projectedNanos: number | null; reachesLimitAt: string | null };
};
type PreviousCase = {
	name: string;
	period: LimitWindow;
	preset: UsageRangePreset;
	timeZone: string;
	now: string;
	start: string;
	expected: { from: string; to: string };
};

const fixture = JSON.parse(readFileSync(path.join(__dirname, "__fixtures__", "spend-forecast-parity.json"), "utf8")) as {
	forecast: ForecastCase[];
	previous: PreviousCase[];
};
const at = (iso: string) => Date.parse(iso);

describe("spend rule forecast parity", () => {
	test("waits as long as the key limit forecast before projecting", () => {
		for (const window of ["day", "week", "month"] as const) {
			expect(FORECAST_MIN_ELAPSED_HOURS[window] * 3_600_000).toBe(MIN_ELAPSED_MS[window]);
		}
	});

	test.each(fixture.forecast.map((item) => [item.name, item] as const))("%s", (_name, item) => {
		const start = at(item.start);
		const end = at(item.end);
		const now = at(item.now);
		const used = item.usage.filter((usage) => at(usage.at) >= start && at(usage.at) < now).reduce((sum, usage) => sum + usage.nanos, 0);
		expect(used).toBe(item.expected.usedNanos);
		expect(new Date(start + MIN_ELAPSED_MS[item.period]).toISOString()).toBe(item.expected.forecastFrom);

		const forecast = forecastCalendarWindow({ window: item.period, start, end, used, limit: item.limitNanos, now });
		expect(forecast !== null).toBe(item.expected.ready);
		expect(forecast === null ? null : Math.round(forecast.projected)).toBe(item.expected.projectedNanos);
		expect(forecast?.reachesLimitAt == null ? null : new Date(forecast.reachesLimitAt).toISOString()).toBe(item.expected.reachesLimitAt);

		if (item.timeZone === "UTC") {
			// In UTC the rule's period is the key limit window, and the forecast is the key page's.
			expect(utcLimitWindow(item.period, now)).toEqual({ start, end });
			expect(forecastLimitWindow({ window: item.period, used, limit: item.limitNanos, now })).toEqual(forecast);
			if (item.period === "month" && used > 0) {
				// The usage overview's month forecast projects the same total from daily rollups.
				const days = new Map<string, number>();
				for (const usage of item.usage) days.set(usage.at.slice(0, 10), (days.get(usage.at.slice(0, 10)) ?? 0) + usage.nanos);
				const month = forecastMonthSpend({ days: [...days].map(([date, costNanos]) => ({ date, costNanos })), observedAt: now });
				expect(month === null ? null : month.midNanos).toBe(item.expected.projectedNanos);
			}
		}
	});
});

/**
 * The dashboard compares on the reader's local clock, so the comparison runs
 * in a Node process whose local zone is the rule's (Jest's sandbox ignores a
 * changed TZ). Node strips the types from timeRange.ts, which imports nothing.
 */
function previousRangeIn(timeZone: string, args: { preset: UsageRangePreset; from: string; to: string }) {
	const script = [
		"process.env.TZ = process.argv[1];",
		"const { resolvePreviousUsageTimeRange } = await import(process.argv[2]);",
		"const range = resolvePreviousUsageTimeRange(JSON.parse(process.argv[3]));",
		"process.stdout.write(JSON.stringify({ range, offset: new Date(JSON.parse(process.argv[3]).to).getTimezoneOffset() }));",
	].join("\n");
	const output = execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", script, timeZone, pathToFileURL(path.join(__dirname, "timeRange.ts")).href, JSON.stringify(args)], { encoding: "utf8" });
	return JSON.parse(output) as { range: { from: string; to: string }; offset: number };
}

describe("previous period parity", () => {
	test.each(fixture.previous.map((item) => [item.name, item] as const))("%s", (_name, item) => {
		const { range, offset } = previousRangeIn(item.timeZone, { preset: item.preset, from: item.start, to: item.now });
		// The child really ran in the rule's zone.
		const zoneOffset = 0 - Math.round((Date.parse(new Date(at(item.now)).toLocaleString("sv-SE", { timeZone: item.timeZone }).replace(" ", "T") + "Z") - at(item.now)) / 60_000);
		expect(offset).toBe(zoneOffset);
		expect(range).toEqual(item.expected);
	});

	test("the in-process helper agrees for UTC readers", () => {
		const item = fixture.previous.find((entry) => entry.timeZone === "UTC");
		if (!item || new Date(at(item.now)).getTimezoneOffset() !== 0) return;
		expect(resolvePreviousUsageTimeRange({ preset: item.preset, from: item.start, to: item.now })).toEqual(item.expected);
	});
});

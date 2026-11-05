import { describe, expect, it, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "@/i18n/react";
import {
	buildProviderHealthChartData,
	summarizeProviderHealth,
	summaryFailureShares,
} from "./ModelProviderHealthChart";
import { attemptFailureShares, formatFailureShare } from "./attemptFunnel";

describe("attempt failure shares", () => {
	test("derives each step's failure share from its rate alone", () => {
		const shares = attemptFailureShares({ reachabilityPct: 99.41, capacityPct: 98.52, callErrorPct: 100 });
		expect(shares.reachability).toEqual({ kind: "failed", pct: expect.closeTo(0.59, 10) });
		expect(shares.capacity).toEqual({ kind: "failed", pct: expect.closeTo(1.48, 10) });
		expect(shares.callErrors).toEqual({ kind: "none" });
	});

	test("says nothing failed when there were no attempts, and nothing was measured when no attempt got that far", () => {
		expect(attemptFailureShares({ reachabilityPct: null, capacityPct: null, callErrorPct: null })).toEqual({
			reachability: { kind: "none" },
			capacity: { kind: "none" },
			callErrors: { kind: "none" },
		});
		// None reached the provider, so whether it would have accepted them is unknown.
		expect(attemptFailureShares({ reachabilityPct: 0, capacityPct: null, callErrorPct: null })).toEqual({
			reachability: { kind: "failed", pct: 100 },
			capacity: { kind: "unmeasured" },
			callErrors: { kind: "unmeasured" },
		});
	});

	test("formats shares so a small failure never reads as none", () => {
		expect(formatFailureShare(0.6, "en-GB")).toBe("0.6%");
		expect(formatFailureShare(0.01, "en-GB")).toBe("<0.1%");
		expect(formatFailureShare(12.345, "en-GB")).toBe("12.3%");
	});

	type Locale = Parameters<typeof createTranslator>[0]["locale"];
	const translator = (locale: string) => createTranslator({
		locale: locale as Locale,
		messages: { Catalogue: JSON.parse(readFileSync(path.resolve(process.cwd(), "messages", locale, "catalogue.json"), "utf8")) },
		namespace: "Catalogue.modelDetail.uptime",
	});

	test("reads naturally in the model page copy, with percentages only", () => {
		const t = translator("en-GB");
		expect([t("reachabilityLabel"), t("capacityLabel"), t("callErrorsLabel")]).toEqual(["Reachable", "Accepted", "Completed"]);
		expect(t("reachabilityFailureShare", { percent: "0.6%" })).toBe("0.6% of attempts couldn't reach the provider");
		expect(t("capacityFailureShare", { percent: "1.5%" })).toBe("1.5% of attempts that reached the provider were turned away because it was at capacity");
		expect(t("callErrorsFailureShare", { percent: "0.3%" })).toBe("0.3% of accepted attempts failed after the provider accepted them");
		expect(t("noFailuresThisHour")).toBe("No failures this hour");
		expect(t("noFailures")).toBe("No failures");
		expect(t("capacityUnmeasured")).toBe("No attempts reached the provider");
		expect(t("callErrorsUnmeasured")).toBe("No attempts were accepted");
	});

	test("every locale has the percentage copy and none of the count copy", () => {
		const locales = readdirSync(path.resolve(process.cwd(), "messages"))
			.filter((entry) => existsSync(path.resolve(process.cwd(), "messages", entry, "catalogue.json")));
		expect(locales.length).toBe(9);
		for (const locale of locales) {
			const t = translator(locale);
			const percent = formatFailureShare(0.6, locale);
			for (const key of ["reachabilityFailureShare", "capacityFailureShare", "callErrorsFailureShare"] as const) {
				expect(t(key, { percent })).toContain(percent);
			}
			const uptime = JSON.parse(readFileSync(path.resolve(process.cwd(), "messages", locale, "catalogue.json"), "utf8")).modelDetail.uptime;
			// Count copy, and the copy of the request-level uptime chart the three metrics replaced.
			for (const removed of [
				"reachabilityCount", "capacityCount", "callErrorsCount", "tooltipFailedRequests", "requestsObserved", "chartLabel",
				"title", "leastStableProviderLabel", "tooltipUptime", "failedShareRequests", "tooltipWorstProvider",
				"hourlyAverage", "routingChartLabel", "routingComparison", "routingLabel",
			]) {
				expect(uptime).not.toHaveProperty(removed);
			}
			// No message in the uptime section takes a count any more.
			expect(JSON.stringify(uptime)).not.toMatch(/\{count\b|\{failed\b/);
		}
	});
});

const now = new Date("2026-08-30T10:42:00.000Z");

describe("provider health chart data", () => {
	const allAt100 = (points: ReturnType<typeof buildProviderHealthChartData>) =>
		points.every((point) => point.reachability === 100 && point.capacity === 100 && point.callErrors === 100);

	test("an empty series (no traffic in 24 hours) shows all three metrics at 100% with no failures", () => {
		const points = buildProviderHealthChartData([], now);
		expect(points).toHaveLength(24);
		expect(points[0]).toMatchObject({ time: "11:00", bucket: "2026-08-29T11:00:00.000Z" });
		expect(points.at(-1)).toMatchObject({ time: "10:00", bucket: "2026-08-30T10:00:00.000Z" });
		expect(allAt100(points)).toBe(true);
		const summary = summarizeProviderHealth(points);
		expect(summary).toEqual({ reachability: { averagePct: 100 }, capacity: { averagePct: 100 }, callErrors: { averagePct: 100 } });
		const noFailures = { reachability: { kind: "none" }, capacity: { kind: "none" }, callErrors: { kind: "none" } };
		// Headline tooltips read "No failures" with or without web-api's 24-hour totals.
		expect(summaryFailureShares(summary)).toEqual(noFailures);
		expect(summaryFailureShares(summary, null)).toEqual(noFailures);
		expect(summaryFailureShares(summary, { reachabilityPct: null, capacityPct: null, callErrorPct: null })).toEqual(noFailures);
	});

	test("a series without attempt rates (none published) shows 100%, not the request-level uptime", () => {
		const points = buildProviderHealthChartData([
			{ bucket: "2026-08-30T09:00:00Z", overallSuccessPct: 50, worstProviderSuccessPct: 25, worstProviderRequests: 4, providerCount: 2, requests: 8 },
			{ bucket: "2026-08-30T10:00:00Z", overallSuccessPct: null, worstProviderSuccessPct: null, requests: 0 },
		], now);
		expect(points).toHaveLength(24);
		expect(allAt100(points)).toBe(true);
		const summary = summarizeProviderHealth(points);
		expect(summary.reachability.averagePct).toBe(100);
		expect(summaryFailureShares(summary)).toEqual({ reachability: { kind: "none" }, capacity: { kind: "none" }, callErrors: { kind: "none" } });
	});

	test("shows hours without eligible attempts as 100%", () => {
		const points = buildProviderHealthChartData([
			// Only customer-caused attempts this hour: nothing to rate.
			{ bucket: "2026-08-30T10:00:00Z", overallSuccessPct: null, worstProviderSuccessPct: null, requests: 2, reachabilityPct: null, capacityPct: null, callErrorPct: null },
		], now);
		expect(points).toHaveLength(24);
		expect(points.every((point) => point.reachability === 100 && point.capacity === 100 && point.callErrors === 100)).toBe(true);
	});

	test("leaves a step empty when no attempt reached it", () => {
		const points = buildProviderHealthChartData([
			{ bucket: "2026-08-30T10:00:00Z", overallSuccessPct: 0, worstProviderSuccessPct: 0, requests: 2, reachabilityPct: 0, capacityPct: null, callErrorPct: null },
		], now);
		expect(points.at(-1)).toMatchObject({ reachability: 0, capacity: null, callErrors: null });
	});

	test("places each metric's rate in the matching hour, without counts", () => {
		const points = buildProviderHealthChartData([
			{
				bucket: "2026-08-30T09:27:00Z",
				overallSuccessPct: 100,
				worstProviderSuccessPct: 100,
				requests: 340,
				reachabilityPct: 99.41,
				capacityPct: 95,
				callErrorPct: 100,
			},
		], now);
		expect(points.at(-2)).toEqual({
			time: "09:00",
			bucket: "2026-08-30T09:00:00.000Z",
			rates: { reachabilityPct: 99.41, capacityPct: 95, callErrorPct: 100 },
			reachability: 99.41,
			capacity: 95,
			callErrors: 100,
		});
		const summary = summarizeProviderHealth(points);
		// Hourly average over 24 hours, empty hours at 100%.
		expect(summary.capacity.averagePct).toBeCloseTo((23 * 100 + 95) / 24, 6);
		expect(summary.callErrors.averagePct).toBe(100);
		// Without web-api's 24-hour totals, the averages are used.
		const shares = summaryFailureShares(summary);
		expect(shares.capacity).toEqual({ kind: "failed", pct: expect.closeTo(5 / 24, 6) });
		expect(shares.callErrors).toEqual({ kind: "none" });
		// With them, the tooltip says what share of all attempts failed: all of this
		// hour's attempts were the day's attempts, so 5% of them were turned away.
		const totals = summaryFailureShares(summary, { reachabilityPct: 99.41, capacityPct: 95, callErrorPct: 100 });
		expect(totals.reachability).toEqual({ kind: "failed", pct: expect.closeTo(0.59, 6) });
		expect(totals.capacity).toEqual({ kind: "failed", pct: expect.closeTo(5, 6) });
		expect(totals.callErrors).toEqual({ kind: "none" });
	});

	it("uses the 24-hour totals even when every attempt failed in one hour", () => {
		const summary = summarizeProviderHealth([]);
		const shares = summaryFailureShares(summary, { reachabilityPct: 0, capacityPct: null, callErrorPct: null });
		expect(shares.reachability).toEqual({ kind: "failed", pct: 100 });
		expect(shares.capacity).toEqual({ kind: "unmeasured" });
		expect(shares.callErrors).toEqual({ kind: "unmeasured" });
	});
});

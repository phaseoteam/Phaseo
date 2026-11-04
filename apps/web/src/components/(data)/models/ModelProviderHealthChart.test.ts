import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import {
	buildProviderHealthChartData,
	hasProviderAttemptHealth,
	summarizeProviderHealth,
} from "./ModelProviderHealthChart";
import { attemptFunnel } from "./attemptFunnel";

describe("attempt funnel", () => {
	test("counts each step's failures out of the attempts that passed the step before", () => {
		expect(attemptFunnel({ eligibleAttempts: 340, reachabilityFailures: 2, capacityFailures: 5, callErrorFailures: 1 })).toEqual({
			reachability: { failed: 2, of: 340 },
			capacity: { failed: 5, of: 338 },
			callErrors: { failed: 1, of: 333 },
		});
		expect(attemptFunnel({ eligibleAttempts: 0, reachabilityFailures: 0, capacityFailures: 0, callErrorFailures: 0 }).callErrors).toEqual({ failed: 0, of: 0 });
	});

	type Locale = Parameters<typeof createTranslator>[0]["locale"];
	const translator = (locale: string) => createTranslator({
		locale: locale as Locale,
		messages: { Catalogue: JSON.parse(readFileSync(path.resolve(process.cwd(), "messages", locale, "catalogue.json"), "utf8")) },
		namespace: "Catalogue.modelDetail.uptime",
	});

	test("reads naturally in the model page copy", () => {
		const t = translator("en-GB");
		expect([t("reachabilityLabel"), t("capacityLabel"), t("callErrorsLabel")]).toEqual(["Reachable", "Accepted", "Completed"]);
		expect(t("reachabilityCount", { failed: 2, count: 340 })).toBe("2 of 340 attempts couldn't reach the provider");
		expect(t("capacityCount", { failed: 5, count: 338 })).toBe("5 of 338 were turned away because the provider was at capacity");
		expect(t("capacityCount", { failed: 1, count: 338 })).toBe("1 of 338 was turned away because the provider was at capacity");
		expect(t("callErrorsCount", { failed: 1, count: 333 })).toBe("1 of 333 failed after the provider accepted it");
		expect(t("callErrorsCount", { failed: 3, count: 333 })).toBe("3 of 333 failed after the provider accepted them");
		expect(t("callErrorsCount", { failed: 0, count: 0 })).toBe("No attempts were accepted");
	});

	test("formats the counts in every locale", () => {
		const locales = readdirSync(path.resolve(process.cwd(), "messages"))
			.filter((entry) => existsSync(path.resolve(process.cwd(), "messages", entry, "catalogue.json")));
		expect(locales.length).toBe(9);
		for (const locale of locales) {
			const t = translator(locale);
			for (const key of ["reachabilityCount", "capacityCount", "callErrorsCount"] as const) {
				const text = t(key, { failed: 5, count: 338 });
				// Numbers use the locale's digits (Arabic-Indic in ar-SA).
				const number = new Intl.NumberFormat(locale);
				expect(text).toContain(number.format(5));
				expect(text).toContain(number.format(338));
			}
		}
	});
});

const now = new Date("2026-08-30T10:42:00.000Z");

describe("provider health chart data", () => {
	test("uses attempt health only when the data API sends it", () => {
		expect(hasProviderAttemptHealth([{ bucket: "2026-08-30T09:00:00Z", overallSuccessPct: 100, worstProviderSuccessPct: 100, requests: 3 }])).toBe(false);
		expect(hasProviderAttemptHealth([{ bucket: "2026-08-30T09:00:00Z", overallSuccessPct: 100, worstProviderSuccessPct: 100, requests: 3, eligibleAttempts: 0 }])).toBe(true);
	});

	test("shows hours without eligible attempts as 100%", () => {
		const points = buildProviderHealthChartData([
			// Only customer-caused attempts this hour: nothing to rate.
			{ bucket: "2026-08-30T10:00:00Z", overallSuccessPct: null, worstProviderSuccessPct: null, requests: 2, eligibleAttempts: 0, reachabilityPct: null, capacityPct: null, callErrorPct: null },
		], now);
		expect(points).toHaveLength(24);
		expect(points.every((point) => point.reachability === 100 && point.capacity === 100 && point.callErrors === 100)).toBe(true);
	});

	test("places each metric and its failures in the matching hour", () => {
		const points = buildProviderHealthChartData([
			{
				bucket: "2026-08-30T09:27:00Z",
				overallSuccessPct: 100,
				worstProviderSuccessPct: 100,
				requests: 340,
				eligibleAttempts: 340,
				reachabilityFailures: 2,
				capacityFailures: 17,
				callErrorFailures: 0,
				reachabilityPct: 99.41,
				capacityPct: 95,
				callErrorPct: 100,
			},
		], now);
		expect(points.at(-2)).toMatchObject({
			time: "09:00",
			eligibleAttempts: 340,
			reachability: 99.41,
			capacity: 95,
			callErrors: 100,
			reachabilityFailures: 2,
			capacityFailures: 17,
			callErrorsFailures: 0,
		});
		const summary = summarizeProviderHealth(points);
		expect(summary.eligibleAttempts).toBe(340);
		expect(summary.reachability.failures).toBe(2);
		expect(summary.capacity.failures).toBe(17);
		// Hourly average over 24 hours, empty hours at 100%, like the request-level chart.
		expect(summary.capacity.averagePct).toBeCloseTo((23 * 100 + 95) / 24, 6);
		expect(summary.callErrors.averagePct).toBe(100);
	});
});

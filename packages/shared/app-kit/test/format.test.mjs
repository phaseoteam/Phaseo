// The shared display formatters. Plain Node, no dependencies: `pnpm --filter @phaseo/app-kit test`.
// Each formatter is the website's own style, so these cases are the website's output.

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCompactAxisTick, formatRoundedCount } from "../src/format/counts.ts";
import { formatDuration } from "../src/format/duration.ts";
import { formatUsd, formatUsdCost, formatUsdHeadlinePrice, formatUsdPrice } from "../src/format/money.ts";
import { formatLatency, formatTokenCount, formatTokenCountShort, formatTps } from "../src/format/units.ts";
import {
	formatAgoShort,
	formatCalendarDate,
	formatDate,
	formatDateParts,
	formatDateTime,
	formatRelativeTime,
	formatRelativeUnitInEnglish,
	formatTime,
	formatTimestamp,
} from "../src/format/time.ts";

test("formatUsd: the website's budgets style, $ whatever the language", () => {
	const cases = [
		[0, "$0.00"],
		[0.00004, "$0.00"],
		[0.0035, "$0.0035"],
		[0.003, "$0.003"],
		[0.1234, "$0.12"],
		[0.5, "$0.50"],
		[12.5, "$12.50"],
		[1234.5, "$1,234.50"],
		[-3.2, "-$3.20"],
		[-0.004, "-$0.00"],
		[null, "—"],
		[undefined, "—"],
		[Number.NaN, "—"],
	];
	for (const [value, expected] of cases) assert.equal(formatUsd(value), expected, `formatUsd(${value})`);
});

test("formatUsdCost: the website chat's cost, trailing zeros dropped", () => {
	const cases = [
		[0, "$0"],
		[0.5, "$0.5"],
		[0.1234, "$0.1234"],
		[0.12345, "$0.1235"],
		[0.01, "$0.01"],
		[0.0035, "$0.0035"],
		[0.00004, "$0.00004"],
		[0.000004, "$0.000004"],
		[1234.5, "$1234.5"],
		["0.25", "$0.25"],
		[-1, null],
		[Number.NaN, null],
		["abc", null],
		[null, null],
	];
	for (const [value, expected] of cases) assert.equal(formatUsdCost(value), expected, `formatUsdCost(${value})`);
});

test("formatUsdPrice: the website's /models list prices", () => {
	const cases = [
		// Four places at most, so a price under $0.00005 shows as $0 on the website's list too.
		[0.00004, "$0"],
		[0.0005, "$0.0005"],
		// Three places from a tenth of a cent up to ten cents, so $0.0035 reads $0.004 on the website's list.
		[0.0035, "$0.004"],
		[0.035, "$0.035"],
		[0.1234, "$0.12"],
		[2.5, "$2.5"],
		[15, "$15"],
		[1234.5, "$1,234.5"],
		[-1, null],
		[null, null],
		[Number.NaN, null],
	];
	for (const [value, expected] of cases) assert.equal(formatUsdPrice(value), expected, `formatUsdPrice(${value})`);
	assert.equal(formatUsdPrice(0), null);
	assert.equal(formatUsdPrice(0, { allowZero: true }), "$0");
});

test("formatRoundedCount rounds down with English suffixes", () => {
	const cases = [
		[0, "0"],
		[999.9, "999"],
		[1_150, "1.15K"],
		[999_999, "999.99K"],
		[1_234_567, "1.23M"],
		[25_000_000, "25M"],
		[1_999_999_999, "1.99B"],
	];
	for (const [value, expected] of cases) assert.equal(formatRoundedCount(value, "en-US"), expected, `formatRoundedCount(${value})`);
	assert.equal(formatRoundedCount(Number.NaN), "--");
	assert.equal(formatCompactAxisTick(1_500_000, "en-US"), "1.5M");
});

const NOW = Date.parse("2026-10-29T12:00:00Z");
const before = (ms) => NOW - ms;
const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

test("formatRelativeTime words a time as the website's timestamps do", () => {
	const cases = [
		[before(0), "now"],
		[before(30 * SECOND), "30 seconds ago"],
		// Math.round(-1.5) is -1, so 90 seconds ago is "1 minute ago", as on the website.
		[before(90 * SECOND), "1 minute ago"],
		[before(150 * SECOND), "2 minutes ago"],
		[before(5 * MINUTE), "5 minutes ago"],
		[before(3 * HOUR), "3 hours ago"],
		[before(DAY), "yesterday"],
		[before(3 * DAY), "3 days ago"],
		[before(60 * DAY), "2 months ago"],
		[before(400 * DAY), "last year"],
		[NOW + 3 * HOUR, "in 3 hours"],
		[new Date(before(5 * MINUTE)), "5 minutes ago"],
		[new Date(before(5 * MINUTE)).toISOString(), "5 minutes ago"],
	];
	for (const [value, expected] of cases) assert.equal(formatRelativeTime(value, NOW), expected, `formatRelativeTime(${value})`);
	assert.equal(formatRelativeTime("not a date", NOW), "");
});

test("formatAgoShort abbreviates the same units and rounding", () => {
	const cases = [
		[before(0), "now"],
		[before(59 * SECOND), "now"],
		[before(5 * MINUTE), "5m"],
		[before(90 * MINUTE), "2h"],
		[before(3 * DAY), "3d"],
		[before(60 * DAY), "2mo"],
		[before(400 * DAY), "1y"],
		[NOW + HOUR, "now"],
	];
	for (const [value, expected] of cases) assert.equal(formatAgoShort(value, NOW), expected, `formatAgoShort(${value})`);
	assert.equal(formatAgoShort("not a date", NOW), "");
});

test("formatRelativeUnitInEnglish says what Intl.RelativeTimeFormat says in English", () => {
	const intl = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	const units = ["second", "minute", "hour", "day", "week", "month", "quarter", "year", "seconds", "days"];
	const values = [-0, 0.5, -1.5, 1234.5, -12_345_678];
	for (let value = -1500; value <= 1500; value += 1) values.push(value);
	for (const unit of units) {
		for (const value of values) {
			assert.equal(formatRelativeUnitInEnglish(value, unit), intl.format(value, unit), `${value} ${unit}`);
		}
	}
});

test("formatRelativeTime words times the same without Intl.RelativeTimeFormat, as on Hermes", () => {
	const times = [0, 30 * SECOND, 90 * SECOND, 5 * MINUTE, 3 * HOUR, DAY, 3 * DAY, 60 * DAY, 400 * DAY, -3 * HOUR].map(before);
	const expected = times.map((time) => formatRelativeTime(time, NOW));
	const saved = Intl.RelativeTimeFormat;
	Intl.RelativeTimeFormat = undefined;
	try {
		assert.deepEqual(times.map((time) => formatRelativeTime(time, NOW)), expected);
	} finally {
		Intl.RelativeTimeFormat = saved;
	}
});

test("dates and times read as the website's under its default preferences", () => {
	// The website asks Intl for these styles in en-GB (apps/web/src/lib/displayPreferences.ts).
	const website = (options) => new Intl.DateTimeFormat("en-GB", options);
	const date = website({ dateStyle: "medium" });
	const calendar = website({ dateStyle: "medium", timeZone: "UTC" });
	const dateTime = website({ dateStyle: "medium", timeStyle: "short" });
	const dateTimeSeconds = website({ dateStyle: "medium", timeStyle: "medium" });
	const time = website({ hour: "2-digit", minute: "2-digit" });
	for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 7 * HOUR + 13 * MINUTE + 7 * SECOND) {
		const value = new Date(t);
		assert.equal(formatDate(value), date.format(value));
		assert.equal(formatCalendarDate(value), calendar.format(value));
		assert.equal(formatDateTime(value), dateTime.format(value));
		assert.equal(formatDateTime(value, { includeSeconds: true }), dateTimeSeconds.format(value));
		assert.equal(formatTime(value), time.format(value));
	}
	assert.equal(formatCalendarDate("2026-10-07"), "7 Oct 2026");
	assert.equal(formatDateParts("2026-03-01", { month: "short", year: "numeric", timeZone: "UTC" }), "Mar 2026");
	assert.equal(formatDateTime(Date.UTC(2026, 9, 29, 14, 5)).replace(/\d\d:\d\d$/, "hh:mm"), "29 Oct 2026, hh:mm");
	// Like the website: a missing date is the fallback, text that isn't a date is shown as it is.
	assert.equal(formatDate(null), "-");
	assert.equal(formatDate(undefined, "—"), "—");
	assert.equal(formatDate("soon"), "soon");
	assert.equal(formatTime(""), "-");
});

test("formatTimestamp is relative within a day, then the date and time", () => {
	assert.equal(formatTimestamp(before(0), NOW), "now");
	assert.equal(formatTimestamp(before(3 * HOUR), NOW), "3 hours ago");
	assert.equal(formatTimestamp(NOW + 3 * HOUR, NOW), "in 3 hours");
	assert.equal(formatTimestamp(before(DAY), NOW), formatDateTime(before(DAY)));
	assert.equal(formatTimestamp(null, NOW), "-");
});

test("formatDuration: how long a piece of work took", () => {
	const cases = [
		[-5, "0 ms"],
		[850, "850 ms"],
		[1_500, "1.5 s"],
		[1_234, "1.23 s"],
		[12_345, "12.3 s"],
		[125_000, "2.08 min"],
		[930_000, "15.5 min"],
		[Number.NaN, "-"],
	];
	for (const [value, expected] of cases) assert.equal(formatDuration(value), expected, `formatDuration(${value})`);
});

test("formatUsdHeadlinePrice: the website's /models card headline", () => {
	const cases = [
		[0, "$0"],
		[0.0035, "$0.0035"],
		[0.00012345, "$0.000123"],
		[0.075, "$0.075"],
		[0.5, "$0.50"],
		[3, "$3"],
		[15.5, "$15.50"],
		[1234.5, "$1,234.50"],
	];
	for (const [value, expected] of cases) assert.equal(formatUsdHeadlinePrice(value), expected, `formatUsdHeadlinePrice(${value})`);
});

test("formatTps: speed in tps, as the model page's providers show it", () => {
	const cases = [
		[0, "0.0 tps"],
		[4.5, "4.5 tps"],
		[45.25, "45.3 tps"],
		[99.94, "99.9 tps"],
		[123.4, "123 tps"],
		[1_234.5, "1,235 tps"],
		[-3, "0.0 tps"],
		[null, null],
		[Number.NaN, null],
	];
	for (const [value, expected] of cases) assert.equal(formatTps(value), expected, `formatTps(${value})`);
	assert.equal(formatTps(45.25, "de-DE"), "45,3 tps");
});

test("formatLatency: latency in seconds", () => {
	const cases = [
		[0, "0.00 s"],
		[245, "0.25 s"],
		[850, "0.85 s"],
		[1_500, "1.50 s"],
		[5_312, "5.31 s"],
		[13_785, "13.8 s"],
		[125_000, "125 s"],
		[999_600, "1,000 s"],
		[1_000_001, "16.7 min"],
		[7_200_000, "120 min"],
		[-500, "0.00 s"],
		[null, null],
		[Number.POSITIVE_INFINITY, null],
	];
	for (const [value, expected] of cases) assert.equal(formatLatency(value), expected, `formatLatency(${value})`);
});

test("token limits: in full, or short where space is tight", () => {
	assert.equal(formatTokenCount(131_072), "131,072 tokens");
	assert.equal(formatTokenCount(1), "1 token");
	assert.equal(formatTokenCount(1_048_576, "de-DE"), "1.048.576 tokens");
	const cases = [[512, "512"], [8_192, "8K"], [131_072, "131K"], [200_000, "200K"], [1_048_576, "1M"], [2_000_000, "2M"]];
	for (const [value, expected] of cases) assert.equal(formatTokenCountShort(value), expected, `formatTokenCountShort(${value})`);
});

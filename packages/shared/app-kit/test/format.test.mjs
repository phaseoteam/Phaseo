// The shared display formatters. Plain Node, no dependencies: `pnpm --filter @phaseo/app-kit test`.
// Each formatter is the website's own style, so these cases are the website's output.

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCompactAxisTick, formatRoundedCount } from "../src/format/counts.ts";
import { formatUsd, formatUsdCost, formatUsdPrice } from "../src/format/money.ts";
import { formatAgoShort, formatRelativeTime } from "../src/format/relativeTime.ts";

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

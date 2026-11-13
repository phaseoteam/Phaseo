import { describe, expect, it } from "vitest";
import { usageLogsRedirectHref } from "./logs/usageLogsRedirect";
import { usageRedirectHref } from "./usageRedirect";

describe("usage redirects", () => {
	it.each([
		[{}, "/settings/usage/overview"],
		[{ tab: "Trends", range: "7d" }, "/settings/usage/trends?range=7d"],
		[{ tab: "unknown" }, "/settings/usage/overview"],
	])("sends /settings/usage %j to %s", (search, href) => {
		expect(usageRedirectHref(search)).toBe(href);
	});

	it.each([
		[{}, "/settings/usage/logs/requests"],
		[{ view: "jobs", range: "24h" }, "/settings/usage/logs/jobs?range=24h"],
		[{ view: ["UPSTREAM"] }, "/settings/usage/logs/upstream"],
		[{ view: "unknown" }, "/settings/usage/logs/requests"],
	])("sends /settings/usage/logs %j to %s", (search, href) => {
		expect(usageLogsRedirectHref(search)).toBe(href);
	});
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageMeters, resetText, windowName } from "./UsageMeters";

describe("usage meters", () => {
	it("shows what is left in each window, the plan and blocked included usage", () => {
		const markup = renderToStaticMarkup(<UsageMeters status={{ checkedAt: "2026-10-03T12:00:00Z", authenticated: true, identity: "person@example.invalid", plan: "pro", ordinaryUsageAllowed: false, usage: [{ id: "codex", name: "Codex", spendControlReached: null, primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: null }, secondary: null }] }} />);
		expect(markup).toContain("5-hour"); expect(markup).toContain("75% left"); expect(markup).toContain('aria-valuenow="25"');
		expect(markup).toContain("pro"); expect(markup).toContain("Included usage is used up");
	});
	it("reports missing sign-in and usage errors without inventing a quota", () => {
		const markup = renderToStaticMarkup(<UsageMeters status={{ checkedAt: "2026-10-03T12:00:00Z", authenticated: null, usageError: "Codex did not provide usage limits." }} />);
		expect(markup).toContain("Sign-in status unavailable"); expect(markup).toContain("Codex did not provide usage limits."); expect(markup).not.toContain("% left");
	});
	it("names windows by length and counts down to the reset", () => {
		expect([windowName(300, "x"), windowName(10080, "x"), windowName(1440, "x"), windowName(2880, "x"), windowName(null, "Fallback")]).toEqual(["5-hour", "Weekly", "Daily", "2-day", "Fallback"]);
		const now = Date.parse("2026-10-03T12:00:00Z");
		expect(resetText(now / 1000 + 45 * 60, now)).toBe("Resets in 45m");
		expect(resetText(now / 1000 + 134 * 60, now)).toBe("Resets in 2h 14m");
		expect(resetText(null, now)).toBe("");
	});
});

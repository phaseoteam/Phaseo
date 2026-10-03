import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountStatus } from "./AccountStatus";

describe("account usage display", () => {
	it("shows remaining quota, unknown windows and independent backend blocking", () => {
		const markup = renderToStaticMarkup(<AccountStatus status={{ checkedAt: "2026-10-03T12:00:00Z", authenticated: true, identity: "person@example.invalid", plan: "pro", ordinaryUsageAllowed: false, usage: [{ id: "codex", name: "Codex", primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: null }, secondary: null, spendControlReached: null }] }} />);
		expect(markup).toContain("75% remaining"); expect(markup).toContain("Included usage is blocked."); expect(markup).toContain("Secondary window: unavailable"); expect(markup).toContain('value="75"'); expect(markup).not.toContain("Resets");
	});
	it("preserves unavailable authentication and quota errors without claiming a quota", () => {
		const markup = renderToStaticMarkup(<AccountStatus status={{ checkedAt: "2026-10-03T12:00:00Z", authenticated: null, usageError: "Codex did not provide usage limits." }} />);
		expect(markup).toContain("Authentication status unavailable"); expect(markup).toContain("Codex did not provide usage limits."); expect(markup).not.toContain("% remaining");
	});
});

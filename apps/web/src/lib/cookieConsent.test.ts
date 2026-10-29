import { isAnalyticsBlockedPath, readAnalyticsConsentFromCookieHeader } from "./cookieConsent";

describe("isAnalyticsBlockedPath", () => {
	it("blocks emailed feedback links, with or without a locale", () => {
		const token = "0f8fad5b-d9cb-469f-a165-70867728950e";
		expect(isAnalyticsBlockedPath(`/feedback/${token}`)).toBe(true);
		expect(isAnalyticsBlockedPath(`/de-DE/feedback/${token}/unsubscribe`)).toBe(true);
	});

	it("blocks the Slack agent's account links, whose token is in the query", () => {
		expect(isAnalyticsBlockedPath("/slack/link")).toBe(true);
		expect(isAnalyticsBlockedPath("/ja/slack/link")).toBe(true);
		// Credit top-up review links carry their single-use token in the query.
		expect(isAnalyticsBlockedPath("/settings/credits/topups/00000000-0000-4000-8000-0000000000aa")).toBe(true);
		expect(isAnalyticsBlockedPath("/fr-FR/settings/credits/topups/00000000-0000-4000-8000-0000000000aa")).toBe(true);
		expect(isAnalyticsBlockedPath("/settings/credits")).toBe(false);
	});

	it("leaves every other page alone", () => {
		expect(isAnalyticsBlockedPath("/")).toBe(false);
		expect(isAnalyticsBlockedPath("/models/feedback")).toBe(false);
		expect(isAnalyticsBlockedPath("/redeem")).toBe(false);
		expect(isAnalyticsBlockedPath("/settings/slack")).toBe(false);
		expect(isAnalyticsBlockedPath("/slack/linked-accounts")).toBe(false);
	});
});

describe("readAnalyticsConsentFromCookieHeader", () => {
	it("reads accepted consent from a request cookie header", () => {
		expect(readAnalyticsConsentFromCookieHeader("other=1; phaseo_analytics_consent=accepted")).toBe("accepted");
	});

	it("fails closed for missing or invalid consent", () => {
		expect(readAnalyticsConsentFromCookieHeader(null)).toBeNull();
		expect(readAnalyticsConsentFromCookieHeader("phaseo_analytics_consent=pending")).toBeNull();
	});
});

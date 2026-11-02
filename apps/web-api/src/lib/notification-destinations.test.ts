import { describe, expect, it } from "vitest";
import { isNotificationEventKind, isSpendReportCadence, parseIanaTimeZone, targetPreview, validateNotificationTarget } from "./notification-destinations";

describe("notification destination validation", () => {
	it("accepts and masks multiple email destinations", () => { const target = validateNotificationTarget("email", JSON.stringify(["Alerts@Example.com", "ops@example.com"])); expect(JSON.parse(target)).toEqual(["alerts@example.com", "ops@example.com"]); expect(targetPreview("email", target)).toBe("al•••@example.com +1"); });
	it("requires official Slack webhook hosts", () => { expect(() => validateNotificationTarget("slack", "https://example.com/hook")).toThrow(/Slack/); expect(validateNotificationTarget("slack", "https://hooks.slack.com/services/test")).toContain("hooks.slack.com"); });
	it("rejects private custom webhook targets", () => { expect(() => validateNotificationTarget("custom_webhook", "https://127.0.0.1/hook")).toThrow(/private network/); });
	it("normalizes Discord bot credentials", () => { expect(JSON.parse(validateNotificationTarget("discord", JSON.stringify({ channelId: "123456789012345678", botToken: "a".repeat(30) })))).toEqual({ channelId: "123456789012345678", botToken: "a".repeat(30), userIds: [], roleIds: [] }); });
	it("stores explicit Discord webhook mentions", () => {
		const target = validateNotificationTarget("discord_webhook", JSON.stringify({ url: "https://discord.com/api/webhooks/123456789012345/token-value", userIds: ["123456789012345678"], roleIds: ["987654321098765432"] }));
		expect(JSON.parse(target)).toMatchObject({ userIds: ["123456789012345678"], roleIds: ["987654321098765432"] });
	});
	it("stores explicit Slack user and user group mentions", () => {
		const target = validateNotificationTarget("slack", JSON.stringify({ url: "https://hooks.slack.com/services/test", userIds: ["U012ABCDEF"], userGroupIds: ["S012ABCDEF"] }));
		expect(JSON.parse(target)).toMatchObject({ userIds: ["U012ABCDEF"], userGroupIds: ["S012ABCDEF"] });
	});
	it("stores Microsoft Teams UPN and Entra mentions", () => {
		const target = validateNotificationTarget("microsoft_teams", JSON.stringify({ url: "https://example.com/teams", mentionIds: ["alex@example.com", "49c4641c-ab91-4248-aebb-6a7de286397b"] }));
		expect(JSON.parse(target).mentionIds).toHaveLength(2);
	});
	it("routes the spend rule notification kinds", () => {
		for (const kind of ["spend_alert", "spend_blocked", "spend_report", "rate_limit_throttled"]) expect(isNotificationEventKind(kind)).toBe(true);
		expect(isNotificationEventKind("notification_test")).toBe(false);
	});
	it("accepts IANA billing time zones only", () => {
		expect(parseIanaTimeZone("Europe/London")).toBe("Europe/London");
		expect(parseIanaTimeZone("UTC")).toBe("UTC");
		expect(parseIanaTimeZone("+05:30")).toBeNull();
		expect(parseIanaTimeZone("Mars/Olympus_Mons")).toBeNull();
		expect(parseIanaTimeZone(null)).toBeNull();
	});

	it("accepts the spend report cadences only", () => {
		for (const cadence of ["off", "daily", "weekly", "monthly"]) expect(isSpendReportCadence(cadence)).toBe(true);
		for (const value of ["hourly", "Weekly", "", null, 7]) expect(isSpendReportCadence(value)).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { EVENT_KINDS, SPEND_REPORT_CADENCES, hasVerifiedTotpFactor, isNotificationEventKind, parseDepartmentSpendAttribution, parseSpendReportCadence, parseSpendSettingsUpdate, usdToNanos } from "./notifications";
import { parseIanaTimeZone } from "@/lib/time-zones";
import { notificationTargetPreview, validateNotificationTarget } from "./notification-target";

describe("notification management validation", () => {
	it("normalizes email destinations and redacts their preview", () => {
		const target = validateNotificationTarget("email", "Ops@Example.com");
		expect(target).toBe('["ops@example.com"]');
		expect(notificationTargetPreview("email", target)).toBe("op•••@example.com");
	});

	it("rejects private webhook destinations", () => {
		expect(() => validateNotificationTarget("custom_webhook", "https://127.0.0.1/hook")).toThrow("private network");
	});

	it("converts two-decimal thresholds to nanos", () => {
		expect(usdToNanos("12.34")).toBe(12_340_000_000);
		expect(usdToNanos("12.345")).toBeNull();
	});

	it("recognizes a verified TOTP factor for Auto Top-Up", () => {
		expect(hasVerifiedTotpFactor([{ factor_type: "totp", status: "verified" }])).toBe(true);
	});

	it("does not treat unverified or other factors as MFA", () => {
		expect(hasVerifiedTotpFactor([{ factor_type: "totp", status: "unverified" }])).toBe(false);
		expect(hasVerifiedTotpFactor([{ factor_type: "webauthn", status: "verified" }])).toBe(false);
		expect(hasVerifiedTotpFactor(null)).toBe(false);
	});

	it("accepts only all or primary department spend attribution", () => {
		expect(parseDepartmentSpendAttribution("all")).toBe("all");
		expect(parseDepartmentSpendAttribution("primary")).toBe("primary");
		expect(parseDepartmentSpendAttribution("Primary")).toBeNull();
		expect(parseDepartmentSpendAttribution(undefined)).toBeNull();
	});

	it("routes the spend rule notification kinds", () => {
		for (const kind of ["spend_alert", "spend_blocked", "spend_report", "rate_limit_throttled"]) expect(isNotificationEventKind(kind)).toBe(true);
		expect(isNotificationEventKind("notification_test")).toBe(false);
		expect(isNotificationEventKind("spend_alerts")).toBe(false);
		expect(EVENT_KINDS).toHaveLength(9);
	});

	it("accepts IANA billing time zones only", () => {
		expect(parseIanaTimeZone("Europe/London")).toBe("Europe/London");
		expect(parseIanaTimeZone(" America/Argentina/Buenos_Aires ")).toBe("America/Argentina/Buenos_Aires");
		expect(parseIanaTimeZone("UTC")).toBe("UTC");
		expect(parseIanaTimeZone("+01:00")).toBeNull();
		expect(parseIanaTimeZone("Mars/Olympus_Mons")).toBeNull();
		expect(parseIanaTimeZone("")).toBeNull();
		expect(parseIanaTimeZone(42)).toBeNull();
	});

	it("parses spend settings updates field by field", () => {
		expect(parseSpendSettingsUpdate({ billing_time_zone: "Asia/Tokyo" })).toEqual({ update: { billing_time_zone: "Asia/Tokyo" } });
		expect(parseSpendSettingsUpdate({ department_attribution: "primary", billing_time_zone: "UTC" })).toEqual({ update: { department_spend_attribution: "primary", billing_time_zone: "UTC" } });
		expect(parseSpendSettingsUpdate({ billing_time_zone: "Nowhere/City" })).toEqual({ error: expect.stringContaining("billing_time_zone") });
		expect(parseSpendSettingsUpdate({ department_attribution: "some" })).toEqual({ error: expect.stringContaining("department_attribution") });
		expect(parseSpendSettingsUpdate({})).toEqual({ error: expect.any(String) });
	});

	it("parses the spend report settings", () => {
		expect(parseSpendSettingsUpdate({ report_cadence: "monthly" })).toEqual({ update: { spend_report_cadence: "monthly" } });
		expect(parseSpendSettingsUpdate({ report_cadence: "off", report_include_admins: true })).toEqual({ update: { spend_report_cadence: "off", spend_report_include_admins: true } });
		expect(parseSpendSettingsUpdate({ report_include_admins: false, billing_time_zone: "Asia/Tokyo" })).toEqual({ update: { billing_time_zone: "Asia/Tokyo", spend_report_include_admins: false } });
		expect(parseSpendSettingsUpdate({ report_cadence: "hourly" })).toEqual({ error: expect.stringContaining("report_cadence") });
		expect(parseSpendSettingsUpdate({ report_cadence: "Weekly" })).toEqual({ error: expect.stringContaining("report_cadence") });
		expect(parseSpendSettingsUpdate({ report_include_admins: "true" })).toEqual({ error: expect.stringContaining("report_include_admins") });
		for (const cadence of SPEND_REPORT_CADENCES) expect(parseSpendReportCadence(cadence)).toBe(cadence);
		expect(parseSpendReportCadence(null)).toBeNull();
	});
});

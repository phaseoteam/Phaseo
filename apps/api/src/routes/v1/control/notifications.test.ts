import { describe, expect, it } from "vitest";
import { hasVerifiedTotpFactor, usdToNanos } from "./notifications";
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
});

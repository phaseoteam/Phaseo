import { describe, expect, it } from "vitest";
import { validExpoPushToken, validInstallationId } from "./settings-mobile-notifications";

describe("mobile notification registration validation", () => {
	it("accepts Expo push token formats", () => {
		expect(validExpoPushToken("ExponentPushToken[abc_123-XYZ]")).toBe(true);
		expect(validExpoPushToken("ExpoPushToken[abc_123-XYZ]")).toBe(true);
	});

	it("rejects arbitrary delivery targets", () => {
		expect(validExpoPushToken("https://example.com/webhook")).toBe(false);
		expect(validExpoPushToken("ExponentPushToken[]")).toBe(false);
	});

	it("accepts only bounded installation identifiers", () => {
		expect(validInstallationId("install:12345678")).toBe(true);
		expect(validInstallationId("short")).toBe(false);
		expect(validInstallationId("contains spaces")).toBe(false);
	});
});

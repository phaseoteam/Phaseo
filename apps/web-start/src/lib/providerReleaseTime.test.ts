import { providerReleaseInstant } from "./providerReleaseTime";

test("converts fractional offsets and summer time to UTC", () => {
	expect(providerReleaseInstant("2099-12-01T09:00", "Asia/Kolkata")).toBe("2099-12-01T03:30:00.000Z");
	expect(providerReleaseInstant("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
});
test("rejects invalid dates, zones, DST gaps and repeated wall times", () => {
	expect(providerReleaseInstant("2026-03-29T01:30", "Europe/London")).toBeNull();
	expect(providerReleaseInstant("2026-10-25T01:30", "Europe/London")).toBeNull();
	expect(providerReleaseInstant("2026-02-30T09:00", "UTC")).toBeNull();
	expect(providerReleaseInstant("2026-09-12T09:00", "Invalid/Zone")).toBeNull();
});

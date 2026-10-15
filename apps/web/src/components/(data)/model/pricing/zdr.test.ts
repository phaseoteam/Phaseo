import { resolveEnforcedZdr, resolveScopedZdr } from "@/components/(data)/model/pricing/zdr";

describe("resolveEnforcedZdr", () => {
	it("does not promote contractual eligibility into an active retention guarantee", () => {
		expect(resolveEnforcedZdr(false, "eligible")).toBe(false);
		expect(resolveEnforcedZdr(null, "eligible")).toBeNull();
	});

	it("preserves explicit guarantees and ineligibility", () => {
		expect(resolveEnforcedZdr(true, "eligible")).toBe(true);
		expect(resolveEnforcedZdr(true, "ineligible")).toBe(false);
		expect(resolveEnforcedZdr(null, "ineligible")).toBe(false);
		expect(resolveEnforcedZdr(true, "unknown")).toBe(true);
	});
});

describe("verified route retention", () => {
	it("supports native routes without granting ZDR to other or future routes", () => {
		expect(resolveEnforcedZdr(false, "eligible", true)).toBe(true);
		expect(resolveEnforcedZdr(false, "ineligible", false)).toBe(false);
		expect(resolveEnforcedZdr(false, undefined)).toBe(false);
		expect(resolveEnforcedZdr(true, "eligible", false)).toBe(false);
		expect(resolveEnforcedZdr(false, "ineligible", true)).toBe(false);
	});
	it("keeps mixed scopes unknown instead of advertising a blanket guarantee", () => {
		const native = { zdrEligibility: "eligible", zeroDataRetention: true };
		expect(resolveScopedZdr(false, [native, native])).toBe(true);
		expect(resolveScopedZdr(false, [native, null])).toBeNull();
		expect(resolveScopedZdr(false, [null, null])).toBe(false);
		expect(resolveScopedZdr(false, [])).toBe(false);
	});
});

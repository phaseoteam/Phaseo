import { priceChangePercent, redirectStartsAt, skippedCharges, successorOutcome, type SuccessorOverviewModel, type SuccessorPolicyState } from "./modelSuccessorOutcome";

const base: SuccessorOverviewModel = {
	model: "lab/old",
	name: "Old",
	status: "retired",
	retiredAt: null,
	unservedSince: "2026-10-20T00:00:00Z",
	lastUsedAt: null,
	requests: 1,
	suggestedReplacement: "lab/new",
	replacement: "lab/new",
	replacementName: "New",
	workspaceOverride: false,
	reason: "eligible",
	priceRatio: 1,
	priceComparable: true,
	priceSkippedMeters: [],
	servedBy: [],
};
const on: SuccessorPolicyState = { enabled: true, pricePolicy: "never", maxPriceIncreasePercent: 0 };

describe("successorOutcome", () => {
	it("redirects an unserved model whose replacement costs no more", () => {
		expect(successorOutcome(base, on)).toBe("redirecting");
		expect(successorOutcome({ ...base, reason: "within_grace_period", unservedSince: null }, on)).toBe("will_redirect");
	});

	it("reports why a model would not be redirected", () => {
		expect(successorOutcome(base, { ...on, enabled: false })).toBe("off");
		expect(successorOutcome({ ...base, reason: "never", replacement: null }, on)).toBe("never");
		expect(successorOutcome({ ...base, reason: "not_approved", replacement: null }, on)).toBe("no_replacement");
		expect(successorOutcome({ ...base, reason: "no_served_successor" }, on)).toBe("replacement_unavailable");
		expect(successorOutcome({ ...base, reason: "free_to_paid", replacement: null }, on)).toBe("free_to_paid");
		expect(successorOutcome({ ...base, priceComparable: false, priceRatio: null }, on)).toBe("price_unknown");
	});

	it("applies the price policy like the gateway", () => {
		const pricier = { ...base, priceRatio: 1.25 };
		expect(successorOutcome(pricier, on)).toBe("price_higher");
		expect(successorOutcome(pricier, { ...on, pricePolicy: "limit", maxPriceIncreasePercent: 20 })).toBe("price_higher");
		expect(successorOutcome(pricier, { ...on, pricePolicy: "limit", maxPriceIncreasePercent: 25 })).toBe("redirecting");
		expect(successorOutcome({ ...base, priceRatio: 1.0000004 }, on)).toBe("redirecting");
		expect(successorOutcome({ ...base, priceComparable: false, priceRatio: null }, { ...on, pricePolicy: "any" })).toBe("redirecting");
		// The workspace's own replacement is used whatever it costs.
		expect(successorOutcome({ ...pricier, workspaceOverride: true }, on)).toBe("redirecting");
	});
});

describe("successor display helpers", () => {
	it("formats the price change", () => {
		expect(priceChangePercent({ priceRatio: 1.25, priceComparable: true })).toBe(25);
		expect(priceChangePercent({ priceRatio: 0.8, priceComparable: true })).toBe(-20);
		expect(priceChangePercent({ priceRatio: null, priceComparable: false })).toBeNull();
	});

	it("names the charges a request could still add", () => {
		const model = { ...base, priceSkippedMeters: ["native_web_search_requests", "input_image_tokens", "input_audio_tokens", "output_audio_tokens"] };
		expect(skippedCharges(model, on)).toEqual(["webSearch", "images", "audio"]);
		expect(skippedCharges(model, { ...on, pricePolicy: "any" })).toEqual([]);
		expect(skippedCharges({ ...model, workspaceOverride: true }, on)).toEqual([]);
	});

	it("starts redirects 72 hours after the model stopped being served", () => {
		expect(redirectStartsAt(base)?.toISOString()).toBe("2026-10-23T00:00:00.000Z");
		expect(redirectStartsAt({ unservedSince: null })).toBeNull();
	});
});

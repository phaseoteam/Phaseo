import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_CUSTOMER_RATE_LIMIT_LADDER, classifyCustomerTier, customerRateLimitLadder, customerTierKey,
	isPublishedCustomerTier, parseCustomerRateLimitLadder, publishedCustomerTier, resolveCustomerLimits, selfServeRaiseStatus,
	type CustomerRateLimitInputs,
} from "./customer-rate-limit-ladder";

const now = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
const usd = (amount: number) => String(Math.round(amount * 1e9));
function inputs(overrides: Partial<CustomerRateLimitInputs> = {}): CustomerRateLimitInputs {
	return {
		workspace_id: "workspace", created_at: daysAgo(1), billing_mode: "wallet", has_paid_top_up: false,
		lifetime_paid_spend_nanos: "0", override_requests_per_minute: null, override_free_requests_per_day: null,
		override_expires_at: null, ...overrides,
	};
}
const ladder = DEFAULT_CUSTOMER_RATE_LIMIT_LADDER;
const tier = (overrides: Partial<CustomerRateLimitInputs>) => classifyCustomerTier(inputs(overrides), ladder, now);

afterEach(() => vi.restoreAllMocks());

describe("customer rate-limit trust ladder", () => {
	it("classifies the default tiers, highest match first", () => {
		expect(tier({})).toBe("new");
		expect(tier({ created_at: daysAgo(6.9) })).toBe("new");
		expect(tier({ created_at: daysAgo(7) })).toBe("standard");
		expect(tier({ has_paid_top_up: true })).toBe("standard");
		expect(tier({ created_at: daysAgo(29), lifetime_paid_spend_nanos: usd(500) })).toBe("standard");
		expect(tier({ created_at: daysAgo(30), lifetime_paid_spend_nanos: usd(49.99) })).toBe("standard");
		expect(tier({ created_at: daysAgo(30), lifetime_paid_spend_nanos: usd(50), has_paid_top_up: true })).toBe("trusted");
		expect(tier({ billing_mode: "invoice" })).toBe("enterprise");
		expect(tier({ billing_mode: "invoice", created_at: daysAgo(400), lifetime_paid_spend_nanos: usd(1e6) })).toBe("enterprise");
		expect(tier({ created_at: "not a date" })).toBe("new");
	});

	it("resolves limits, treating a missing publication as the new tier", () => {
		expect(resolveCustomerLimits(null, ladder, now)).toEqual({ tier: "new", requestsPerMinute: 10, freeRequestsPerDay: 1500 });
		expect(resolveCustomerLimits({ tier: "standard" }, ladder, now)).toEqual({ tier: "standard", requestsPerMinute: 25, freeRequestsPerDay: 1500 });
		expect(resolveCustomerLimits({ tier: "trusted" }, ladder, now).requestsPerMinute).toBe(60);
		expect(resolveCustomerLimits({ tier: "enterprise" }, ladder, now).requestsPerMinute).toBe(120);
	});

	it("lets an unexpired override win, field by field, and ignores it after expiry", () => {
		const published = publishedCustomerTier(inputs({
			created_at: daysAgo(10), override_requests_per_minute: 5, override_expires_at: new Date(now + 60_000).toISOString(),
		}), ladder, now);
		expect(published).toEqual({ tier: "standard", override: { requestsPerMinute: 5, expiresAt: now + 60_000 } });
		expect(resolveCustomerLimits(published, ladder, now)).toEqual({ tier: "override", requestsPerMinute: 5, freeRequestsPerDay: 1500 });
		expect(resolveCustomerLimits(published, ladder, now + 60_000)).toEqual({ tier: "standard", requestsPerMinute: 25, freeRequestsPerDay: 1500 });
		const free = publishedCustomerTier(inputs({ override_free_requests_per_day: 9000 }), ladder, now);
		expect(free).toEqual({ tier: "new", override: { freeRequestsPerDay: 9000 } });
		expect(resolveCustomerLimits(free, ladder, now)).toEqual({ tier: "new", requestsPerMinute: 10, freeRequestsPerDay: 9000 });
		expect(publishedCustomerTier(inputs({ override_requests_per_minute: 5, override_expires_at: daysAgo(1) }), ladder, now))
			.toEqual({ tier: "new" });
	});

	it("parses partial tuning over the defaults", () => {
		const tuned = parseCustomerRateLimitLadder(JSON.stringify({
			freeRequestsPerDay: 2000,
			tiers: { new: { requestsPerMinute: 15 }, trusted: { minLifetimePaidSpendUsd: 100, freeRequestsPerDay: 5000 } },
		}));
		expect(tuned.freeRequestsPerDay).toBe(2000);
		expect(tuned.tiers.new.requestsPerMinute).toBe(15);
		expect(tuned.tiers.standard).toEqual(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER.tiers.standard);
		expect(tuned.tiers.trusted).toMatchObject({ requestsPerMinute: 60, minAgeDays: 30, minLifetimePaidSpendUsd: 100 });
		expect(resolveCustomerLimits({ tier: "trusted" }, tuned, now).freeRequestsPerDay).toBe(5000);
		expect(resolveCustomerLimits({ tier: "standard" }, tuned, now).freeRequestsPerDay).toBe(2000);
		expect(classifyCustomerTier(inputs({ created_at: daysAgo(31), lifetime_paid_spend_nanos: usd(60) }), tuned, now)).toBe("standard");
		expect(parseCustomerRateLimitLadder(undefined)).toEqual(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER);
		expect(parseCustomerRateLimitLadder(" ")).toEqual(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER);
		// Defaults are never mutated by tuning.
		expect(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER.tiers.new.requestsPerMinute).toBe(10);
	});

	it.each([
		"{", "[]", "{\"unknown\":1}", "{\"freeRequestsPerDay\":0}", "{\"tiers\":{\"vip\":{}}}",
		"{\"tiers\":{\"new\":{\"requestsPerMinute\":1.5}}}", "{\"tiers\":{\"new\":{\"minAgeDays\":1}}}",
		"{\"tiers\":{\"standard\":{\"minAgeDays\":-1}}}", "{\"tiers\":{\"enterprise\":{\"billingModes\":[1]}}}",
		"{\"tiers\":{\"trusted\":{\"requestsPerMinute\":20}}}",
		"{\"selfServeRaise\":{\"durationDays\":0}}", "{\"selfServeRaise\":{\"minAgeDays\":-1}}", "{\"selfServeRaise\":{\"tier\":\"enterprise\"}}",
	])("rejects invalid tuning %s", (raw) => {
		expect(() => parseCustomerRateLimitLadder(raw)).toThrow("invalid_customer_rate_limit_ladder");
	});

	it("falls back to the defaults for invalid tuning on the request path", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(customerRateLimitLadder("{bad")).toEqual(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER);
		expect(customerRateLimitLadder("{bad")).toEqual(DEFAULT_CUSTOMER_RATE_LIMIT_LADDER);
		expect(error).toHaveBeenCalledTimes(1);
	});

	it("validates published values and keys them by workspace", () => {
		expect(customerTierKey("ws")).toBe("customer-quota:v2:ws");
		expect(isPublishedCustomerTier({ tier: "trusted" })).toBe(true);
		expect(isPublishedCustomerTier({ tier: "standard", override: { requestsPerMinute: 5, expiresAt: now } })).toBe(true);
		for (const value of [null, {}, { tier: "override" }, { tier: "new", override: { requestsPerMinute: 0 } }, { tier: "new", override: [] }]) {
			expect(isPublishedCustomerTier(value)).toBe(false);
		}
	});
});

describe("self-serve rate limit raises", () => {
	const raised = (overrides: Partial<CustomerRateLimitInputs> = {}) => inputs({
		created_at: daysAgo(10), has_paid_top_up: true, lifetime_paid_spend_nanos: usd(20),
		raise_tier: "trusted", raise_expires_at: daysAgo(-20), ...overrides,
	});

	it("publishes an active raise above the classified tier, and only then", () => {
		expect(publishedCustomerTier(raised(), ladder, now)).toEqual({ tier: "standard", raise: { tier: "trusted", expiresAt: now + 20 * 86_400_000 } });
		expect(publishedCustomerTier(raised({ raise_expires_at: daysAgo(1) }), ladder, now)).toEqual({ tier: "standard" });
		// Already trusted on its own: the raise adds nothing.
		expect(publishedCustomerTier(raised({ created_at: daysAgo(40), lifetime_paid_spend_nanos: usd(80) }), ladder, now)).toEqual({ tier: "trusted" });
		expect(publishedCustomerTier(raised({ raise_tier: "vip" }), ladder, now)).toEqual({ tier: "standard" });
		// Rows from before raises existed.
		expect(publishedCustomerTier(inputs({ has_paid_top_up: true }), ladder, now)).toEqual({ tier: "standard" });
	});

	it("applies a raise only while raises are enabled and it has not expired, and an override still wins", () => {
		const published = { tier: "standard" as const, raise: { tier: "trusted" as const, expiresAt: now + 1000 } };
		expect(resolveCustomerLimits(published, ladder, now)).toMatchObject({ tier: "standard", requestsPerMinute: 25 });
		expect(resolveCustomerLimits(published, ladder, now, { raisesEnabled: true })).toMatchObject({ tier: "trusted", requestsPerMinute: 60 });
		expect(resolveCustomerLimits(published, ladder, now + 1000, { raisesEnabled: true })).toMatchObject({ tier: "standard" });
		expect(resolveCustomerLimits({ ...published, override: { requestsPerMinute: 5 } }, ladder, now, { raisesEnabled: true }))
			.toMatchObject({ tier: "override", requestsPerMinute: 5 });
		expect(isPublishedCustomerTier(published)).toBe(true);
		expect(isPublishedCustomerTier({ tier: "standard", raise: { tier: "vip", expiresAt: now } })).toBe(false);
		expect(isPublishedCustomerTier({ tier: "standard", raise: { tier: "trusted" } })).toBe(false);
	});

	const status = (overrides: Partial<CustomerRateLimitInputs> = {}, options: { enabled?: boolean; lastRequestedAt?: number | null } = {}) =>
		selfServeRaiseStatus({
			inputs: inputs({ created_at: daysAgo(10), has_paid_top_up: true, lifetime_paid_spend_nanos: usd(20), ...overrides }),
			ladder, now, enabled: options.enabled ?? true, lastRequestedAt: options.lastRequestedAt ?? null,
		});

	it("lets an established paying standard workspace raise itself to trusted", () => {
		expect(status()).toEqual({
			tier: "standard", requestsPerMinute: 25, target: "trusted", targetRequestsPerMinute: 60,
			eligible: true, refusal: null, activeUntil: null, availableAt: null, durationDays: 30,
			thresholds: { minAgeDays: 7, minLifetimePaidSpendUsd: 10 },
		});
	});

	it.each([
		["the feature is off", {}, { enabled: false }, "disabled"],
		["an operator override applies", { override_requests_per_minute: 200 }, {}, "override"],
		["a raise is already active", { raise_tier: "trusted", raise_expires_at: daysAgo(-5) }, {}, "raised"],
		["the workspace is already trusted", { created_at: daysAgo(40), lifetime_paid_spend_nanos: usd(80) }, {}, "top_tier"],
		["the workspace is invoiced", { billing_mode: "invoice" }, {}, "top_tier"],
		["it never paid", { has_paid_top_up: false, created_at: daysAgo(10) }, {}, "no_paid_top_up"],
		["it is too new", { created_at: daysAgo(6) }, {}, "too_new"],
		["it paid too little", { lifetime_paid_spend_nanos: usd(9.99) }, {}, "not_enough_spend"],
		["it raised in the cooldown", {}, { lastRequestedAt: now - 59 * 86_400_000 }, "cooldown"],
	] as const)("refuses when %s", (_label, overrides, options, refusal) => {
		const result = status(overrides as Partial<CustomerRateLimitInputs>, options);
		expect(result).toMatchObject({ eligible: false, refusal });
	});

	it("reports when an active raise ends and when the next one is available", () => {
		expect(status({ raise_tier: "trusted", raise_expires_at: daysAgo(-5) })).toMatchObject({ tier: "trusted", requestsPerMinute: 60, activeUntil: now + 5 * 86_400_000 });
		expect(status({}, { lastRequestedAt: now - 50 * 86_400_000 })).toMatchObject({ availableAt: now + 10 * 86_400_000 });
		expect(status({}, { lastRequestedAt: now - 60 * 86_400_000 })).toMatchObject({ eligible: true });
		expect(parseCustomerRateLimitLadder(JSON.stringify({ selfServeRaise: { durationDays: 14, minLifetimePaidSpendUsd: 0 } })).selfServeRaise)
			.toEqual({ durationDays: 14, cooldownDays: 60, minAgeDays: 7, minLifetimePaidSpendUsd: 0 });
	});
});

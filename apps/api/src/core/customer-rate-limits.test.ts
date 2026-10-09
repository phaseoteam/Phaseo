import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	bindings: {} as Record<string, unknown>,
	admit: vi.fn(),
	getByName: vi.fn(),
	background: [] as Promise<unknown>[],
	release: vi.fn(),
	readLimits: vi.fn(),
}));
vi.mock("@core/customer-rate-limit-tiers", () => ({ readCustomerLimits: mocks.readLimits }));
vi.mock("@/runtime/env", () => ({
	getBindingsIfConfigured: () => mocks.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
	ensureRuntimeForBackground: () => mocks.release,
}));

import {
	__customerQuotaStateSizeForTests, __resetCustomerQuotaStateForTests,
	customerScopeKey, guardCustomerQuota, guardFreeRouteQuota, parseCustomerLimits,
} from "./customer-rate-limits";
import type { PriceCard } from "@pipeline/pricing/types";

const args = { workspaceId: "workspace", userId: "owner", requestId: "public-request", admissionId: "server-admission" };
let sequence = 0;
const minute = (overrides: Record<string, unknown> = {}) =>
	guardCustomerQuota({ ...args, admissionId: `admission-${++sequence}`, kind: "minute", ...overrides });
function card(plan: string, price: string) {
	return { rules: [{ pricing_plan: plan, price_per_unit: price }] } as PriceCard;
}
async function settle() {
	await Promise.all(mocks.background.splice(0));
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
	__resetCustomerQuotaStateForTests();
	mocks.background.length = 0;
	mocks.release.mockReset();
	mocks.readLimits.mockReset().mockResolvedValue({ tier: "trusted", requestsPerMinute: 60, freeRequestsPerDay: 1500 });
	mocks.admit.mockReset().mockResolvedValue({ allowed: true, limit: 25, remaining: 24, retryAfterSeconds: 0 });
	mocks.getByName.mockReset().mockReturnValue({ admit: mocks.admit });
	mocks.bindings = { CUSTOMER_RATE_LIMITS_ENABLED: "true", CUSTOMER_RATE_LIMITS: { getByName: mocks.getByName } };
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("customer quota integration", () => {
	it("uses the authenticated owner/workspace, sharing keys but isolating users and workspaces", () => {
		expect(customerScopeKey(args)).toBe("customer-quota:v1:workspace:owner");
		expect(customerScopeKey({ ...args, userId: "other" })).not.toBe(customerScopeKey(args));
		expect(customerScopeKey({ ...args, workspaceId: "other" })).not.toBe(customerScopeKey(args));
		expect(customerScopeKey({ workspaceId: "workspace" })).toBe("customer-quota:v1:workspace:workspace");
	});

	it("admits synchronously without waiting for the counter", async () => {
		mocks.admit.mockReturnValue(new Promise(() => {}));
		expect(guardCustomerQuota({ ...args, kind: "minute" })).toBeNull();
		expect(mocks.background).toHaveLength(1);
		await Promise.resolve();
		expect(mocks.admit).toHaveBeenCalledWith(customerScopeKey(args), "minute", "server-admission",
			{ requestsPerMinute: 25, freeRequestsPerDay: 1500 });
	});

	it("passes the workspace's trust-ladder limits only when the ladder is enabled", async () => {
		minute();
		await settle();
		expect(mocks.readLimits).not.toHaveBeenCalled();
		expect(mocks.admit.mock.calls[0][3]).toEqual({ requestsPerMinute: 25, freeRequestsPerDay: 1500 });
		mocks.bindings.CUSTOMER_RATE_LIMIT_LADDER_ENABLED = "true";
		mocks.bindings.CUSTOMER_RATE_LIMIT_LADDER = "{}";
		minute();
		await settle();
		expect(mocks.readLimits).toHaveBeenCalledWith("workspace", "{}");
		expect(mocks.admit.mock.calls[1][3]).toEqual({ requestsPerMinute: 60, freeRequestsPerDay: 1500 });
	});

	it("remembers a reported denial until the window frees up, then counts again", async () => {
		mocks.admit.mockResolvedValueOnce({ allowed: false, limit: 25, remaining: 0, retryAfterSeconds: 42 });
		expect(minute()).toBeNull();
		await settle();
		const response = minute();
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("42");
		expect(await response?.json()).toMatchObject({
			error: "key_limit_exceeded",
			reason: "customer_requests_per_minute",
			request_id: "public-request",
			description: "This user and workspace have reached their limit of 25 requests per minute. Retry after 42 seconds.",
		});
		vi.advanceTimersByTime(30_000);
		expect(minute()?.headers.get("Retry-After")).toBe("12");
		// Locally rejected requests are not sent to the counter.
		expect(mocks.admit).toHaveBeenCalledTimes(1);
		// Other users and workspaces are unaffected.
		expect(minute({ userId: "other" })).toBeNull();
		vi.advanceTimersByTime(12_000);
		expect(minute()).toBeNull();
		await settle();
		expect(mocks.admit).toHaveBeenCalledTimes(3);
	});

	it("starts rejecting as soon as the counter reports the last slot used", async () => {
		mocks.admit.mockResolvedValueOnce({ allowed: true, limit: 25, remaining: 0, retryAfterSeconds: 7 });
		expect(minute()).toBeNull();
		await settle();
		expect(minute()?.status).toBe(429);
	});

	it("fails open when the counter fails or its binding is missing", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.admit.mockRejectedValue(new Error("unavailable"));
		expect(minute()).toBeNull();
		await settle();
		expect(mocks.release).toHaveBeenCalledTimes(1);
		expect(minute()).toBeNull();
		delete mocks.bindings.CUSTOMER_RATE_LIMITS;
		expect(minute()).toBeNull();
		expect(mocks.background).toHaveLength(1);
	});

	it("bounds remembered denials", async () => {
		mocks.admit.mockResolvedValue({ allowed: false, limit: 25, remaining: 0, retryAfterSeconds: 60 });
		for (let index = 0; index < 10_050; index++) minute({ workspaceId: `workspace-${index}` });
		await settle();
		expect(__customerQuotaStateSizeForTests().denials).toBe(10_000);
		// The oldest scopes were evicted and are counted again.
		expect(minute({ workspaceId: "workspace-0" })).toBeNull();
		expect(minute({ workspaceId: "workspace-10049" })?.status).toBe(429);
	});

	it("applies RPD to actual free pricing, including models without a :free suffix", async () => {
		expect(guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") })).toBeNull();
		await settle();
		expect(mocks.admit).toHaveBeenCalledWith(customerScopeKey(args), "free-day", "server-admission", expect.any(Object));
	});

	it("counts one free admission per request across fallback attempts", async () => {
		mocks.admit.mockResolvedValue({ allowed: true, limit: 1500, remaining: 0, retryAfterSeconds: 3600 });
		expect(guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") })).toBeNull();
		await settle();
		// The same request's next attempt is already admitted; other requests are rejected.
		expect(guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") })).toBeNull();
		expect(guardFreeRouteQuota({ ...args, admissionId: "other-request", pricingCard: card("free", "0") })?.status).toBe(429);
		expect(mocks.admit).toHaveBeenCalledTimes(1);
	});

	it("does not apply RPD to paid, missing, or zero-price standard pricing", () => {
		for (const pricingCard of [card("standard", "0.01"), card("standard", "0"), null]) {
			expect(guardFreeRouteQuota({ ...args, pricingCard })).toBeNull();
		}
		expect(mocks.background).toHaveLength(0);
	});

	it.each([1500, 2500])("explains the effective %i free-model limit and recovery options", async (limit) => {
		mocks.admit.mockResolvedValue({ allowed: false, limit, remaining: 0, retryAfterSeconds: 3600 });
		guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
		await settle();
		const response = guardFreeRouteQuota({ ...args, admissionId: "next", pricingCard: card("free", "0") });
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("3600");
		expect(await response?.json()).toMatchObject({
			reason: "free_requests_per_day",
			description: `This user and workspace have reached their daily allowance of ${limit} free-model requests, shared across all free models. The allowance resets at 00:00 UTC. Retry after 3600 seconds, choose a paid model, or ask your workspace administrator to request a higher limit.`,
		});
	});

	it("keeps minute and free-model denials independent", async () => {
		mocks.admit.mockResolvedValue({ allowed: false, limit: 1500, remaining: 0, retryAfterSeconds: 3600 });
		guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
		await settle();
		expect(minute()).toBeNull();
	});

	it("preserves internal tests and supports an explicit rollout/rollback switch", () => {
		expect(guardCustomerQuota({ ...args, kind: "minute", internal: true })).toBeNull();
		mocks.bindings.CUSTOMER_RATE_LIMITS_ENABLED = "false";
		expect(guardCustomerQuota({ ...args, kind: "minute" })).toBeNull();
		expect(mocks.background).toHaveLength(0);
	});

	it("accepts partial overrides and rejects invalid quota values", () => {
		expect(parseCustomerLimits({ requestsPerMinute: 250 })).toEqual({ requestsPerMinute: 250, freeRequestsPerDay: 1500 });
		for (const value of [0, -1, 1.5, "25", null, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => parseCustomerLimits({ requestsPerMinute: value })).toThrow();
		}
	});
});

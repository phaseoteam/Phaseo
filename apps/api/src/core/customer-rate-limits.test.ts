import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bindings: {} as Record<string, unknown>, admit: vi.fn(), getByName: vi.fn() }));
vi.mock("@/runtime/env", () => ({ getBindingsIfConfigured: () => mocks.bindings }));

import { customerScopeKey, guardCustomerQuota, guardFreeRouteQuota, parseCustomerLimits } from "./customer-rate-limits";
import type { PriceCard } from "@pipeline/pricing/types";

const args = { workspaceId: "workspace", userId: "owner", requestId: "public-request", admissionId: "server-admission" };
function card(plan: string, price: string) {
	return { rules: [{ pricing_plan: plan, price_per_unit: price }] } as PriceCard;
}

beforeEach(() => {
	mocks.admit.mockReset().mockResolvedValue({ allowed: true, limit: 25, remaining: 24, retryAfterSeconds: 0 });
	mocks.getByName.mockReset().mockReturnValue({ admit: mocks.admit });
	mocks.bindings = { CUSTOMER_RATE_LIMITS_ENABLED: "true", CUSTOMER_RATE_LIMITS: { getByName: mocks.getByName } };
});

describe("customer quota integration", () => {
	it("uses the authenticated owner/workspace, sharing keys but isolating users and workspaces", () => {
		expect(customerScopeKey(args)).toBe("customer-quota:v1:workspace:owner");
		expect(customerScopeKey({ ...args, userId: "other" })).not.toBe(customerScopeKey(args));
		expect(customerScopeKey({ ...args, workspaceId: "other" })).not.toBe(customerScopeKey(args));
		expect(customerScopeKey({ workspaceId: "workspace" })).toBe("customer-quota:v1:workspace:workspace");
	});

	it("applies RPD to actual free pricing, including models without a :free suffix", async () => {
		await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
		expect(mocks.admit).toHaveBeenCalledWith(customerScopeKey(args), "free-day", "server-admission");
	});

	it("does not apply RPD to paid, missing, or zero-price standard pricing", async () => {
		for (const pricingCard of [card("standard", "0.01"), card("standard", "0"), null]) {
			expect(await guardFreeRouteQuota({ ...args, pricingCard })).toBeNull();
		}
		expect(mocks.admit).not.toHaveBeenCalled();
	});

	it("returns 429 with the existing retry header and error contract", async () => {
		mocks.admit.mockResolvedValue({ allowed: false, limit: 25, remaining: 0, retryAfterSeconds: 42 });
		const response = await guardCustomerQuota({ ...args, kind: "minute" });
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("42");
		expect(await response?.json()).toMatchObject({ reason: "customer_requests_per_minute", request_id: "public-request" });
	});

	it("fails closed on missing bindings or coordinator failure", async () => {
		mocks.admit.mockRejectedValue(new Error("unavailable"));
		expect((await guardCustomerQuota({ ...args, kind: "minute" }))?.status).toBe(503);
		delete mocks.bindings.CUSTOMER_RATE_LIMITS;
		expect((await guardCustomerQuota({ ...args, kind: "minute" }))?.status).toBe(503);
	});

	it.each([1500, 2500])("explains the effective %i free-model limit and recovery options", async (limit) => {
		mocks.admit.mockResolvedValue({ allowed: false, limit, remaining: 0, retryAfterSeconds: 3600 });
		const response = await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("3600");
		expect(await response?.json()).toMatchObject({
			reason: "free_requests_per_day",
			description: `This user and workspace have reached their daily allowance of ${limit} free-model requests, shared across all free models. The allowance resets at 00:00 UTC. Retry after 3600 seconds, choose a paid model, or ask your workspace administrator to request a higher limit.`,
		});
	});

	it("preserves internal tests and supports an explicit rollout/rollback switch", async () => {
		expect(await guardCustomerQuota({ ...args, kind: "minute", internal: true })).toBeNull();
		mocks.bindings.CUSTOMER_RATE_LIMITS_ENABLED = "false";
		expect(await guardCustomerQuota({ ...args, kind: "minute" })).toBeNull();
		expect(mocks.admit).not.toHaveBeenCalled();
	});

	it("accepts partial overrides and rejects invalid quota values", () => {
		expect(parseCustomerLimits({ requestsPerMinute: 250 })).toEqual({ requestsPerMinute: 250, freeRequestsPerDay: 1500 });
		for (const value of [0, -1, 1.5, "25", null, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => parseCustomerLimits({ requestsPerMinute: value })).toThrow();
		}
	});
});

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
	customerScopeKey, FREE_DAY_ADMIT_DEADLINE_MS, FREE_DAY_PROVISIONAL_PER_DAY, freeDayScopeKey, guardCustomerQuota, guardFreeRouteQuota, parseCustomerLimits,
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

	it("keys the free-model daily allowance on the user, so new workspaces do not multiply it", async () => {
		expect(freeDayScopeKey(args)).toBe("customer-quota:v1:user:owner");
		expect(freeDayScopeKey({ ...args, workspaceId: "another-workspace" })).toBe(freeDayScopeKey(args));
		expect(freeDayScopeKey({ ...args, userId: "other" })).not.toBe(freeDayScopeKey(args));
		// Without a user the workspace scope applies.
		expect(freeDayScopeKey({ workspaceId: "workspace" })).toBe(customerScopeKey({ workspaceId: "workspace" }));

		mocks.admit.mockResolvedValue({ allowed: false, limit: 1500, remaining: 0, retryAfterSeconds: 3600 });
		expect((await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") }))?.status).toBe(429);
		// The same user in a freshly created workspace is still out of free requests: the shared counter says so.
		expect((await guardFreeRouteQuota({ ...args, workspaceId: "new-workspace", admissionId: "next", pricingCard: card("free", "0") }))?.status).toBe(429);
		expect(mocks.admit).toHaveBeenCalledTimes(2);
		expect(mocks.getByName.mock.calls.every(([key]) => key === "customer-quota:v1:user:owner")).toBe(true);
		// The per-minute limit stays per workspace and user.
		minute({ workspaceId: "new-workspace" });
		await settle();
		expect(mocks.getByName).toHaveBeenLastCalledWith(customerScopeKey({ ...args, workspaceId: "new-workspace" }));
	});

	it("applies each workspace's own free-model limit to the user's shared count", async () => {
		mocks.bindings = { ...mocks.bindings, CUSTOMER_RATE_LIMIT_LADDER_ENABLED: "true" };
		mocks.readLimits.mockImplementation(async (workspaceId: string) => ({ tier: "trusted", requestsPerMinute: 60, freeRequestsPerDay: workspaceId === "raised" ? 9000 : 1500 }));
		// The counter has 2,000 requests for this user: over 1,500, under 9,000.
		mocks.admit.mockImplementation(async (_key: string, _kind: string, _id: string, limits: { freeRequestsPerDay?: number }) => (limits.freeRequestsPerDay ?? 0) > 2000
			? { allowed: true, limit: limits.freeRequestsPerDay, remaining: (limits.freeRequestsPerDay ?? 0) - 2001, retryAfterSeconds: 0 }
			: { allowed: false, limit: limits.freeRequestsPerDay, remaining: 0, retryAfterSeconds: 3600 });
		const free = (workspaceId: string, admissionId: string) => guardFreeRouteQuota({ ...args, workspaceId, admissionId, pricingCard: card("free", "0") });

		expect((await free("workspace", "a1"))?.status).toBe(429);
		// A denial remembered for the 1,500 workspace doesn't block the 9,000 one.
		expect(await free("raised", "b1")).toBeNull();
		// And headroom learned from the 9,000 workspace doesn't admit requests in the 1,500 one.
		expect((await free("workspace", "a2"))?.status).toBe(429);
		expect(await free("raised", "b2")).toBeNull();
		await settle();
		// a2 is refused from the remembered 1,500 denial; b2 is admitted from 9,000 headroom and counted in the background.
		expect(mocks.admit.mock.calls.map((call) => call[3].freeRequestsPerDay)).toEqual([1500, 9000, 9000]);
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
		expect(mocks.readLimits).toHaveBeenCalledWith("workspace", "{}", false);
		expect(mocks.admit.mock.calls[1][3]).toEqual({ requestsPerMinute: 60, freeRequestsPerDay: 1500 });
		// Self-serve raises apply only with their own switch on.
		mocks.bindings.CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED = "true";
		minute();
		await settle();
		expect(mocks.readLimits).toHaveBeenLastCalledWith("workspace", "{}", true);
	});

	it("remembers a reported denial until the window frees up, then counts again", async () => {
		mocks.admit.mockResolvedValueOnce({ allowed: false, limit: 25, remaining: 0, retryAfterSeconds: 42 });
		expect(minute()).toBeNull();
		await settle();
		const response = minute();
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("42");
		expect(await response?.json()).toMatchObject({
			code: "key_limit_exceeded",
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
		expect(await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") })).toBeNull();
		expect(mocks.admit).toHaveBeenCalledWith(freeDayScopeKey(args), "free-day", "server-admission", expect.any(Object));
	});

	it("rejects an exhausted scope on its first request to a cold isolate", async () => {
		mocks.admit.mockResolvedValue({ allowed: false, limit: 1500, remaining: 0, retryAfterSeconds: 3600 });
		expect((await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") }))?.status).toBe(429);
		// Later requests are rejected locally without asking the counter again.
		expect((await guardFreeRouteQuota({ ...args, admissionId: "next", pricingCard: card("free", "0") }))?.status).toBe(429);
		expect(mocks.admit).toHaveBeenCalledTimes(1);
	});

	it("admits from reported headroom without waiting, and asks the counter again near the limit", async () => {
		mocks.admit.mockResolvedValueOnce({ allowed: true, limit: 1500, remaining: 21, retryAfterSeconds: 0 });
		expect(await guardFreeRouteQuota({ ...args, admissionId: "a", pricingCard: card("free", "0") })).toBeNull();
		// Plenty left: admitted immediately and counted in the background.
		mocks.admit.mockReturnValue(new Promise(() => {}));
		expect(await guardFreeRouteQuota({ ...args, admissionId: "b", pricingCard: card("free", "0") })).toBeNull();
		expect(mocks.background).toHaveLength(1);
		// At the margin the next request awaits the counter, which here reports the scope exhausted.
		mocks.admit.mockResolvedValueOnce({ allowed: false, limit: 1500, remaining: 0, retryAfterSeconds: 60 });
		expect((await guardFreeRouteQuota({ ...args, admissionId: "c", pricingCard: card("free", "0") }))?.status).toBe(429);
	});

	it("reports where a free admission spent its time: limits read, then the counter, or answered locally", async () => {
		mocks.bindings.CUSTOMER_RATE_LIMIT_LADDER_ENABLED = "true";
		mocks.readLimits.mockImplementation(async () => {
			vi.advanceTimersByTime(30);
			return { tier: "trusted", requestsPerMinute: 60, freeRequestsPerDay: 1500 };
		});
		mocks.admit.mockImplementationOnce(async () => {
			vi.advanceTimersByTime(25); // a warm Durable Object (a cold one is under "a counter that is starting up")
			return { allowed: true, limit: 1500, remaining: 900, retryAfterSeconds: 0 };
		});
		const counted: Record<string, unknown> = {};
		expect(await guardFreeRouteQuota({ ...args, admissionId: "a", pricingCard: card("free", "0"), timing: counted })).toBeNull();
		expect(counted).toEqual({ limitsMs: 30, counterMs: 25, waitMs: 55 });
		// Plenty of headroom left: answered in this isolate, nothing awaited.
		const local: Record<string, unknown> = {};
		expect(await guardFreeRouteQuota({ ...args, admissionId: "b", pricingCard: card("free", "0"), timing: local })).toBeNull();
		expect(local).toEqual({ local: true });
		// Paid models are not timed at all.
		const paid: Record<string, unknown> = {};
		await guardFreeRouteQuota({ ...args, admissionId: "c", pricingCard: card("standard", "1"), timing: paid });
		expect(paid).toEqual({});
	});

	it("reports the capped wait when the counter does not answer in time and the provisional slots are used", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.admit.mockReturnValue(new Promise(() => {}));
		for (const admissionId of ["p1", "p2"]) {
			const provisional = guardFreeRouteQuota({ ...args, admissionId, pricingCard: card("free", "0") });
			await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
			expect(await provisional).toBeNull();
		}
		const timing: Record<string, unknown> = {};
		const admitted = guardFreeRouteQuota({ ...args, pricingCard: card("free", "0"), timing });
		await vi.advanceTimersByTimeAsync(2_000);
		expect(await admitted).toBeNull();
		expect(timing.waitMs).toBe(2_000);
		expect(timing).not.toHaveProperty("counterMs");
		expect(timing).not.toHaveProperty("provisional");
	});

	it("fails open, as before, when the counter does not answer in time and the provisional slots are used", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.admit.mockReturnValue(new Promise(() => {}));
		for (const admissionId of ["p1", "p2"]) {
			const provisional = guardFreeRouteQuota({ ...args, admissionId, pricingCard: card("free", "0") });
			await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
			await provisional;
		}
		const admitted = guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
		await vi.advanceTimersByTimeAsync(2_000);
		expect(await admitted).toBeNull();
	});

	describe("a counter that is starting up", () => {
		const COLD_MS = 1_100;
		/** The counter's answer arrives COLD_MS after the call (a new scope's object starting). */
		const slowAdmit = (answer: { allowed: boolean; remaining: number; retryAfterSeconds: number }) =>
			mocks.admit.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ limit: 1500, ...answer }), COLD_MS)));
		const free = (admissionId: string, timing?: Record<string, unknown>) =>
			guardFreeRouteQuota({ ...args, admissionId, pricingCard: card("free", "0"), ...(timing ? { timing } : {}) });

		it("does not hold the request beyond the deadline, and still counts it", async () => {
			slowAdmit({ allowed: true, remaining: 1499, retryAfterSeconds: 0 });
			const timing: Record<string, unknown> = {};
			let settledAt: number | null = null;
			const started = Date.now();
			const admitted = free("first", timing).then((value) => { settledAt = Date.now() - started; return value; });
			await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
			expect(await admitted).toBeNull();
			expect(settledAt).toBe(FREE_DAY_ADMIT_DEADLINE_MS);
			expect(timing).toMatchObject({ provisional: true, waitMs: FREE_DAY_ADMIT_DEADLINE_MS });
			// The counter call keeps running and counts the request.
			expect(mocks.admit).toHaveBeenCalledWith(expect.any(String), "free-day", "first", expect.anything());
			await vi.advanceTimersByTimeAsync(COLD_MS);
			await settle();
			// Its answer (plenty left) is recorded: the next request is admitted locally at once.
			const next: Record<string, unknown> = {};
			expect(await free("second", next)).toBeNull();
			expect(next).toEqual({ local: true });
		});

		it("lets at most FREE_DAY_PROVISIONAL_PER_DAY requests past an exhausted allowance, however many arrive at once", async () => {
			slowAdmit({ allowed: false, remaining: 0, retryAfterSeconds: 3_600 });
			const results: Array<Response | null | "pending"> = Array.from({ length: 6 }, () => "pending");
			const requests = results.map((_, index) => free(`burst-${index}`).then((value) => { results[index] = value; }));
			await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
			// Two provisional admissions; the others keep waiting for the counter.
			expect(results.filter((value) => value === null)).toHaveLength(FREE_DAY_PROVISIONAL_PER_DAY);
			expect(results.filter((value) => value === "pending")).toHaveLength(6 - FREE_DAY_PROVISIONAL_PER_DAY);
			await vi.advanceTimersByTimeAsync(COLD_MS);
			await Promise.all(requests);
			await settle();
			expect(results.filter((value) => value instanceof Response && value.status === 429)).toHaveLength(6 - FREE_DAY_PROVISIONAL_PER_DAY);
			// The denial is remembered, and the used slots are not given back: no further overshoot today.
			const later = await free("later");
			expect(later?.status).toBe(429);
			expect(mocks.admit).toHaveBeenCalledTimes(6);
		});

		it("does not give slots back after a denial, even once the remembered denial has expired", async () => {
			slowAdmit({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
			for (const admissionId of ["d1", "d2"]) {
				const provisional = free(admissionId);
				await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
				expect(await provisional).toBeNull();
			}
			await vi.advanceTimersByTimeAsync(COLD_MS + 2_000);
			await settle();
			// The 1 s denial has expired and the counter is still slow: the request waits for its answer.
			const timing: Record<string, unknown> = {};
			const third = free("d3", timing);
			await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
			await vi.advanceTimersByTimeAsync(COLD_MS);
			expect((await third)?.status).toBe(429);
			expect(timing).not.toHaveProperty("provisional");
		});

		it("gives a slot back when the counter confirms the admission was within quota", async () => {
			slowAdmit({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
			for (let index = 0; index < 5; index += 1) {
				const timing: Record<string, unknown> = {};
				const request = free(`ok-${index}`, timing);
				await vi.advanceTimersByTimeAsync(FREE_DAY_ADMIT_DEADLINE_MS);
				expect(await request).toBeNull();
				expect(timing.provisional).toBe(true);
				await vi.advanceTimersByTimeAsync(COLD_MS);
				await settle();
			}
		});

		it("still rejects at once from a warm counter, without using a slot", async () => {
			mocks.admit.mockResolvedValue({ allowed: false, limit: 1500, remaining: 0, retryAfterSeconds: 3_600 });
			const timing: Record<string, unknown> = {};
			expect((await free("warm", timing))?.status).toBe(429);
			expect(timing).not.toHaveProperty("provisional");
		});

		it("uses a slot when the counter fails, and fails open as before once the slots are used", async () => {
			vi.spyOn(console, "warn").mockImplementation(() => {});
			mocks.admit.mockRejectedValue(new Error("object unavailable"));
			const timings = Array.from({ length: 3 }, () => ({} as Record<string, unknown>));
			for (const [index, timing] of timings.entries()) {
				expect(await free(`err-${index}`, timing)).toBeNull();
				await settle();
			}
			expect(timings.map((timing) => timing.provisional === true)).toEqual([true, true, false]);
		});
	});

	it("counts one free admission per request across fallback attempts", async () => {
		mocks.admit.mockResolvedValue({ allowed: true, limit: 1500, remaining: 0, retryAfterSeconds: 3600 });
		expect(await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") })).toBeNull();
		// The same request's next attempt is already admitted; other requests are rejected.
		expect(await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") })).toBeNull();
		expect((await guardFreeRouteQuota({ ...args, admissionId: "other-request", pricingCard: card("free", "0") }))?.status).toBe(429);
		expect(mocks.admit).toHaveBeenCalledTimes(1);
	});

	it("does not apply RPD to paid, missing, or private-model pricing", async () => {
		const privateModel = { ...card("standard", "0"), provider: "private-model" } as PriceCard;
		for (const pricingCard of [card("standard", "0.01"), privateModel, null]) {
			expect(await guardFreeRouteQuota({ ...args, pricingCard })).toBeNull();
		}
		expect(mocks.admit).not.toHaveBeenCalled();
		expect(mocks.background).toHaveLength(0);
	});

	// A $0 route admitted without credit must also count against the daily
	// free allowance, whatever service tier its SKU is labelled with.
	it("applies RPD to a $0 route labelled with the standard plan", async () => {
		expect(await guardFreeRouteQuota({ ...args, pricingCard: card("standard", "0") })).toBeNull();
		expect(mocks.admit).toHaveBeenCalledWith(freeDayScopeKey(args), "free-day", "server-admission", expect.any(Object));
	});

	it.each([1500, 2500])("explains the effective %i free-model limit and recovery options", async (limit) => {
		mocks.admit.mockResolvedValue({ allowed: false, limit, remaining: 0, retryAfterSeconds: 3600 });
		const response = await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("3600");
		expect(await response?.json()).toMatchObject({
			code: "phaseo_free_model_limit_exceeded",
			error_origin: "gateway",
			reason: "free_requests_per_day",
			description: `Phaseo free-model daily limit reached. This user has reached their daily allowance of ${limit} free-model requests, shared across all free models. The allowance resets at 00:00 UTC. Retry after 3600 seconds, choose a paid model, or ask your workspace administrator to request a higher limit.`,
		});
	});

	it("keeps minute and free-model denials independent", async () => {
		mocks.admit.mockResolvedValue({ allowed: false, limit: 1500, remaining: 0, retryAfterSeconds: 3600 });
		await guardFreeRouteQuota({ ...args, pricingCard: card("free", "0") });
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

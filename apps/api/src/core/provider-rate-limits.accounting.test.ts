import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	reconcileTokens: vi.fn(),
	recordTokens: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		PROVIDER_RATE_LIMITS: {
			getByName: () => ({
				reconcileTokens: mocks.reconcileTokens,
				recordTokens: mocks.recordTokens,
			}),
		},
	}),
	getSupabaseAdmin: () => ({
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: async () => ({
						data: {
							provider_id: "openai",
							tokens_per_minute: 10_000,
							headroom_bps: 500,
							enabled: true,
						},
						error: null,
					}),
				}),
			}),
		}),
	}),
}));

import {
	clearProviderRateLimitConfigCacheForTests,
	recordManagedProviderTokensOnce,
	releaseManagedProviderReservation,
	settleFailedManagedProviderReservation,
	type ProviderTokenReservation,
} from "./provider-rate-limits";

function context() {
	return { testingMode: false, requestId: "req_test", meta: {} } as any;
}

function reservation(id: string): ProviderTokenReservation {
	return {
		id,
		providerId: "openai",
		tokens: 500,
		minuteWindow: 1,
		dayWindow: 1,
	};
}

describe("provider token reservation accounting", () => {
	beforeEach(() => {
		clearProviderRateLimitConfigCacheForTests();
		mocks.reconcileTokens.mockReset().mockResolvedValue(undefined);
		mocks.recordTokens.mockReset().mockResolvedValue(undefined);
	});

	it("reconciles each attempt-scoped reservation exactly once", async () => {
		const ctx = context();
		const first = reservation("reservation-1");
		const second = reservation("reservation-2");

		await recordManagedProviderTokensOnce({ ctx, providerId: "openai", keySource: "gateway", usage: { total_tokens: 300 }, reservation: first });
		await recordManagedProviderTokensOnce({ ctx, providerId: "openai", keySource: "gateway", usage: { total_tokens: 300 }, reservation: first });
		await recordManagedProviderTokensOnce({ ctx, providerId: "openai", keySource: "gateway", usage: { total_tokens: 200 }, reservation: second });

		expect(mocks.reconcileTokens).toHaveBeenCalledTimes(2);
		expect(mocks.reconcileTokens).toHaveBeenNthCalledWith(1, first, 300);
		expect(mocks.reconcileTokens).toHaveBeenNthCalledWith(2, second, 200);
		expect(mocks.recordTokens).not.toHaveBeenCalled();
	});

	it("releases a reservation only when the caller proves no dispatch occurred", async () => {
		const value = reservation("reservation-release");
		await releaseManagedProviderReservation(value);
		expect(mocks.reconcileTokens).toHaveBeenCalledWith(value, 0);
	});

	it("keeps the conservative reservation when provider usage is unknown", async () => {
		await recordManagedProviderTokensOnce({
			ctx: context(),
			providerId: "openai",
			keySource: "gateway",
			usage: null,
			reservation: reservation("reservation-unknown"),
		});
		expect(mocks.reconcileTokens).not.toHaveBeenCalled();
	});

	it("releases reservations for upstream client rejections with no usage", async () => {
		const value = reservation("reservation-client-rejection");
		await settleFailedManagedProviderReservation({
			reservation: value,
			status: 400,
			usageCandidates: [null],
			upstreamRequestCount: 1,
		});
		expect(mocks.reconcileTokens).toHaveBeenCalledWith(value, 0);
	});

	it("reconciles failed responses when the provider reports token usage", async () => {
		const value = reservation("reservation-failed-with-usage");
		await settleFailedManagedProviderReservation({
			reservation: value,
			status: 400,
			usageCandidates: [null, { total_tokens: 37 }],
			upstreamRequestCount: 1,
		});
		expect(mocks.reconcileTokens).toHaveBeenCalledWith(value, 37);
	});

	it.each([408, 409, 425, 429, 499, 500, 503])("retains reservations for ambiguous status %s", async (status) => {
		await settleFailedManagedProviderReservation({
			reservation: reservation(`reservation-ambiguous-${status}`),
			status,
			usageCandidates: [null],
			upstreamRequestCount: 1,
		});
		expect(mocks.reconcileTokens).not.toHaveBeenCalled();
	});

	it("retains a client-rejection reservation after multiple upstream dispatches", async () => {
		await settleFailedManagedProviderReservation({
			reservation: reservation("reservation-multiple-dispatches"),
			status: 400,
			usageCandidates: [null],
			upstreamRequestCount: 2,
		});
		expect(mocks.reconcileTokens).not.toHaveBeenCalled();
	});
});

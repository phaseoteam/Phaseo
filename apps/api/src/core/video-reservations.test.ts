import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";

const state = vi.hoisted(() => ({
	reserveCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@core/wallet-reservations", () => ({
	reserveWalletCredits: vi.fn(async (args: Record<string, unknown>) => {
		state.reserveCalls.push(args);
		return { status: "held", applied: true, alreadyApplied: false };
	}),
}));

import { isInsufficientVideoReservationStatus, reserveVideoGenerationCredits } from "./video-reservations";

function makeCard(rules: Array<Record<string, unknown>>): PriceCard {
	return {
		provider: "openai",
		model: "openai/sora",
		endpoint: "video.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: rules as any,
	};
}

describe("reserveVideoGenerationCredits", () => {
	beforeEach(() => {
		state.reserveCalls = [];
	});

	it("classifies wallet insufficient-credit statuses consistently", () => {
		expect(isInsufficientVideoReservationStatus("insufficient_funds")).toBe(true);
		expect(isInsufficientVideoReservationStatus("insufficient_balance")).toBe(true);
		expect(isInsufficientVideoReservationStatus("held")).toBe(false);
		expect(isInsufficientVideoReservationStatus(null)).toBe(false);
	});

	it("holds credits when video pricing matches a paid rule", async () => {
		const result = await reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve",
			videoId: "video_paid_123",
			providerId: "openai",
			model: "openai/sora",
			seconds: 6,
			pricingCard: makeCard([
				{
					pricing_plan: "standard",
					meter: "output_video_seconds",
					unit: "second",
					unit_size: 1,
					price_per_unit: "0.05",
					currency: "USD",
					match: [{ path: "video_params.resolution", op: "eq", value: "720p" }],
					priority: 100,
				},
			]),
			requestOptions: {
				resolution: "720p",
			},
		});

		expect(result).toMatchObject({
			reservationId: "video_hold:video_paid_123",
			held: true,
			amountNanos: 300_000_000,
			status: "held",
		});
		expect(state.reserveCalls).toEqual([
			{
				workspaceId: "ws_video_reserve",
				reservationId: "video_hold:video_paid_123",
				amountNanos: 300_000_000,
				holdRefId: "video_paid_123",
			},
		]);
	});

	it("allows matched free video pricing without a wallet hold", async () => {
		const result = await reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve",
			videoId: "video_free_123",
			providerId: "openai",
			model: "openai/sora",
			seconds: 6,
			pricingCard: makeCard([
				{
					pricing_plan: "standard",
					meter: "output_video_seconds",
					unit: "second",
					unit_size: 1,
					price_per_unit: "0",
					currency: "USD",
					match: [{ path: "video_params.resolution", op: "eq", value: "preview" }],
					priority: 100,
				},
				{
					pricing_plan: "standard",
					meter: "output_video_seconds",
					unit: "second",
					unit_size: 1,
					price_per_unit: "0.05",
					currency: "USD",
					match: [{ path: "video_params.resolution", op: "eq", value: "720p" }],
					priority: 90,
				},
			]),
			requestOptions: {
				resolution: "preview",
			},
		});

		expect(result).toMatchObject({
			reservationId: "video_hold:video_free_123",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		});
		expect((result.pricedUsage as any)?.pricing?.lines).toHaveLength(1);
		expect(state.reserveCalls).toEqual([]);
	});

	it("fails closed when a positive video price card has no matching rule", async () => {
		const result = await reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve",
			videoId: "video_unmatched_123",
			providerId: "openai",
			model: "openai/sora",
			seconds: 6,
			pricingCard: makeCard([
				{
					pricing_plan: "standard",
					meter: "output_video_seconds",
					unit: "second",
					unit_size: 1,
					price_per_unit: "0.05",
					currency: "USD",
					match: [{ path: "video_params.resolution", op: "eq", value: "1080p" }],
					priority: 100,
				},
			]),
			requestOptions: {
				resolution: "720p",
			},
		});

		expect(result).toMatchObject({
			reservationId: "video_hold:video_unmatched_123",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		});
		expect((result.pricedUsage as any)?.pricing?.lines).toEqual([]);
		expect(state.reserveCalls).toEqual([]);
	});
});

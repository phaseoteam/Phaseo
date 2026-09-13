import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "@pipeline/pricing/types";

const state = vi.hoisted(() => ({
	reserveCalls: [] as Array<Record<string, unknown>>,
	status: "held",
}));

vi.mock("@core/wallet-reservations", () => ({
	reserveWalletCredits: vi.fn(async (args: Record<string, unknown>) => {
		state.reserveCalls.push(args);
		return { status: state.status, applied: state.status === "held", alreadyApplied: false };
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
	it("rejects an input-only subtotal before reserving or submitting a video", async () => {
		const base = { unit_size: 1, currency: "USD", pricing_plan: "standard" };
		await expect(reserveVideoGenerationCredits({
			workspaceId: "ws_test", keyId: "key_test", videoId: "video_test", providerId: "test", model: "test",
			seconds: 4, requestOptions: { resolution: "4k", input_image_count: 1 },
			pricingCard: makeCard([
				{ ...base, meter: "input_image", unit: "image", price_per_unit: "0.01", match: [] },
				{ ...base, meter: "output_video_seconds", unit: "second", price_per_unit: "0.1",
					match: [{ path: "resolution", op: "eq", value: "720p" }] },
			]),
		})).rejects.toThrow("pricing_rule_missing:output_video_seconds");
		expect(state.reserveCalls).toEqual([]);
	});
	beforeEach(() => {
		state.reserveCalls = [];
		state.status = "held";
	});

	it.each([
		["daily_cost_limit_reached", 429, "key_limit_exceeded"],
		["monthly_request_limit_reached", 429, "key_limit_exceeded"],
		["workspace_lifetime_cost_budget_reached", 429, "workspace_budget_exceeded"],
		["insufficient_funds", 402, "insufficient_funds"],
		["key_not_active", 401, "invalid_api_key"],
	] as const)("reports %s as a local admission rejection", async (reason, status, code) => {
		state.status = reason;
		const onReservationDenied = vi.fn();
		const result = await reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve", keyId: "key_video", videoId: "denied", providerId: "google", model: "video",
			seconds: 4, pricingCard: makeCard([{ pricing_plan: "standard", meter: "output_video_seconds", unit: "second", unit_size: 1, price_per_unit: "0.05", currency: "USD", match: [], priority: 100 }]),
			onReservationDenied,
		});
		expect(result.held).toBe(false);
		expect(onReservationDenied).toHaveBeenCalledWith({ status, code, reason });
	});

	it("requires the authenticated key before any reservation", async () => {
		await expect(reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve", videoId: "missing_key", providerId: "openai", model: "openai/sora",
		})).rejects.toThrow("video_reservation_key_required");
		expect(state.reserveCalls).toEqual([]);
	});

	it("classifies wallet insufficient-credit statuses consistently", () => {
		expect(isInsufficientVideoReservationStatus("insufficient_funds")).toBe(true);
		expect(isInsufficientVideoReservationStatus("insufficient_balance")).toBe(true);
		expect(isInsufficientVideoReservationStatus("held")).toBe(false);
		expect(isInsufficientVideoReservationStatus(null)).toBe(false);
	});

	it.each(["api_key", "oauth"] as const)("holds paid video credits for %s authentication", async (authMethod) => {
		const result = await reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve",
			keyId: "key_video",
			videoId: "video_paid_123",
			authMethod,
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
				...(authMethod === "api_key" ? { keyId: "key_video", requestCount: 1 } : {}),
			},
		]);
	});

	it("allows matched free video pricing without a wallet hold", async () => {
		const result = await reserveVideoGenerationCredits({
			workspaceId: "ws_video_reserve",
			keyId: "key_video",
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
			keyId: "key_video",
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

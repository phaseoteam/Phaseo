// Purpose: Estimate and reserve video generation credits at job creation time.
// Why: Async video billing should hold funds when the job is accepted upstream.
// How: Computes quoted cost from pricing cards and records a wallet reservation.

import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { applyByokServiceFee } from "@pipeline/pricing/byok-fee";
import { reserveWalletCredits } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

export const VIDEO_RESERVATION_PREFIX = "video_hold:";

export type VideoReservationResult = {
	reservationId: string;
	held: boolean;
	amountNanos: number;
	status: string;
	pricedUsage?: Record<string, unknown>;
};

function toPositiveNumber(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return parsed;
}

function normalizeRequestOptions(source?: Record<string, unknown>): Record<string, unknown> {
	if (!source) return {};
	return Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0),
	);
}

export async function reserveVideoGenerationCredits(args: {
	teamId: string;
	videoId: string;
	providerId: string;
	model: string;
	seconds?: number | null;
	pricingCard?: PriceCard | null;
	requestOptions?: Record<string, unknown>;
	isByok?: boolean;
}): Promise<VideoReservationResult> {
	const reservationId = `${VIDEO_RESERVATION_PREFIX}${args.videoId}`;
	const seconds = toPositiveNumber(args.seconds);
	if (!seconds || !args.pricingCard) {
		return {
			reservationId,
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
	}

	const pricedBase = computeBill(
		{ output_video_seconds: seconds },
		args.pricingCard,
		{
			...normalizeRequestOptions(args.requestOptions),
			...buildVideoPricingRequestOptions({
				resolution: (args.requestOptions as any)?.resolution ?? (args.requestOptions as any)?.video_params?.resolution,
				quality: (args.requestOptions as any)?.quality ?? (args.requestOptions as any)?.video_params?.quality,
				video_params: (args.requestOptions as any)?.video_params,
			}),
			model: args.model,
		},
	);
	const byokAdjusted = await applyByokServiceFee({
		teamId: args.teamId,
		isByok: Boolean(args.isByok),
		baseCostNanos: Number(pricedBase?.pricing?.total_nanos ?? 0) || 0,
		pricedUsage: pricedBase,
		currencyHint: "USD",
	});
	const totalNanos = Math.max(0, Number(byokAdjusted.totalNanos ?? 0) || 0);
	if (totalNanos <= 0) {
		return {
			reservationId,
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
			pricedUsage: byokAdjusted.pricedUsage as Record<string, unknown>,
		};
	}

	const reserved = await reserveWalletCredits({
		teamId: args.teamId,
		reservationId,
		amountNanos: totalNanos,
		holdRefId: args.videoId,
	});

	return {
		reservationId,
		held: reserved.status === "held" && (reserved.applied || reserved.alreadyApplied),
		amountNanos: totalNanos,
		status: reserved.status,
		pricedUsage: byokAdjusted.pricedUsage as Record<string, unknown>,
	};
}

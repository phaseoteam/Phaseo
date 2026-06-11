// Purpose: Estimate and reserve video generation credits at job creation time.
// Why: Async video billing should hold funds when the job is accepted upstream.
// How: Computes quoted cost from pricing cards and records a wallet reservation.

import type { PriceCard } from "@pipeline/pricing/types";
import { applyByokServiceFee } from "@pipeline/pricing/byok-fee";
import { reserveWalletCredits } from "@core/wallet-reservations";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { computeVideoPricedUsage } from "@core/video-pricing";

export const VIDEO_RESERVATION_PREFIX = "video_hold:";

export type VideoReservationResult = {
	reservationId: string;
	held: boolean;
	amountNanos: number;
	status: string;
	pricedUsage?: Record<string, unknown>;
};

export function isInsufficientVideoReservationStatus(status: unknown): boolean {
	const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
	return normalized === "insufficient_funds" || normalized === "insufficient_balance";
}

function toPositiveNumber(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return parsed;
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function extractPricedTotalNanos(pricedUsage: Record<string, unknown>): number {
	const pricing =
		pricedUsage.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	return Math.max(0, Math.round(toFiniteNumber(pricing?.total_nanos ?? pricedUsage.total_nanos) ?? 0));
}

function hasPricingLines(pricedUsage: Record<string, unknown>): boolean {
	const pricing =
		pricedUsage.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	return Array.isArray(pricing?.lines) && pricing.lines.length > 0;
}

function hasPositiveVideoPricingRule(card: PriceCard): boolean {
	return card.rules.some((rule) => {
		const meter = String((rule as any)?.meter ?? "").trim().toLowerCase();
		if (meter !== "output_video_seconds" && meter !== "output_video" && meter !== "total_tokens") return false;
		return (toFiniteNumber((rule as any)?.price_per_unit) ?? 0) > 0;
	});
}

export async function reserveVideoGenerationCredits(args: {
	workspaceId: string;
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

	const pricedBase = computeVideoPricedUsage({
		seconds,
		card: args.pricingCard,
		model: args.model,
		requestOptions: {
			...(args.requestOptions ?? {}),
			...buildVideoPricingRequestOptions({
				size: (args.requestOptions as any)?.size ?? (args.requestOptions as any)?.video_params?.size,
				resolution: (args.requestOptions as any)?.resolution ?? (args.requestOptions as any)?.video_params?.resolution,
				input_resolution:
					(args.requestOptions as any)?.input_resolution ?? (args.requestOptions as any)?.video_params?.input_resolution,
				seconds:
					(args.requestOptions as any)?.seconds ??
					(args.requestOptions as any)?.duration_seconds ??
					(args.requestOptions as any)?.video_params?.seconds ??
					(args.requestOptions as any)?.video_params?.duration_seconds ??
					seconds,
				quality: (args.requestOptions as any)?.quality ?? (args.requestOptions as any)?.video_params?.quality,
				video_params: (args.requestOptions as any)?.video_params,
			}),
		},
	});
	const baseTotalNanos = extractPricedTotalNanos(pricedBase as Record<string, unknown>);
	if (baseTotalNanos <= 0 && !hasPricingLines(pricedBase as Record<string, unknown>) && hasPositiveVideoPricingRule(args.pricingCard)) {
		return {
			reservationId,
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
			pricedUsage: pricedBase as Record<string, unknown>,
		};
	}
	const byokAdjusted = await applyByokServiceFee({
		workspaceId: args.workspaceId,
		isByok: Boolean(args.isByok),
		baseCostNanos: baseTotalNanos,
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
		workspaceId: args.workspaceId,
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

// Purpose: Shared helpers for video pricing usage calculation.
// Why: Some providers use output_video_seconds while others use legacy output_video meters.
// How: Compute primary per-second billing first, then safely fall back to legacy per-video billing.

import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";

function normalizeRequestOptions(source?: Record<string, unknown>): Record<string, unknown> {
	if (!source) return {};
	return Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0),
	);
}

function toFiniteNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function getPricedTotalNanos(pricedUsage: Record<string, unknown> | null | undefined): number {
	if (!pricedUsage) return 0;
	const pricing =
		pricedUsage.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	const breakdown =
		pricedUsage.pricing_breakdown &&
		typeof pricedUsage.pricing_breakdown === "object" &&
		!Array.isArray(pricedUsage.pricing_breakdown)
			? (pricedUsage.pricing_breakdown as Record<string, unknown>)
			: null;
	return (
		toFiniteNumber(pricing?.total_nanos) ??
		toFiniteNumber(pricedUsage.total_nanos) ??
		toFiniteNumber(breakdown?.total_nanos) ??
		0
	);
}

function hasLegacyOutputVideoMeter(card: PriceCard): boolean {
	return card.rules.some((rule) => String((rule as any)?.meter ?? "").toLowerCase() === "output_video");
}

function normalizeLegacyResolution(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const pMatch = trimmed.match(/^(\d+)\s*p$/i);
	if (pMatch) return `${pMatch[1]}P`;
	return trimmed;
}

function buildRequestContext(args: {
	seconds: number;
	model: string;
	requestOptions?: Record<string, unknown>;
	normalizeLegacyResolutionCase?: boolean;
}): Record<string, unknown> {
	const source = args.requestOptions ?? {};
	const sizeRaw =
		source.size ??
		source.resolution ??
		source.input_resolution ??
		(source as any)?.video_params?.size ??
		(source as any)?.video_params?.resolution ??
		(source as any)?.video_params?.input_resolution;
	const resolution = args.normalizeLegacyResolutionCase
		? normalizeLegacyResolution(sizeRaw) ?? (typeof sizeRaw === "string" ? sizeRaw : undefined)
		: (typeof sizeRaw === "string" ? sizeRaw : undefined);
	const qualityRaw = source.quality ?? (source as any)?.video_params?.quality;
	const quality = typeof qualityRaw === "string" ? qualityRaw : undefined;
	const normalizedOptions = normalizeRequestOptions(source);

	return {
		...normalizedOptions,
		...buildVideoPricingRequestOptions({
			size: resolution,
			resolution,
			input_resolution: resolution,
			seconds:
				(source as any)?.seconds ??
				(source as any)?.duration_seconds ??
				(source as any)?.video_params?.seconds ??
				(source as any)?.video_params?.duration_seconds ??
				args.seconds,
			quality,
			video_params: (source as any)?.video_params,
		}),
		model: args.model,
	};
}

export function computeVideoPricedUsage(args: {
	seconds: number;
	card: PriceCard;
	model: string;
	requestOptions?: Record<string, unknown>;
}): Record<string, unknown> {
	const primaryContext = buildRequestContext({
		seconds: args.seconds,
		model: args.model,
		requestOptions: args.requestOptions,
	});
	let priced = computeBill(
		{ output_video_seconds: args.seconds },
		args.card,
		primaryContext,
	);
	if (getPricedTotalNanos(priced as Record<string, unknown>) > 0) {
		return priced as Record<string, unknown>;
	}
	if (!hasLegacyOutputVideoMeter(args.card)) {
		return priced as Record<string, unknown>;
	}

	const legacyContext = buildRequestContext({
		seconds: args.seconds,
		model: args.model,
		requestOptions: args.requestOptions,
		normalizeLegacyResolutionCase: true,
	});
	priced = computeBill(
		{ output_video: 1 },
		args.card,
		legacyContext,
	);
	return priced as Record<string, unknown>;
}


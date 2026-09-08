// Purpose: Shared helpers for video pricing usage calculation.
// Why: Some providers use output_video_seconds while others use legacy output_video meters.
// How: Compute primary per-second billing first, then safely fall back to legacy per-video billing.

import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { buildVideoPricingRequestOptions, resolveVideoOutputCount } from "@core/video-request-options";

const DEFAULT_VIDEO_FRAME_RATE = 24;
const SEEDANCE_MIN_TOKENS_480P: Record<number, number> = {
	4: 70308,
	5: 90396,
	6: 100440,
	7: 120528,
};
const SEEDANCE_MIN_TOKENS_720P: Record<number, number> = {
	4: 151200,
	5: 194400,
	6: 216000,
	7: 259200,
};
const SEEDANCE_25_DIMENSIONS = {
	"480p": {
		"16:9": { width: 854, height: 480 },
		"9:16": { width: 480, height: 854 },
		"4:3": { width: 752, height: 560 },
		"3:4": { width: 560, height: 752 },
		"1:1": { width: 640, height: 640 },
		"21:9": { width: 992, height: 432 },
	},
	"720p": {
		"16:9": { width: 1280, height: 720 },
		"9:16": { width: 720, height: 1280 },
		"4:3": { width: 1112, height: 834 },
		"3:4": { width: 834, height: 1112 },
		"1:1": { width: 960, height: 960 },
		"21:9": { width: 1470, height: 630 },
	},
} as const;

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
	return hasMeter(card, "output_video");
}

function hasMeter(card: PriceCard, meter: string): boolean {
	const normalizedMeter = meter.trim().toLowerCase();
	return card.rules.some((rule) => String((rule as any)?.meter ?? "").trim().toLowerCase() === normalizedMeter);
}

function normalizeLegacyResolution(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const pMatch = trimmed.match(/^(\d+)\s*p$/i);
	if (pMatch) return `${pMatch[1]}P`;
	return trimmed;
}

function parseDimensionsFromSize(value: unknown): { width: number; height: number } | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	const explicitMatch = trimmed.match(/^(\d+)\s*[x*]\s*(\d+)$/i);
	if (explicitMatch) {
		const width = Number(explicitMatch[1]);
		const height = Number(explicitMatch[2]);
		if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
			return { width, height };
		}
	}

	const pMatch = trimmed.match(/^(\d+)\s*p$/i);
	if (!pMatch) return undefined;
	const height = Number(pMatch[1]);
	if (!Number.isFinite(height) || height <= 0) return undefined;
	switch (height) {
		case 480:
			return { width: 854, height: 480 };
		case 720:
			return { width: 1280, height: 720 };
		case 1080:
			return { width: 1920, height: 1080 };
		default:
			return { width: Math.round(height * (16 / 9)), height };
	}
}

function isSeedance25Model(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	return normalized.includes("seedance-2-5") || normalized.includes("seedance-2.5");
}

function resolveStringOption(source: Record<string, unknown>, paths: string[]): string | undefined {
	for (const path of paths) {
		const [head, tail] = path.split(".", 2);
		if (!head) continue;
		const parent = (source as any)?.[head];
		const value = tail && parent && typeof parent === "object" && !Array.isArray(parent)
			? (parent as Record<string, unknown>)[tail]
			: tail
				? undefined
				: parent;
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function resolveSeedance25Dimensions(
	size: string,
	aspectRatio: string | undefined,
): { width: number; height: number } | undefined {
	const resolution = size.trim().toLowerCase() as keyof typeof SEEDANCE_25_DIMENSIONS;
	const dimensionsByRatio = SEEDANCE_25_DIMENSIONS[resolution];
	if (!dimensionsByRatio) return undefined;
	const ratio = (aspectRatio ?? "16:9").trim() as keyof typeof dimensionsByRatio;
	return dimensionsByRatio[ratio];
}

function resolveVideoDimensions(
	source: Record<string, unknown>,
	model: string,
): { width: number; height: number } | undefined {
	const size = resolveStringOption(source, [
		"size",
		"resolution",
		"input_resolution",
		"video_params.size",
		"video_params.resolution",
		"video_params.input_resolution",
	]);
	if (!size) return undefined;
	const explicitDimensions = parseDimensionsFromSize(size.match(/^\d+\s*[x*]\s*\d+$/i) ? size : undefined);
	if (explicitDimensions) return explicitDimensions;
	if (isSeedance25Model(model)) {
		const aspectRatio = resolveStringOption(source, [
			"aspect_ratio",
			"aspectRatio",
			"ratio",
			"video_params.aspect_ratio",
			"video_params.aspectRatio",
			"video_params.ratio",
		]);
		return resolveSeedance25Dimensions(size, aspectRatio);
	}
	return parseDimensionsFromSize(size);
}

function resolveNumericOption(source: Record<string, unknown>, path: string): number | undefined {
	const [head, tail] = path.split(".", 2);
	if (!head) return undefined;
	const topLevelValue = (source as any)?.[head];
	if (!tail) return toFiniteNumber(topLevelValue);
	if (!topLevelValue || typeof topLevelValue !== "object" || Array.isArray(topLevelValue)) return undefined;
	return toFiniteNumber((topLevelValue as Record<string, unknown>)[tail]);
}

function classifySeedanceResolutionTier(dimensions: { width: number; height: number }): "480p" | "720p" | null {
	const shortEdge = Math.min(dimensions.width, dimensions.height);
	const longEdge = Math.max(dimensions.width, dimensions.height);

	if (shortEdge >= 430 && shortEdge <= 530 && longEdge >= 760 && longEdge <= 960) {
		return "480p";
	}
	if (shortEdge >= 680 && shortEdge <= 760 && longEdge >= 1180 && longEdge <= 1320) {
		return "720p";
	}
	return null;
}

function resolveSeedanceMinTokenFloor(args: {
	model: string;
	outputSeconds: number;
	dimensions?: { width: number; height: number };
	hasInputVideo: boolean;
	frameRate: number;
}): number | undefined {
	if (!args.hasInputVideo || !args.dimensions) return undefined;
	const roundedSeconds = Math.round(args.outputSeconds);
	if (isSeedance25Model(args.model)) {
		if (roundedSeconds < 4 || roundedSeconds > 30) return undefined;
		const minimumCountedSeconds = Math.ceil((roundedSeconds * 5) / 3);
		return Math.round(
			(minimumCountedSeconds * args.dimensions.width * args.dimensions.height * args.frameRate) / 1024,
		);
	}
	if (![4, 5, 6, 7].includes(roundedSeconds)) return undefined;
	const tier = classifySeedanceResolutionTier(args.dimensions);
	if (tier === "480p") return SEEDANCE_MIN_TOKENS_480P[roundedSeconds];
	if (tier === "720p") return SEEDANCE_MIN_TOKENS_720P[roundedSeconds];
	return undefined;
}

function resolveEstimatedTotalTokens(args: {
	seconds: number;
	model: string;
	requestOptions?: Record<string, unknown>;
}): number | undefined {
	const source = args.requestOptions ?? {};
	const explicitTotalTokens =
		resolveNumericOption(source, "total_tokens") ??
		resolveNumericOption(source, "video_params.total_tokens");
	if (typeof explicitTotalTokens === "number" && explicitTotalTokens > 0) {
		return Math.round(explicitTotalTokens);
	}

	const dimensions = resolveVideoDimensions(source, args.model);
	if (!dimensions) return undefined;
	const frameRateRaw =
		resolveNumericOption(source, "frame_rate") ??
		resolveNumericOption(source, "video_params.frame_rate") ??
		DEFAULT_VIDEO_FRAME_RATE;
	const frameRate = Math.max(1, Math.trunc(frameRateRaw));
	const inputVideoSecondsRaw =
		resolveNumericOption(source, "input_video_seconds") ??
		resolveNumericOption(source, "video_params.input_video_seconds");
	const inputVideoCountRaw =
		resolveNumericOption(source, "input_video_count") ??
		resolveNumericOption(source, "video_params.input_video_count");
	const hasInputVideo = (inputVideoCountRaw ?? 0) > 0 || (inputVideoSecondsRaw ?? 0) > 0;
	const inferredInputVideoSeconds =
		typeof inputVideoSecondsRaw === "number" && inputVideoSecondsRaw >= 0
			? inputVideoSecondsRaw
			: hasInputVideo
				? args.seconds
				: 0;
	const combinedSeconds = Math.max(0, args.seconds) + Math.max(0, inferredInputVideoSeconds);
	if (combinedSeconds <= 0) return undefined;

	let estimatedTokens =
		(combinedSeconds * dimensions.width * dimensions.height * frameRate) / 1024;
	const minFloor = resolveSeedanceMinTokenFloor({
		model: args.model,
		outputSeconds: args.seconds,
		dimensions,
		hasInputVideo,
		frameRate,
	});
	if (typeof minFloor === "number") {
		estimatedTokens = Math.max(estimatedTokens, minFloor);
	}
	return Math.max(1, Math.round(estimatedTokens));
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
	const hasTotalTokensMeter = hasMeter(args.card, "total_tokens");
	const estimatedTotalTokens = hasTotalTokensMeter
		? resolveEstimatedTotalTokens({
			seconds: args.seconds,
			model: args.model,
			requestOptions: args.requestOptions,
		})
		: undefined;
	const primaryContext = buildRequestContext({
		seconds: args.seconds,
		model: args.model,
		requestOptions: args.requestOptions,
	});
	const pricingMode = resolveStringOption(args.requestOptions ?? {}, ["mode", "video_params.mode"]);
	const inputAudioSeconds = resolveNumericOption(args.requestOptions ?? {}, "input_audio_seconds") ?? resolveNumericOption(args.requestOptions ?? {}, "video_params.input_audio_seconds");
	const usesAudioMeter = pricingMode === "audio-to-video" && hasMeter(args.card, "input_audio_seconds");
	const usageMeters: Record<string, number> = usesAudioMeter && inputAudioSeconds
		? { input_audio_seconds: inputAudioSeconds }
		: { output_video_seconds: args.seconds };
	const outputVideoCount = resolveNumericOption(args.requestOptions ?? {}, "outputCount")
		?? resolveNumericOption(args.requestOptions ?? {}, "sampleCount")
		?? resolveNumericOption(args.requestOptions ?? {}, "sample_count");
	if (outputVideoCount && outputVideoCount > 0) usageMeters.output_video = Math.floor(outputVideoCount);
	const inputImageCount =
		resolveNumericOption(args.requestOptions ?? {}, "input_image_count") ??
		resolveNumericOption(args.requestOptions ?? {}, "video_params.input_image_count");
	const inputVideoSeconds =
		resolveNumericOption(args.requestOptions ?? {}, "input_video_seconds") ??
		resolveNumericOption(args.requestOptions ?? {}, "video_params.input_video_seconds");
	const inputVideoCount =
		resolveNumericOption(args.requestOptions ?? {}, "input_video_count") ??
		resolveNumericOption(args.requestOptions ?? {}, "video_params.input_video_count");
	if (typeof inputImageCount === "number" && inputImageCount > 0) usageMeters.input_image = inputImageCount;
	if (typeof inputVideoSeconds === "number" && inputVideoSeconds > 0) usageMeters.input_video_seconds = inputVideoSeconds;
	if (typeof inputVideoCount === "number" && inputVideoCount > 0) usageMeters.input_video_count = inputVideoCount;
	if (typeof estimatedTotalTokens === "number" && estimatedTotalTokens > 0) {
		usageMeters.total_tokens = estimatedTotalTokens;
	}
	let priced = computeBill(
		usageMeters,
		args.card,
		primaryContext,
	);
	const primaryMeters = usesAudioMeter
		? ["input_audio_seconds"]
		: ["output_video_seconds", "output_video", "total_tokens", "output_video_tokens", "output_video_frames"];
	const requiresPrimaryLine = primaryMeters.some((meter) => hasMeter(args.card, meter));
	const hasPrimaryLine = (result: Record<string, any>) =>
		Array.isArray(result.pricing?.lines) &&
		result.pricing.lines.some((line: any) => primaryMeters.includes(line.dimension));
	if (getPricedTotalNanos(priced as Record<string, unknown>) > 0 && (!requiresPrimaryLine || hasPrimaryLine(priced))) {
		return priced as Record<string, unknown>;
	}
	if (!hasLegacyOutputVideoMeter(args.card)) {
		if (getPricedTotalNanos(priced) > 0 && requiresPrimaryLine) {
			throw new Error("video_pricing_primary_rule_missing");
		}
		return priced as Record<string, unknown>;
	}

	const legacyContext = buildRequestContext({
		seconds: args.seconds,
		model: args.model,
		requestOptions: args.requestOptions,
		normalizeLegacyResolutionCase: true,
	});
	priced = computeBill(
		{ ...usageMeters, output_video: resolveVideoOutputCount(args.requestOptions ?? {}) },
		args.card,
		legacyContext,
	);
	if (getPricedTotalNanos(priced) > 0 && requiresPrimaryLine && !hasPrimaryLine(priced)) {
		throw new Error("video_pricing_primary_rule_missing");
	}
	return priced as Record<string, unknown>;
}

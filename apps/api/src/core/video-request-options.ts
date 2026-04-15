// Purpose: Normalize video request options for pricing/routing.
// Why: Providers expose different wire fields; billing must match one canonical path.
// How: Normalize video request options around canonical `size` and compatibility aliases.

type VideoOptionInput = {
	size?: unknown;
	resolution?: unknown;
	input_resolution?: unknown;
	seconds?: unknown;
	duration_seconds?: unknown;
	duration?: unknown;
	quality?: unknown;
	input_image_count?: unknown;
	input_video_seconds?: unknown;
	input_video_count?: unknown;
	frame_rate?: unknown;
	total_tokens?: unknown;
	video_params?: {
		size?: unknown;
		resolution?: unknown;
		input_resolution?: unknown;
		seconds?: unknown;
		duration_seconds?: unknown;
		duration?: unknown;
		quality?: unknown;
		input_image_count?: unknown;
		input_video_seconds?: unknown;
		input_video_count?: unknown;
		frame_rate?: unknown;
		total_tokens?: unknown;
	} | null;
};

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number(trimmed);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

function toNonNegativeNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number(trimmed);
		if (Number.isFinite(parsed) && parsed >= 0) return parsed;
	}
	return undefined;
}

export function resolveVideoSize(input: VideoOptionInput): string | undefined {
	return (
		toNonEmptyString(input.size) ??
		toNonEmptyString(input.resolution) ??
		toNonEmptyString(input.input_resolution) ??
		toNonEmptyString(input.video_params?.size) ??
		toNonEmptyString(input.video_params?.resolution) ??
		toNonEmptyString(input.video_params?.input_resolution)
	);
}

export function resolveVideoResolution(input: VideoOptionInput): string | undefined {
	return resolveVideoSize(input);
}

export function resolveVideoSeconds(input: VideoOptionInput): number | undefined {
	return (
		toPositiveNumber(input.seconds) ??
		toPositiveNumber(input.duration_seconds) ??
		toPositiveNumber(input.duration) ??
		toPositiveNumber(input.video_params?.seconds) ??
		toPositiveNumber(input.video_params?.duration_seconds) ??
		toPositiveNumber(input.video_params?.duration)
	);
}

export function resolveInputVideoSeconds(input: VideoOptionInput): number | undefined {
	return (
		toNonNegativeNumber(input.input_video_seconds) ??
		toNonNegativeNumber(input.video_params?.input_video_seconds)
	);
}

export function resolveInputVideoCount(input: VideoOptionInput): number | undefined {
	return (
		toNonNegativeNumber(input.input_video_count) ??
		toNonNegativeNumber(input.video_params?.input_video_count)
	);
}

export function resolveFrameRate(input: VideoOptionInput): number | undefined {
	return (
		toPositiveNumber(input.frame_rate) ??
		toPositiveNumber(input.video_params?.frame_rate)
	);
}

export function resolveTotalTokens(input: VideoOptionInput): number | undefined {
	return (
		toPositiveNumber(input.total_tokens) ??
		toPositiveNumber(input.video_params?.total_tokens)
	);
}

export function buildVideoPricingRequestOptions(input: VideoOptionInput): Record<string, unknown> {
	const size = resolveVideoSize(input);
	const seconds = resolveVideoSeconds(input);
	const quality = toNonEmptyString(input.quality) ?? toNonEmptyString(input.video_params?.quality);
	const inputImageCount =
		toNonNegativeNumber(input.input_image_count) ??
		toNonNegativeNumber(input.video_params?.input_image_count);
	const inputVideoSeconds = resolveInputVideoSeconds(input);
	const inputVideoCount = resolveInputVideoCount(input);
	const frameRate = resolveFrameRate(input);
	const totalTokens = resolveTotalTokens(input);
	const out: Record<string, unknown> = {};

	if (size) {
		out.size = size;
		// Keep legacy aliases while pricing migrates fully to canonical size.
		out.resolution = size;
		out.input_resolution = size;
		out.video_params = { resolution: size, input_resolution: size };
	}

	if (quality) {
		out.quality = quality;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.quality = quality;
		out.video_params = videoParams;
	}

	if (typeof seconds === "number") {
		out.seconds = seconds;
		out.duration_seconds = seconds;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.seconds = seconds;
		videoParams.duration_seconds = seconds;
		out.video_params = videoParams;
	}

	if (typeof inputImageCount === "number") {
		const normalizedCount = Math.max(0, Math.trunc(inputImageCount));
		out.input_image_count = normalizedCount;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.input_image_count = normalizedCount;
		out.video_params = videoParams;
	}

	if (typeof inputVideoSeconds === "number") {
		const normalizedSeconds = Math.max(0, inputVideoSeconds);
		out.input_video_seconds = normalizedSeconds;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.input_video_seconds = normalizedSeconds;
		out.video_params = videoParams;
	}

	if (typeof inputVideoCount === "number") {
		const normalizedCount = Math.max(0, Math.trunc(inputVideoCount));
		out.input_video_count = normalizedCount;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.input_video_count = normalizedCount;
		out.video_params = videoParams;
	}

	if (typeof frameRate === "number") {
		const normalizedFrameRate = Math.max(1, Math.trunc(frameRate));
		out.frame_rate = normalizedFrameRate;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.frame_rate = normalizedFrameRate;
		out.video_params = videoParams;
	}

	if (typeof totalTokens === "number") {
		const normalizedTotalTokens = Math.max(0, totalTokens);
		out.total_tokens = normalizedTotalTokens;
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.total_tokens = normalizedTotalTokens;
		out.video_params = videoParams;
	}

	return out;
}

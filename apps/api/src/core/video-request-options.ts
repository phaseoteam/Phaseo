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
	video_params?: {
		size?: unknown;
		resolution?: unknown;
		input_resolution?: unknown;
		seconds?: unknown;
		duration_seconds?: unknown;
		duration?: unknown;
		quality?: unknown;
		input_image_count?: unknown;
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

export function buildVideoPricingRequestOptions(input: VideoOptionInput): Record<string, unknown> {
	const size = resolveVideoSize(input);
	const seconds = resolveVideoSeconds(input);
	const quality = toNonEmptyString(input.quality) ?? toNonEmptyString(input.video_params?.quality);
	const inputImageCount = toPositiveNumber(input.input_image_count) ??
		(typeof input.input_image_count === "number" && Number.isFinite(input.input_image_count) && input.input_image_count === 0
			? 0
			: toPositiveNumber(input.video_params?.input_image_count) ??
				(typeof input.video_params?.input_image_count === "number" &&
				Number.isFinite(input.video_params.input_image_count) &&
				input.video_params.input_image_count === 0
					? 0
					: undefined));
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
		out.input_image_count = Math.max(0, Math.trunc(inputImageCount));
		const videoParams =
			out.video_params && typeof out.video_params === "object"
				? (out.video_params as Record<string, unknown>)
				: {};
		videoParams.input_image_count = Math.max(0, Math.trunc(inputImageCount));
		out.video_params = videoParams;
	}

	return out;
}

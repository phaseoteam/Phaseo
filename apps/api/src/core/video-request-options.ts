// Purpose: Normalize video request options for pricing/routing.
// Why: Providers expose different wire fields; billing must match one canonical path.
// How: Normalize video request options around canonical `size` and compatibility aliases.

type VideoOptionInput = {
	size?: unknown;
	resolution?: unknown;
	quality?: unknown;
	video_params?: {
		size?: unknown;
		resolution?: unknown;
		quality?: unknown;
	} | null;
};

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveVideoSize(input: VideoOptionInput): string | undefined {
	return (
		toNonEmptyString(input.size) ??
		toNonEmptyString(input.resolution) ??
		toNonEmptyString(input.video_params?.size) ??
		toNonEmptyString(input.video_params?.resolution)
	);
}

export function resolveVideoResolution(input: VideoOptionInput): string | undefined {
	return resolveVideoSize(input);
}

export function buildVideoPricingRequestOptions(input: VideoOptionInput): Record<string, unknown> {
	const size = resolveVideoSize(input);
	const quality = toNonEmptyString(input.quality) ?? toNonEmptyString(input.video_params?.quality);
	const out: Record<string, unknown> = {};

	if (size) {
		out.size = size;
		// Keep legacy aliases while pricing migrates fully to canonical size.
		out.resolution = size;
		out.video_params = { resolution: size };
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

	return out;
}

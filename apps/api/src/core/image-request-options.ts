// Purpose: Normalize image request options for pricing/routing.
// Why: Providers expose different wire fields; billing must match one canonical path.
// How: Normalize image request options around canonical `size` and compatibility aliases.

type ImageOptionInput = {
	size?: unknown;
	resolution?: unknown;
	quality?: unknown;
	image_params?: {
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

export function resolveImageSize(input: ImageOptionInput): string | undefined {
	return (
		toNonEmptyString(input.size) ??
		toNonEmptyString(input.resolution) ??
		toNonEmptyString(input.image_params?.size) ??
		toNonEmptyString(input.image_params?.resolution)
	);
}

export function resolveImageResolution(input: ImageOptionInput): string | undefined {
	return resolveImageSize(input);
}

export function buildImagePricingRequestOptions(input: ImageOptionInput): Record<string, unknown> {
	const size = resolveImageSize(input);
	const quality = toNonEmptyString(input.quality) ?? toNonEmptyString(input.image_params?.quality);
	const out: Record<string, unknown> = {};

	if (size) {
		out.size = size;
		// Keep legacy aliases while pricing migrates fully to canonical size.
		out.resolution = size;
		out.image_params = { resolution: size };
	}

	if (quality) {
		out.quality = quality;
		const imageParams =
			out.image_params && typeof out.image_params === "object"
				? (out.image_params as Record<string, unknown>)
				: {};
		imageParams.quality = quality;
		out.image_params = imageParams;
	}

	return out;
}

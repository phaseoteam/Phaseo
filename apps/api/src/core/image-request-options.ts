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

type ImagePricingUsage = {
	size?: unknown;
	resolution?: unknown;
	quality?: unknown;
	image_params?: {
		size?: unknown;
		resolution?: unknown;
		quality?: unknown;
	} | null;
	output_image_tokens?: unknown;
	output_tokens?: unknown;
	output_tokens_details?: {
		output_images?: unknown;
	} | null;
	completion_tokens_details?: {
		output_images?: unknown;
	} | null;
} | null | undefined;

const IMAGE_OUTPUT_VARIANTS = new Map<number, { quality: string; resolution: string }>([
	[272, { quality: "low", resolution: "1024x1024" }],
	[408, { quality: "low", resolution: "1024x1536" }],
	[400, { quality: "low", resolution: "1536x1024" }],
	[1056, { quality: "medium", resolution: "1024x1024" }],
	[1584, { quality: "medium", resolution: "1024x1536" }],
	[1568, { quality: "medium", resolution: "1536x1024" }],
	[4160, { quality: "high", resolution: "1024x1024" }],
	[6240, { quality: "high", resolution: "1024x1536" }],
	[6208, { quality: "high", resolution: "1536x1024" }],
]);

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOutputImageTokens(usage: ImagePricingUsage): number | undefined {
	if (!usage || typeof usage !== "object") return undefined;
	return (
		toFiniteNumber(usage.output_image_tokens) ??
		toFiniteNumber(usage.output_tokens_details?.output_images) ??
		toFiniteNumber(usage.completion_tokens_details?.output_images) ??
		toFiniteNumber(usage.output_tokens)
	);
}

function normalizeAutoOption(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return value.toLowerCase() === "auto" ? undefined : value;
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

export function inferImagePricingVariant(usage: ImagePricingUsage): { quality: string; resolution: string } | undefined {
	const outputImageTokens = readOutputImageTokens(usage);
	if (outputImageTokens == null) return undefined;
	return IMAGE_OUTPUT_VARIANTS.get(Math.round(outputImageTokens));
}

export function buildImagePricingRequestOptions(
	input: ImageOptionInput,
	usage?: ImagePricingUsage,
): Record<string, unknown> {
	const inferredVariant = inferImagePricingVariant(usage);
	const responseInput = usage && typeof usage === "object" ? (usage as ImageOptionInput) : {};
	const size =
		normalizeAutoOption(resolveImageSize(input)) ??
		normalizeAutoOption(resolveImageSize(responseInput)) ??
		inferredVariant?.resolution;
	const quality =
		normalizeAutoOption(toNonEmptyString(input.quality) ?? toNonEmptyString(input.image_params?.quality)) ??
		normalizeAutoOption(
			toNonEmptyString(responseInput.quality) ?? toNonEmptyString(responseInput.image_params?.quality),
		) ??
		inferredVariant?.quality;
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

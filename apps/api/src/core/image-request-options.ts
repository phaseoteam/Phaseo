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
	input_tokens?: unknown;
	input_text_tokens?: unknown;
	input_image_tokens?: unknown;
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
	input_tokens_details?: {
		text_tokens?: unknown;
		image_tokens?: unknown;
	} | null;
	output_tokens_details?: {
		output_images?: unknown;
		image_tokens?: unknown;
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
		toFiniteNumber(usage.output_tokens_details?.image_tokens) ??
		toFiniteNumber(usage.completion_tokens_details?.output_images) ??
		toFiniteNumber(usage.output_tokens)
	);
}

/**
 * The Images API reports generic input/output tokens even though GPT Image 2
 * uses them for image generation. Convert that provider shape to the canonical
 * image token meters before pricing it.
 */
export function normalizeOpenAIImageTokenUsage(usage: ImagePricingUsage): Record<string, unknown> {
	const meters: Record<string, unknown> = usage && typeof usage === "object" ? { ...usage } : { total_tokens: 0 };
	const inputTextTokens =
		toFiniteNumber(usage?.input_text_tokens) ??
		toFiniteNumber(usage?.input_tokens_details?.text_tokens) ??
		toFiniteNumber(usage?.input_tokens);
	const inputImageTokens =
		toFiniteNumber(usage?.input_image_tokens) ??
		toFiniteNumber(usage?.input_tokens_details?.image_tokens);
	const outputImageTokens = readOutputImageTokens(usage);

	if (inputTextTokens !== undefined) meters.input_text_tokens = inputTextTokens;
	if (inputImageTokens !== undefined) meters.input_image_tokens = inputImageTokens;
	if (outputImageTokens !== undefined) meters.output_image_tokens = outputImageTokens;
	delete meters.output_tokens;

	return meters;
}

function normalizeAutoOption(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return value.toLowerCase() === "auto" ? undefined : value;
}

function normalizeProviderImageSize(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const normalized = value.trim().toUpperCase();
	if (normalized === "512" || normalized === "1K" || normalized === "2K" || normalized === "4K") {
		return normalized;
	}
	return undefined;
}

function parsePixelDimensions(value: string | undefined): { width: number; height: number } | undefined {
	if (!value) return undefined;
	const match = /^(\d+)x(\d+)$/i.exec(value.trim());
	if (!match) return undefined;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return undefined;
	}
	return { width, height };
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
	const providerImageSize = normalizeProviderImageSize(quality);
	const out: Record<string, unknown> = {};

	if (size) {
		out.size = size;
		// Keep legacy aliases while pricing migrates fully to canonical size.
		out.resolution = size;
		out.image_params = { resolution: size };
		const dimensions = parsePixelDimensions(size);
		if (dimensions) {
			out.output_pixels = dimensions.width * dimensions.height;
			out.image_params = {
				...(out.image_params as Record<string, unknown>),
				output_pixels: dimensions.width * dimensions.height,
			};
		}
	}

	if (providerImageSize) {
		out.resolution = providerImageSize;
		const imageParams =
			out.image_params && typeof out.image_params === "object"
				? (out.image_params as Record<string, unknown>)
				: {};
		imageParams.resolution = providerImageSize;
		out.image_params = imageParams;
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

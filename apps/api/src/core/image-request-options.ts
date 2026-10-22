// Purpose: Normalize image request options for pricing/routing.
// Why: Providers expose different wire fields; billing must match one canonical path.
// How: Normalize image request options around canonical `size` and compatibility aliases.

type ImageOptionInput = {
	model?: unknown;
	capability_id?: unknown;
	size?: unknown;
	resolution?: unknown;
	quality?: unknown;
	image_params?: {
		size?: unknown;
		resolution?: unknown;
		quality?: unknown;
	} | null;
	// Chat, Responses and Messages requests for Gemini image models.
	image_config?: { image_size?: unknown; imageSize?: unknown } | null;
	imageConfig?: { image_size?: unknown; imageSize?: unknown } | null;
	// Together sizes images with width and height only.
	width?: unknown;
	height?: unknown;
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

const IMAGE_SIZE_ALIAS_PIXELS = new Map<string, number>([
	["512", 512 * 512],
	["1K", 1024 * 1024],
	["2K", 2048 * 1152],
	["3K", 3072 * 1728],
	["4K", 4096 * 2304],
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
	if (normalized === "0.5K") return "512";
	if (IMAGE_SIZE_ALIAS_PIXELS.has(normalized)) {
		return normalized;
	}
	return undefined;
}

/** Gemini image models (AI Studio and Vertex), which take `imageConfig.imageSize`. */
function isGeminiImageModel(model: string | undefined): boolean {
	if (!model) return false;
	return /gemini-[^/]*image|nano-banana/i.test(model);
}

/** Grok Imagine image models, which take `resolution` (`1k`, `2k`). */
function isGrokImagineImageModel(model: string | undefined): boolean {
	return /grok-imagine-image/i.test(model ?? "");
}

function readGeminiImageSize(input: ImageOptionInput): string | undefined {
	const config = input.image_config ?? input.imageConfig;
	if (!config || typeof config !== "object") return undefined;
	return normalizeProviderImageSize(toNonEmptyString(config.image_size) ?? toNonEmptyString(config.imageSize));
}

/**
 * The Gemini image size tier (1K, 2K or 4K) for an output of width x height. Each tier's
 * sizes are about 1, 4 and 16 megapixels (1024x1024, 2048x2048, 4096x4096 at 1:1; 5504x3072
 * at 16:9), so the boundaries sit between them.
 * https://docs.together.ai/docs/serverless/models
 */
function geminiImageSizeFromDimensions(input: ImageOptionInput): string | undefined {
	const width = Number(input.width);
	const height = Number(input.height);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
	const pixels = width * height;
	if (pixels > 8_000_000) return "4K";
	if (pixels > 2_000_000) return "2K";
	return "1K";
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
	const model = toNonEmptyString(input.model);
	const isGrokImagineImage2 = model?.toLowerCase().endsWith("grok-imagine-image-2.0") ?? false;
	// xAI generates at 1k when `resolution` is omitted, for every Grok Imagine image model.
	const isGrokImagineImage = isGrokImagineImageModel(model);
	const rawSize =
		normalizeAutoOption(resolveImageSize(input)) ??
		normalizeAutoOption(resolveImageSize(responseInput)) ??
		inferredVariant?.resolution ??
		(isGrokImagineImage ? "1k" : undefined);
	const defaultGrokImagineQuality = input.capability_id === "image.edit" ? "medium" : "low";
	const rawQuality =
		normalizeAutoOption(toNonEmptyString(input.quality) ?? toNonEmptyString(input.image_params?.quality)) ??
		normalizeAutoOption(
			toNonEmptyString(responseInput.quality) ?? toNonEmptyString(responseInput.image_params?.quality),
		) ??
		inferredVariant?.quality ??
		(isGrokImagineImage2 ? defaultGrokImagineQuality : undefined);
	const size = isGrokImagineImage && /^\d+(?:\.\d+)?k$/i.test(rawSize ?? "") ? rawSize?.toLowerCase() : rawSize;
	const quality = isGrokImagineImage2 ? rawQuality?.toLowerCase() : rawQuality;
	// Gemini image models size their output with imageSize (1K by default), sent as `quality`
	// on the Images API and as `image_config.image_size` on chat requests. Hosts that size
	// by width and height (Together) bill the tier those dimensions fall in.
	const providerImageSize =
		(isGeminiImageModel(model) ? geminiImageSizeFromDimensions(input) : undefined) ??
		normalizeProviderImageSize(quality) ??
		readGeminiImageSize(input) ??
		(isGeminiImageModel(model) ? "1K" : undefined);
	const out: Record<string, unknown> = {};

	if (size) {
		out.size = size;
		// Keep legacy aliases while pricing migrates fully to canonical size.
		out.resolution = size;
		out.image_params = { resolution: size };
		const dimensions = parsePixelDimensions(size);
		const outputPixels = dimensions
			? dimensions.width * dimensions.height
			: IMAGE_SIZE_ALIAS_PIXELS.get(size.trim().toUpperCase()) ??
				(providerImageSize ? IMAGE_SIZE_ALIAS_PIXELS.get(providerImageSize) : undefined);
		if (outputPixels) {
			out.output_pixels = outputPixels;
			out.image_params = {
				...(out.image_params as Record<string, unknown>),
				output_pixels: outputPixels,
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

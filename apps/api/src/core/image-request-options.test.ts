import { describe, expect, it } from "vitest";
import {
	buildImagePricingRequestOptions,
	inferImagePricingVariant,
	normalizeOpenAIImageTokenUsage,
	resolveImageResolution,
	resolveImageSize,
} from "./image-request-options";

describe("image-request-options", () => {
	it("resolves canonical size from explicit size first", () => {
		expect(resolveImageSize({ size: "1536x1024" })).toBe("1536x1024");
	});

	it("keeps legacy resolution alias compatibility", () => {
		expect(resolveImageSize({ resolution: "1024x1024" })).toBe("1024x1024");
		expect(resolveImageResolution({ resolution: "1024x1024" })).toBe("1024x1024");
	});

	it("falls back to nested image_params aliases", () => {
		expect(resolveImageSize({ image_params: { size: "1024x1536" } })).toBe("1024x1536");
		expect(resolveImageSize({ image_params: { resolution: "1536x1024" } })).toBe("1536x1024");
	});

	it("builds canonical pricing keys", () => {
		const options = buildImagePricingRequestOptions({
			size: "1024x1024",
			quality: "high",
		});

		expect(options).toEqual({
			size: "1024x1024",
			resolution: "1024x1024",
			output_pixels: 1048576,
			quality: "high",
			image_params: {
				resolution: "1024x1024",
				output_pixels: 1048576,
				quality: "high",
			},
		});
	});

	it("normalizes Grok Imagine Image 2.0 pricing options and applies documented defaults", () => {
		expect(buildImagePricingRequestOptions({ model: "grok-imagine-image-2.0" })).toMatchObject({
			size: "1k",
			quality: "low",
			image_params: { resolution: "1k", quality: "low" },
		});
		expect(
			buildImagePricingRequestOptions({
				model: "spacex-ai/grok-imagine-image-2.0",
				resolution: "2K",
				quality: "MEDIUM",
			}),
		).toMatchObject({
			size: "2k",
			quality: "medium",
			image_params: { resolution: "2k", quality: "medium" },
		});
		expect(
			buildImagePricingRequestOptions({
				model: "spacex-ai/grok-imagine-image-2.0",
				capability_id: "image.edit",
				quality: "auto",
			}),
		).toMatchObject({
			size: "1k",
			quality: "medium",
			image_params: { resolution: "1k", quality: "medium" },
		});
	});

	it("defaults every Grok Imagine image model to xAI's 1k resolution", () => {
		expect(buildImagePricingRequestOptions({ model: "x-ai/grok-imagine-image" })).toMatchObject({
			size: "1k",
			image_params: { resolution: "1k" },
		});
		expect(buildImagePricingRequestOptions({ model: "grok-imagine-image", resolution: "2K" })).toMatchObject({
			image_params: { resolution: "2k" },
		});
		// Only Grok Imagine Image 2.0 has quality tiers.
		expect(buildImagePricingRequestOptions({ model: "grok-imagine-image" })).not.toHaveProperty("quality");
	});

	it("reads Gemini image sizes from quality, image_config and Google's 1K default", () => {
		expect(buildImagePricingRequestOptions({ model: "google/gemini-3-pro-image" }).image_params).toEqual({ resolution: "1K" });
		expect(buildImagePricingRequestOptions({ model: "google/gemini-3-pro-image", quality: "2k" }).image_params).toMatchObject({ resolution: "2K" });
		expect(buildImagePricingRequestOptions({ model: "google/gemini-3-pro-image", image_config: { image_size: "4K" } }).image_params)
			.toEqual({ resolution: "4K" });
		expect(buildImagePricingRequestOptions({ model: "google/gemini-3.1-flash-image", imageConfig: { imageSize: "0.5K" } }).image_params)
			.toEqual({ resolution: "512" });
		// The Images API maps `size` to Gemini's aspect ratio, so the image size stays 1K.
		expect(buildImagePricingRequestOptions({ model: "gemini-3-pro-image-preview", size: "1536x1024" }).image_params)
			.toMatchObject({ resolution: "1K" });
		expect(buildImagePricingRequestOptions({ model: "google/nano-banana-2.1" }).image_params).toEqual({ resolution: "1K" });
		// Other models are unchanged.
		expect(buildImagePricingRequestOptions({ model: "openai/gpt-image-1" })).toEqual({});
	});

	it("reads the Gemini image size tier from width and height", () => {
		const tier = (width: number, height: number, extra: Record<string, unknown> = {}) =>
			(buildImagePricingRequestOptions({ model: "google/gemini-3-pro-image", width, height, ...extra }).image_params as any)?.resolution;
		expect(tier(1024, 1024)).toBe("1K");
		expect(tier(1584, 672)).toBe("1K");
		expect(tier(2048, 2048)).toBe("2K");
		expect(tier(3168, 1344)).toBe("2K");
		expect(tier(4096, 4096)).toBe("4K");
		expect(tier(3072, 5504)).toBe("4K");
		// Dimensions decide over a quality value the host does not read.
		expect(tier(1024, 1024, { quality: "4K" })).toBe("1K");
		// Width and height do not set a tier for non-Gemini models.
		expect(buildImagePricingRequestOptions({ model: "qwen/qwen-image", width: 4096, height: 4096 }).image_params).toBeUndefined();
	});

	it("infers pricing quality and resolution from image output tokens when request used auto defaults", () => {
		const options = buildImagePricingRequestOptions(
			{
				size: "auto",
				quality: "auto",
			},
			{
				output_tokens: 4160,
			},
		);

		expect(options).toEqual({
			size: "1024x1024",
			resolution: "1024x1024",
			output_pixels: 1048576,
			quality: "high",
			image_params: {
				resolution: "1024x1024",
				output_pixels: 1048576,
				quality: "high",
			},
		});
	});

	it("infers portrait image variants from explicit output image token usage", () => {
		expect(
			inferImagePricingVariant({
				output_tokens_details: {
					output_images: 1584,
				},
			}),
		).toEqual({
			quality: "medium",
			resolution: "1024x1536",
		});
	});

	it("maps OpenAI Images API usage to image-token meters", () => {
		expect(
			normalizeOpenAIImageTokenUsage({
				input_tokens: 110,
				output_tokens: 6594,
				input_tokens_details: { text_tokens: 10, image_tokens: 100 },
			}),
		).toMatchObject({
			input_text_tokens: 10,
			input_image_tokens: 100,
			output_image_tokens: 6594,
		});
	});

	it("prefers resolved response params over token inference when request used auto", () => {
		const options = buildImagePricingRequestOptions(
			{
				size: "auto",
				quality: "auto",
			},
			{
				size: "1024x1536",
				quality: "high",
				output_tokens: 4160,
			},
		);

		expect(options).toEqual({
			size: "1024x1536",
			resolution: "1024x1536",
			output_pixels: 1572864,
			quality: "high",
			image_params: {
				resolution: "1024x1536",
				output_pixels: 1572864,
				quality: "high",
			},
		});
	});

	it("uses Gemini image size quality as pricing resolution while preserving aspect ratio size", () => {
		const options = buildImagePricingRequestOptions({
			size: "1:1",
			quality: "1K",
		});

		expect(options).toEqual({
			size: "1:1",
			resolution: "1K",
			quality: "1K",
			output_pixels: 1048576,
			image_params: {
				resolution: "1K",
				quality: "1K",
				output_pixels: 1048576,
			},
		});
	});

	it("derives output pixel count from exact image dimensions for tiered providers", () => {
		const options = buildImagePricingRequestOptions({
			size: "2048x2048",
		});

		expect(options).toMatchObject({
			output_pixels: 4194304,
			image_params: {
				output_pixels: 4194304,
			},
		});
	});

	it("derives output pixel count from provider K-size aliases", () => {
		expect(buildImagePricingRequestOptions({ size: "2K" })).toMatchObject({
			output_pixels: 2359296,
			image_params: { output_pixels: 2359296 },
		});
		expect(buildImagePricingRequestOptions({ size: "3K" })).toMatchObject({
			output_pixels: 5308416,
			image_params: { output_pixels: 5308416 },
		});
	});

	it.each([
		["3K", 5308416],
		["4K", 9437184],
	])("derives output pixels from provider quality alias %s", (quality, outputPixels) => {
		expect(buildImagePricingRequestOptions({ size: "1:1", quality })).toMatchObject({
			output_pixels: outputPixels,
			image_params: { resolution: quality, output_pixels: outputPixels },
		});
	});
});

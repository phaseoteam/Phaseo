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

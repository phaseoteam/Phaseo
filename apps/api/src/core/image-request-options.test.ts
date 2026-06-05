import { describe, expect, it } from "vitest";
import {
	buildImagePricingRequestOptions,
	inferImagePricingVariant,
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
			quality: "high",
			image_params: {
				resolution: "1024x1024",
				quality: "high",
			},
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
			quality: "high",
			image_params: {
				resolution: "1024x1024",
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
			quality: "high",
			image_params: {
				resolution: "1024x1536",
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
			image_params: {
				resolution: "1K",
				quality: "1K",
			},
		});
	});
});

import { describe, expect, it } from "vitest";
import { buildImagePricingRequestOptions, resolveImageResolution, resolveImageSize } from "./image-request-options";

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
});

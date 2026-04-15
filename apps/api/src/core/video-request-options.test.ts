import { describe, expect, it } from "vitest";
import { buildVideoPricingRequestOptions, resolveVideoResolution, resolveVideoSeconds, resolveVideoSize } from "./video-request-options";

describe("video-request-options", () => {
	it("resolves canonical size from explicit size first", () => {
		expect(resolveVideoSize({ size: "1080p" })).toBe("1080p");
	});

	it("keeps legacy resolution alias compatibility", () => {
		expect(resolveVideoSize({ resolution: "720p" })).toBe("720p");
		expect(resolveVideoResolution({ resolution: "720p" })).toBe("720p");
	});

	it("falls back to nested video_params aliases", () => {
		expect(resolveVideoSize({ video_params: { size: "576p" } })).toBe("576p");
		expect(resolveVideoSize({ video_params: { resolution: "480p" } })).toBe("480p");
		expect(resolveVideoSeconds({ video_params: { duration_seconds: 6 } })).toBe(6);
	});

	it("builds canonical pricing keys", () => {
		const options = buildVideoPricingRequestOptions({
			size: "768p",
			seconds: 8,
			quality: "standard",
			input_image_count: 1,
		});

		expect(options).toEqual({
			size: "768p",
			resolution: "768p",
			input_resolution: "768p",
			seconds: 8,
			duration_seconds: 8,
			quality: "standard",
			input_image_count: 1,
			video_params: {
				resolution: "768p",
				input_resolution: "768p",
				seconds: 8,
				duration_seconds: 8,
				quality: "standard",
				input_image_count: 1,
			},
		});
	});

	it("normalizes input_image_count edge cases", () => {
		const fractional = buildVideoPricingRequestOptions({
			size: "768p",
			seconds: 8,
			input_image_count: 2.9,
		});
		expect(fractional.input_image_count).toBe(2);
		expect((fractional.video_params as Record<string, unknown>).input_image_count).toBe(2);

		const zeroString = buildVideoPricingRequestOptions({
			size: "768p",
			seconds: 8,
			input_image_count: "0",
		});
		expect(zeroString.input_image_count).toBe(0);
		expect((zeroString.video_params as Record<string, unknown>).input_image_count).toBe(0);

		const negative = buildVideoPricingRequestOptions({
			size: "768p",
			seconds: 8,
			input_image_count: -3,
		});
		expect(negative).not.toHaveProperty("input_image_count");
		expect((negative.video_params as Record<string, unknown>)).not.toHaveProperty("input_image_count");

		const nonFinite = buildVideoPricingRequestOptions({
			size: "768p",
			seconds: 8,
			input_image_count: Number.POSITIVE_INFINITY,
		});
		expect(nonFinite).not.toHaveProperty("input_image_count");
		expect((nonFinite.video_params as Record<string, unknown>)).not.toHaveProperty("input_image_count");
	});
});

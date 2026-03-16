import { describe, expect, it } from "vitest";
import { buildVideoPricingRequestOptions, resolveVideoResolution, resolveVideoSize } from "./video-request-options";

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
	});

	it("builds canonical pricing keys", () => {
		const options = buildVideoPricingRequestOptions({
			size: "768p",
			quality: "standard",
		});

		expect(options).toEqual({
			size: "768p",
			resolution: "768p",
			quality: "standard",
			video_params: {
				resolution: "768p",
				quality: "standard",
			},
		});
	});
});

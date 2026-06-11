import { describe, expect, it } from "vitest";
import { VideoGenerationSchema } from "./schemas";

describe("VideoGenerationSchema", () => {
	it("accepts duration and image_url input references", () => {
		const parsed = VideoGenerationSchema.parse({
			model: "google/veo-3.1",
			prompt: "A teddy bear playing electric guitar on stage",
			duration: 4,
			aspect_ratio: "16:9",
			input_references: [
				{
					type: "image_url",
					image_url: {
						url: "https://example.com/frame.png",
					},
				},
			],
		});

		expect(parsed.duration).toBe(4);
		expect(parsed.input_references?.[0]).toMatchObject({
			type: "image_url",
		});
	});

	it("rejects legacy duration_seconds alias", () => {
		const result = VideoGenerationSchema.safeParse({
			model: "google/veo-3.1",
			prompt: "Legacy client payload",
			duration_seconds: 6,
		});

		expect(result.success).toBe(false);
	});

	it("rejects legacy input_references shape", () => {
		const result = VideoGenerationSchema.safeParse({
			model: "google/veo-3.1",
			prompt: "Legacy input refs",
			input_references: [
				{
					type: "image",
					url: "https://example.com/frame.png",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	it("rejects size with resolution/aspect_ratio", () => {
		const result = VideoGenerationSchema.safeParse({
			model: "google/veo-3.1",
			prompt: "Conflict payload",
			size: "1920x1080",
			resolution: "1080p",
			aspect_ratio: "16:9",
		});

		expect(result.success).toBe(false);
	});

	it("normalizes video webhook events with the shared async webhook parser", () => {
		const parsed = VideoGenerationSchema.parse({
			model: "google/veo-3.1",
			prompt: "Webhook payload",
			webhook: {
				url: "https://example.com/hooks/video",
				secret: "whsec_video",
				events: ["completed", "video.failed", "job.cancelled"],
			},
		});

		expect(parsed.webhook).toEqual({
			url: "https://example.com/hooks/video",
			secret: "whsec_video",
			events: ["job.completed", "video.failed", "job.cancelled"],
		});
	});

	it("rejects video webhook configs that cannot dispatch", () => {
		expect(
			VideoGenerationSchema.safeParse({
				model: "google/veo-3.1",
				prompt: "Cross-kind webhook",
				webhook: {
					url: "https://example.com/hooks/video",
					events: ["batch.completed"],
				},
			}).success,
		).toBe(false);
		expect(
			VideoGenerationSchema.safeParse({
				model: "google/veo-3.1",
				prompt: "Insecure webhook",
				webhook: {
					url: "http://example.com/hooks/video",
				},
			}).success,
		).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { VideoGenerationSchema } from "./schemas";

describe("VideoGenerationSchema", () => {
	it("allows image-to-video requests without a text prompt", () => {
		const parsed = VideoGenerationSchema.parse({
			model: "minimax/hailuo-2.3-fast",
			input_reference: { image_url: "https://example.com/frame.webp" },
		});
		expect(parsed.prompt).toBe("");
	});

	it("still requires a prompt when no image input is provided", () => {
		expect(VideoGenerationSchema.safeParse({ model: "minimax/hailuo-2.3" }).success).toBe(false);
	});

	it("accepts the native OpenAI multipart contract and defaults the model", () => {
		const reference = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
		const parsed = VideoGenerationSchema.parse({
			prompt: "A calico cat playing piano",
			seconds: "8",
			size: "1280x720",
			input_reference: reference,
		});
		expect(parsed.model).toBe("sora-2");
		expect(parsed.seconds).toBe("8");
		expect(parsed.input_reference).toBe(reference);
		expect(VideoGenerationSchema.parse({ prompt: "Longer Pro render", seconds: "20", size: "1920x1080" }).seconds).toBe("20");
	});

	it("enforces OpenAI prompt, seconds, and input-reference bounds", () => {
		expect(VideoGenerationSchema.safeParse({ prompt: "x".repeat(32_001) }).success).toBe(false);
		expect(VideoGenerationSchema.safeParse({ prompt: "x", seconds: "6" }).success).toBe(false);
		expect(VideoGenerationSchema.safeParse({ prompt: "x", input_reference: { file_id: "f", image_url: "https://example.com/i.png" } }).success).toBe(false);
	});

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

	it("accepts normalized video and audio references", () => {
		const parsed = VideoGenerationSchema.parse({
			model: "bytedance/seedance-2.0",
			prompt: "Use the supplied motion and soundtrack",
			input_references: [
				{ type: "video_url", role: "source", media_url: { url: "https://example.com/source.mp4" } },
				{ type: "audio_url", role: "reference", media_url: { url: "https://example.com/music.mp3" } },
			],
		});
		expect(parsed.input_references?.map((entry) => entry.type)).toEqual(["video_url", "audio_url"]);
	});

	it("accepts source-video duration for provider billing", () => {
		const parsed = VideoGenerationSchema.parse({
			model: "alibaba/happyhorse-1.0",
			prompt: "Edit the supplied source video",
			duration: 8,
			input_video_duration: 8.5,
			input_references: [
				{ type: "video_url", role: "source", media_url: { url: "https://example.com/source.mp4" } },
			],
		});
		expect(parsed.input_video_duration).toBe(8.5);
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
				endpoint_id: "whep_video",
				events: ["status_changed", "completed", "video.failed", "job.cancelled"],
			},
		});

		expect(parsed.webhook).toEqual({
			endpointId: "whep_video",
			secret: null,
			events: ["job.status_changed", "job.completed", "video.failed", "job.cancelled"],
		});
	});

	it("rejects video webhook configs that cannot dispatch", () => {
		expect(
			VideoGenerationSchema.safeParse({
				model: "google/veo-3.1",
				prompt: "Cross-kind webhook",
				webhook: {
					endpoint_id: "whep_video",
					events: ["batch.completed"],
				},
			}).success,
		).toBe(false);
		expect(
			VideoGenerationSchema.safeParse({
				model: "google/veo-3.1",
				prompt: "Insecure webhook",
				webhook: { url: "https://example.com/hooks/video" },
			}).success,
		).toBe(false);
	});

	it("accepts Veo's compression_quality strings and the legacy number", () => {
		for (const value of ["optimized", "lossless", 70]) {
			expect(VideoGenerationSchema.parse({ model: "google/veo-3.1", prompt: "Quality", compression_quality: value }).compression_quality).toBe(value);
		}
		expect(VideoGenerationSchema.safeParse({ model: "google/veo-3.1", prompt: "Quality", compression_quality: "high" }).success).toBe(false);
	});

	it("rejects provider request overrides and excessive output counts", () => {
		expect(VideoGenerationSchema.safeParse({
			model: "google/veo-3.1",
			prompt: "Safe canonical prompt",
			provider_params: { request: { prompt: "bypass" } },
		}).success).toBe(false);
		expect(VideoGenerationSchema.safeParse({
			model: "google/veo-3.1",
			prompt: "Too many outputs",
			sample_count: 5,
		}).success).toBe(false);
	});
});

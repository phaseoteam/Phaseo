import { describe, expect, it } from "vitest";
import { ImagesGenerationSchema } from "../schemas";

describe("OpenAI image generation schema", () => {
	it("accepts documented GPT Image 2 flexible sizes and output controls", () => {
		const parsed = ImagesGenerationSchema.parse({
			model: "openai/gpt-image-2",
			prompt: "A cinematic landscape",
			size: "2048x1152",
			quality: "high",
			output_format: "webp",
			output_compression: 75,
			background: "opaque",
			moderation: "low",
			stream: true,
			partial_images: 2,
		});

		expect(parsed.size).toBe("2048x1152");
		expect(parsed.partial_images).toBe(2);
	});

	it.each(["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"])(
		"accepts GPT Image 2.5 flexible sizes and new quality levels for %s",
		(model) => {
			expect(ImagesGenerationSchema.safeParse({
				model,
				prompt: "A cinematic landscape",
				size: "2048x1152",
				quality: "xhigh",
			}).success).toBe(true);
			expect(ImagesGenerationSchema.safeParse({
				model,
				prompt: "A cinematic landscape",
				quality: "max",
			}).success).toBe(true);
			expect(ImagesGenerationSchema.safeParse({
				model,
				prompt: "A cinematic landscape",
				size: "1025x1024",
			}).success).toBe(false);
		},
	);

	it("rejects GPT Image 2.5-only quality levels for earlier GPT Image models", () => {
		expect(ImagesGenerationSchema.safeParse({
			model: "openai/gpt-image-2",
			prompt: "A cinematic landscape",
			quality: "xhigh",
		}).success).toBe(false);
	});

	it("accepts a transparent GPT Image 2 background with a transparency-capable format", () => {
		const parsed = ImagesGenerationSchema.parse({
			model: "openai/gpt-image-2",
			prompt: "A transparent product cutout",
			background: "transparent",
			output_format: "png",
		});

		expect(parsed.background).toBe("transparent");
	});

	it.each([
		["edge not divisible by 16", { size: "1025x1024" }, "size"],
		["edge over 3840px", { size: "4096x2048" }, "size"],
		["aspect ratio over 3:1", { size: "3840x1024" }, "size"],
		["too few pixels", { size: "512x512" }, "size"],
		["too many pixels", { size: "3840x3840" }, "size"],
		["compression with png", { output_format: "png", output_compression: 50 }, "output_compression"],
		["legacy response format", { response_format: "b64_json" }, "response_format"],
		["DALL-E style", { style: "vivid" }, "style"],
		["unsupported quality", { quality: "hd" }, "quality"],
	])("rejects %s for GPT Image 2", (_name, options, field) => {
		const result = ImagesGenerationSchema.safeParse({
			model: "gpt-image-2",
			prompt: "A test image",
			...options,
		});
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toContain(field);
	});

	it("does not impose OpenAI quality values on other providers", () => {
		expect(ImagesGenerationSchema.parse({
			model: "google/gemini-3.1-flash-image-preview",
			prompt: "A test image",
			quality: "2K",
		}).quality).toBe("2K");
	});

	it("preserves and validates the documented MiniMax image controls", () => {
		const parsed = ImagesGenerationSchema.parse({
			model: "minimax/image-01",
			prompt: "A studio portrait",
			aspect_ratio: "16:9",
			width: 1024,
			height: 1024,
			seed: 42,
			prompt_optimizer: true,
			n: 9,
		});

		expect(parsed).toMatchObject({
			aspect_ratio: "16:9",
			width: 1024,
			height: 1024,
			seed: 42,
			prompt_optimizer: true,
		});
		expect(ImagesGenerationSchema.safeParse({
			model: "minimax/image-01",
			prompt: "A studio portrait",
			width: 1025,
			height: 1024,
			n: 10,
		}).success).toBe(false);
	});

	it("does not impose MiniMax dimension limits on other providers", () => {
		expect(ImagesGenerationSchema.safeParse({
			model: "other/image-model",
			prompt: "A test image",
			width: 4096,
			height: 4096,
		}).success).toBe(true);
	});
});

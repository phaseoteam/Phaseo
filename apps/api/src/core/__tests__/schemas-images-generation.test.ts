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

	it.each(["xhigh", "max"])("accepts %s quality through the GPT Image latest alias", (quality) => {
		expect(ImagesGenerationSchema.safeParse({
			model: "openai/gpt-image-latest",
			prompt: "A lighthouse in a storm",
			quality,
			size: "2048x1152",
		}).success).toBe(true);
	});

	it.each([
		["openai/gpt-image-2.5-flare", "xhigh"],
		["openai/gpt-image-2.6-flare", "xhigh"],
		["openai/gpt-image-2.6-sunburst", "max"],
	])("accepts the 2.5-and-later quality levels on %s (%s)", (model, quality) => {
		expect(ImagesGenerationSchema.safeParse({ model, prompt: "A lighthouse in a storm", quality }).success).toBe(true);
	});

	it("applies the GPT Image 2 size rules to 2.6 as well", () => {
		expect(ImagesGenerationSchema.safeParse({ model: "openai/gpt-image-2.6-flare", prompt: "A", size: "1025x1024" }).success).toBe(false);
		expect(ImagesGenerationSchema.safeParse({ model: "openai/gpt-image-2.6-flare", prompt: "A", size: "2048x1152" }).success).toBe(true);
	});

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

describe("GPT Image 2.6 generation options", () => {
	const base = { model: "openai/gpt-image-2.6-flare", prompt: "A red kite" };
	const issues = (body: Record<string, unknown>) => {
		const parsed = ImagesGenerationSchema.safeParse({ ...base, ...body });
		return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
	};

	it("accepts complexity, GIF frames and SVG with an author model", () => {
		expect(issues({ complexity: "low" })).toEqual([]);
		expect(issues({ output_format: "gif", frame_count: 9, frame_duration_ms: 200, size: "512x512" })).toEqual([]);
		expect(issues({ output_format: "gif", size: "auto" })).toEqual([]);
		expect(issues({ output_format: "svg", n: 1, svg: { model: "openai/gpt-5-nano", reasoning: { effort: "low" } } })).toEqual([]);
		expect(issues({ model: "openai/gpt-image-flare-latest", complexity: "high" })).toEqual([]);
	});

	it("rejects combinations OpenAI does not support", () => {
		expect(issues({ output_format: "svg" })).toContain("svg.model");
		expect(issues({ output_format: "svg", n: 2, svg: { model: "gpt-5-nano" } })).toContain("n");
		expect(issues({ output_format: "svg", stream: true, svg: { model: "gpt-5-nano" } })).toContain("stream");
		expect(issues({ output_format: "svg", output_compression: 50, svg: { model: "gpt-5-nano" } })).toContain("output_compression");
		expect(issues({ svg: { model: "gpt-5-nano" } })).toContain("svg");
		expect(issues({ frame_count: 4 })).toContain("frame_count");
		expect(issues({ output_format: "gif", frame_count: 1 })).toContain("frame_count");
		expect(issues({ output_format: "gif", size: "500x500" })).toContain("size");
		expect(issues({ output_format: "gif", partial_images: 1, stream: true })).toEqual(expect.arrayContaining(["stream", "partial_images"]));
		expect(issues({ complexity: "extreme" })).toContain("complexity");
	});

	it("keeps 2.6 options to GPT Image 2.6 models", () => {
		expect(issues({ model: "openai/gpt-image-2.5-flare", complexity: "low" })).toContain("complexity");
		expect(issues({ model: "openai/gpt-image-2.5-flare", output_format: "gif" })).toContain("output_format");
		expect(issues({ model: "openai/gpt-image-1", output_format: "svg", svg: { model: "gpt-5-nano" } })).toEqual(expect.arrayContaining(["svg", "output_format"]));
		expect(issues({ model: "black-forest-labs/flux-2-pro", complexity: "low" })).toContain("complexity");
	});
});

import { describe, expect, it } from "vitest";
import { ImagesEditSchema } from "../schemas";
import { guardJson } from "@pipeline/before/guards";

describe("OpenAI image edit schema", () => {
	it("accepts multipart files, coerces form fields, and defaults the model", () => {
		const result = ImagesEditSchema.safeParse({
			image: [
				new File(["first"], "first.png", { type: "image/png" }),
				new File(["second"], "second.webp", { type: "image/webp" }),
			],
			mask: new File(["mask"], "mask.png", { type: "image/png" }),
			prompt: "Put both products in one scene",
			n: "2",
			stream: "true",
			partial_images: "3",
			output_format: "webp",
			output_compression: "75",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.model).toBe("openai/gpt-image-1.5");
			expect(result.data.n).toBe(2);
			expect(result.data.stream).toBe(true);
			expect(result.data.partial_images).toBe(3);
			expect(result.data.output_compression).toBe(75);
		}
	});

	it("parses the official image[] multipart shape before schema validation", async () => {
		const form = new FormData();
		form.append("model", "openai/gpt-image-1.5");
		form.append("image[]", new File(["first"], "first.png", { type: "image/png" }));
		form.append("image[]", new File(["second"], "second.png", { type: "image/png" }));
		form.append("prompt", "Combine the two references");
		form.append("n", "2");
		const parsed = await guardJson(new Request("https://api.phaseo.app/v1/images/edits", {
			method: "POST",
			body: form,
		}), "workspace-test", "request-test", { endpoint: "images.edits" });

		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			const validated = ImagesEditSchema.safeParse(parsed.value);
			expect(validated.success).toBe(true);
			if (validated.success) {
				expect(validated.data.image).toHaveLength(2);
				expect(validated.data.n).toBe(2);
			}
		}
	});

	it("accepts GPT Image 2 transparent backgrounds and configurable input fidelity", () => {
		for (const model of [
			"openai/gpt-image-2",
			"openai/gpt-image-2-2026-04-21",
			"openai/gpt-image-2.5-flare",
			"openai/gpt-image-2.5-sunburst",
		]) {
			for (const input_fidelity of ["low", "high"] as const) {
				expect(ImagesEditSchema.safeParse({
					model,
					image: "image",
					prompt: "edit",
					input_fidelity,
					background: "transparent",
					output_format: "png",
				}).success).toBe(true);
			}
		}
	});

	it.each(["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"])(
		"accepts GPT Image 2.5 xhigh and max edit quality for %s",
		(model) => {
			for (const quality of ["xhigh", "max"] as const) {
				expect(ImagesEditSchema.safeParse({ model, image: "image", prompt: "edit", quality }).success).toBe(true);
			}
		},
	);

	it("rejects GPT Image 2.5-only edit quality for earlier GPT Image models", () => {
		expect(ImagesEditSchema.safeParse({
			model: "openai/gpt-image-2",
			image: "image",
			prompt: "edit",
			quality: "max",
		}).success).toBe(false);
		expect(ImagesEditSchema.safeParse({
			model: "spacex-ai/grok-imagine-image-2.0",
			image: "image",
			prompt: "edit",
			quality: "xhigh",
		}).success).toBe(false);
	});

	it.each(["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"])(
		"validates GPT Image 2.5 edit dimensions for %s",
		(model) => {
			expect(ImagesEditSchema.safeParse({ model, image: "image", prompt: "edit", size: "2048x1152" }).success).toBe(true);
			expect(ImagesEditSchema.safeParse({ model, image: "image", prompt: "edit", size: "1025x1024" }).success).toBe(false);
		},
	);

	it("enforces image count, prompt, and output compression constraints", () => {
		expect(ImagesEditSchema.safeParse({
			model: "openai/gpt-image-1.5",
			image: Array.from({ length: 17 }, (_, index) => `image-${index}`),
			prompt: "edit",
		}).success).toBe(false);
		expect(ImagesEditSchema.safeParse({
			model: "openai/dall-e-2",
			image: "image",
			prompt: "x".repeat(1001),
		}).success).toBe(false);
		expect(ImagesEditSchema.safeParse({
			model: "openai/gpt-image-1.5",
			image: "image",
			prompt: "edit",
			output_format: "png",
			output_compression: 50,
		}).success).toBe(false);
	});

	it("preserves documented MiniMax edit controls and direct subject references", () => {
		const parsed = ImagesEditSchema.parse({
			model: "minimax/image-01",
			image: "https://example.com/person.jpg",
			prompt: "Put the person in a library",
			aspect_ratio: "16:9",
			seed: "42",
			prompt_optimizer: "true",
			subject_reference: [{
				type: "character",
				image_file: "https://example.com/person.jpg",
			}],
		});

		expect(parsed).toMatchObject({
			aspect_ratio: "16:9",
			seed: 42,
			prompt_optimizer: true,
			subject_reference: [{
				type: "character",
				image_file: "https://example.com/person.jpg",
			}],
		});
	});

	it("rejects malformed MiniMax subject references without constraining other models", () => {
		expect(ImagesEditSchema.safeParse({
			model: "minimax/image-01",
			image: "image",
			prompt: "edit",
			subject_reference: [{ type: "style", image_file: "" }],
		}).success).toBe(false);
		expect(ImagesEditSchema.safeParse({
			model: "other/image-model",
			image: "image",
			prompt: "edit",
			width: 4096,
			height: 4096,
		}).success).toBe(true);
	});

	it("rejects conflicting or unsupported Grok Imagine Image 2.0 size aliases", () => {
		const base = {
			model: "spacex-ai/grok-imagine-image-2.0",
			image: "image",
			prompt: "edit",
		};

		expect(ImagesEditSchema.safeParse({ ...base, size: "1k", resolution: "2k" }).success).toBe(false);
		expect(ImagesEditSchema.safeParse({ ...base, size: "3k" }).success).toBe(false);
		expect(ImagesEditSchema.safeParse({ ...base, resolution: "4k" }).success).toBe(false);
		expect(ImagesEditSchema.safeParse({ ...base, size: "2K", resolution: "2k" }).success).toBe(true);
		expect(ImagesEditSchema.safeParse({ ...base, size: "1k" }).success).toBe(true);
		expect(ImagesEditSchema.safeParse({ ...base, resolution: "2k" }).success).toBe(true);
	});
});

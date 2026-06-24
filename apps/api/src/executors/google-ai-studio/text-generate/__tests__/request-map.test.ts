import { describe, expect, it } from "vitest";
import { irToGemini } from "../index";

describe("google-ai-studio irToGemini", () => {
	it("maps system and developer roles into system_instruction", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash",
			stream: false,
			messages: [
				{ role: "system", content: [{ type: "text", text: "system prompt" }] },
				{ role: "developer", content: [{ type: "text", text: "developer prompt" }] },
				{ role: "user", content: [{ type: "text", text: "hello" }] },
			],
		} as any);

		expect(request.system_instruction).toBe("system prompt\n\ndeveloper prompt");
		expect(request.store).toBe(false);
		expect(request.input).toHaveLength(1);
		expect(request.input[0]).toEqual({
			type: "user_input",
			content: [{ type: "text", text: "hello" }],
		});
	});

	it("adds schema reinforcement instruction for json_schema mode", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash",
			stream: false,
			messages: [
				{ role: "user", content: [{ type: "text", text: "hello" }] },
			],
			responseFormat: {
				type: "json_schema",
				name: "result",
				schema: {
					type: "object",
					properties: { answer: { type: "string" } },
					required: ["answer"],
				},
			},
		} as any);

		expect(request.response_format).toEqual({
			type: "text",
			mime_type: "application/json",
			schema: {
				type: "object",
				properties: { answer: { type: "string" } },
				required: ["answer"],
			},
		});
		expect(request.response_format?.schema).toEqual({
			type: "object",
			properties: { answer: { type: "string" } },
			required: ["answer"],
		});
		expect(request.system_instruction).toContain("Return only valid JSON that matches this schema exactly:");
	});

	it("maps image response format and explicit thought controls", async () => {
		const request = await irToGemini({
			model: "gemini-3.1-flash-image-preview",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			modalities: ["image"],
			reasoning: { includeThoughts: false, enabled: true },
			imageConfig: {
				aspectRatio: "9:16",
				imageSize: "0.5K",
				includeRaiReason: true,
				referenceImages: [{ referenceType: "REFERENCE_TYPE_RAW" }],
			},
		} as any);

		expect(request.response_modalities).toEqual(["image"]);
		expect(request.generation_config?.thinking_summaries).toBe("none");
		expect(request.response_format).toEqual({
			type: "image",
			mime_type: "image/jpeg",
			delivery: "inline",
			aspect_ratio: "9:16",
			image_size: "512",
		});
	});

	it("defaults Gemini image models to TEXT+IMAGE modalities when caller omits them", async () => {
		const request = await irToGemini({
			model: "google/gemini-2.5-flash-image",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "draw a blue square" }] }],
		} as any);

		expect(request.response_modalities).toEqual(["text", "image"]);
	});

	it("maps audio modality for Gemini responseModalities", async () => {
		const request = await irToGemini({
			model: "lyria-3-pro",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "Write and sing a short hook" }] }],
			modalities: ["text", "audio"],
		} as any);

		expect(request.response_modalities).toEqual(["text", "audio"]);
	});

	it("maps reasoning.effort to thinkingLevel for Gemini 3.1 image preview", async () => {
		const request = await irToGemini({
			model: "gemini-3.1-flash-image-preview",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			reasoning: { effort: "minimal", enabled: true },
		} as any);

		expect(request.generation_config?.thinking_level).toBe("minimal");
		expect(request.generation_config?.thinking_budget).toBeUndefined();
	});

	it("passes through supported image sizes and aspect ratios", async () => {
		const sizes = ["0.5K", "1K", "2K", "4K"] as const;
		const ratios = ["1:1", "3:4", "9:16"] as const;

		for (const size of sizes) {
			for (const ratio of ratios) {
				const request = await irToGemini({
					model: "gemini-3.1-flash-image-preview",
					stream: false,
					messages: [{ role: "user", content: [{ type: "text", text: "generate image" }] }],
					imageConfig: {
						imageSize: size,
						aspectRatio: ratio,
					},
				} as any);

				expect(request.response_format?.image_size).toBe(size === "0.5K" ? "512" : size);
				expect(request.response_format?.aspect_ratio).toBe(ratio);
			}
		}
	});
});

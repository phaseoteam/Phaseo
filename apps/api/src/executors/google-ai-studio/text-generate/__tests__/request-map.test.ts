import { describe, expect, it } from "vitest";
import { irToGemini } from "../index";

describe("google-ai-studio irToGemini", () => {
	it("maps system and developer roles into systemInstruction parts", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash",
			stream: false,
			messages: [
				{ role: "system", content: [{ type: "text", text: "system prompt" }] },
				{ role: "developer", content: [{ type: "text", text: "developer prompt" }] },
				{ role: "user", content: [{ type: "text", text: "hello" }] },
			],
		} as any);

		expect(request.systemInstruction?.parts).toEqual([
			{ text: "system prompt" },
			{ text: "developer prompt" },
		]);
		expect(request.contents).toHaveLength(1);
		expect(request.contents[0]).toEqual({
			role: "user",
			parts: [{ text: "hello" }],
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

		expect(request.generationConfig?.responseMimeType).toBe("application/json");
		expect(request.generationConfig?.responseSchema).toEqual({
			type: "object",
			properties: { answer: { type: "string" } },
			required: ["answer"],
		});
		expect(Array.isArray(request.systemInstruction?.parts)).toBe(true);
		expect(
			request.systemInstruction.parts.some(
				(part: any) =>
					typeof part?.text === "string" &&
					part.text.includes("Return only valid JSON that matches this schema exactly:"),
			),
		).toBe(true);
	});

	it("maps image config passthrough and explicit thought controls", async () => {
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

		expect(request.generationConfig?.responseModalities).toEqual(["IMAGE"]);
		expect(request.generationConfig?.thinkingConfig?.includeThoughts).toBe(false);
		expect(request.generationConfig?.imageConfig).toEqual({
			aspectRatio: "9:16",
			imageSize: "0.5K",
			includeRaiReason: true,
			referenceImages: [{ referenceType: "REFERENCE_TYPE_RAW" }],
		});
	});

	it("maps reasoning.effort to thinkingLevel for Gemini 3.1 image preview", async () => {
		const request = await irToGemini({
			model: "gemini-3.1-flash-image-preview",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			reasoning: { effort: "minimal", enabled: true },
		} as any);

		expect(request.generationConfig?.thinkingConfig?.thinkingLevel).toBe("MINIMAL");
		expect(request.generationConfig?.thinkingConfig?.thinkingBudget).toBeUndefined();
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

				expect(request.generationConfig?.imageConfig?.imageSize).toBe(size);
				expect(request.generationConfig?.imageConfig?.aspectRatio).toBe(ratio);
			}
		}
	});
});


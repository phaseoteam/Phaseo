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
});


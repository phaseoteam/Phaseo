import { describe, expect, it } from "vitest";
import { geminiToIR, irToGemini, resolveVertexModelRoute } from "../index";

describe("google-vertex route resolution", () => {
	it("routes prefixed models by family", () => {
		expect(resolveVertexModelRoute("google/gemini-2.5-flash").family).toBe("gemini");
		expect(resolveVertexModelRoute("anthropic/claude-sonnet-4@20250514").family).toBe("anthropic");
		expect(resolveVertexModelRoute("openai/gpt-4.1").family).toBe("openapi_chat");
	});
});

describe("google-vertex irToGemini", () => {
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
	});

	it("maps gemini-3 reasoning enabled to thinkingLevel", async () => {
		const request = await irToGemini({
			model: "gemini-3-pro",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			reasoning: { enabled: true },
		} as any, "gemini-3-pro");

		expect(request.generationConfig?.thinkingConfig?.includeThoughts).toBe(true);
		expect(request.generationConfig?.thinkingConfig?.thinkingLevel).toBe("HIGH");
		expect(request.generationConfig?.thinkingConfig?.thinkingBudget).toBeUndefined();
	});

	it("maps imageConfig into generationConfig.imageConfig", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash-image",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "draw a cat" }] }],
			imageConfig: {
				aspectRatio: "1:1",
				imageSize: "1024x1024",
			},
		} as any);

		expect(request.generationConfig?.imageConfig).toEqual({
			aspectRatio: "1:1",
			imageSize: "1024x1024",
		});
	});
});

describe("google-vertex geminiToIR", () => {
	it("maps thought parts to reasoning_text content", () => {
		const ir = geminiToIR({
			id: "vertex_resp_1",
			candidates: [{
				index: 0,
				content: {
					parts: [
						{
							text: "thinking...",
							thought: true,
							thought_signature: "sig_1",
						},
						{
							text: "final answer",
						},
					],
				},
				finishReason: "STOP",
			}],
			usageMetadata: {
				promptTokenCount: 5,
				candidatesTokenCount: 3,
				totalTokenCount: 8,
			},
		}, "req_1", "gemini-2.5-flash", "google-vertex");

		expect(ir.choices).toHaveLength(1);
		expect(ir.choices[0].message.content[0]).toMatchObject({
			type: "reasoning_text",
			text: "thinking...",
			thoughtSignature: "sig_1",
		});
		expect(ir.choices[0].message.content[1]).toMatchObject({
			type: "text",
			text: "final answer",
		});
	});
});


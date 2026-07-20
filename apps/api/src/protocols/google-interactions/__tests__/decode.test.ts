import { describe, expect, it } from "vitest";
import { decodeGoogleInteractionsRequest } from "../decode";

describe("decodeGoogleInteractionsRequest", () => {
	it("decodes system instructions, steps, tools, and generation config", () => {
		const ir = decodeGoogleInteractionsRequest({
			model: "google/gemini-test",
			system_instruction: "Use concise answers.",
			input: [
				{
					type: "user_input",
					content: [
						{ type: "text", text: "What is in this image?" },
						{ type: "image", uri: "https://example.com/image.png", mime_type: "image/png" },
					],
				},
				{
					type: "model_output",
					content: [{ type: "text", text: "I can inspect it." }],
				},
				{
					type: "thought",
					signature: "sig_1",
					summary: { type: "text", text: "Need to identify objects." },
				},
				{
					type: "function_call",
					id: "call_1",
					name: "lookup",
					arguments: { q: "image" },
				},
				{
					type: "function_result",
					call_id: "call_1",
					result: { ok: true },
				},
			],
			tools: [
				{
					type: "function",
					name: "lookup",
					description: "Lookup data",
					parameters: { type: "object" },
				},
			],
			generation_config: {
				max_output_tokens: 128,
				temperature: 0.2,
				top_p: 0.9,
				thinking_level: "high",
				thinking_summaries: "auto",
			},
			response_format: [
				{ type: "text", mime_type: "application/json", schema: { type: "object" } },
				{ type: "image", image_size: "512", aspect_ratio: "1:1" },
			],
			response_modalities: "image",
			labels: { cohort: "pro" },
			safety_settings: [{ category: "harassment", threshold: "block_medium_and_above" }],
			previous_interaction_id: "interactions/prev",
			stream: true,
		} as any);

		expect(ir.model).toBe("google/gemini-test");
		expect(ir.stream).toBe(true);
		expect(ir.maxTokens).toBe(128);
		expect(ir.temperature).toBe(0.2);
		expect(ir.topP).toBe(0.9);
		expect(ir.reasoning).toMatchObject({
			effort: "high",
			enabled: true,
			includeThoughts: true,
		});
		expect(ir.responseFormat).toEqual({
			type: "json_schema",
			schema: { type: "object" },
		});
		expect(ir.modalities).toEqual(["image"]);
		expect(ir.imageConfig).toEqual({
			aspectRatio: "1:1",
			imageSize: "0.5K",
		});
		expect(ir.previousResponseId).toBe("interactions/prev");
		expect(ir.metadata).toMatchObject({ cohort: "pro" });
		expect((ir.vendor as any)?.google?.safety_settings).toEqual([
			{ category: "harassment", threshold: "block_medium_and_above" },
		]);
		expect(ir.tools?.[0]).toMatchObject({
			name: "lookup",
			description: "Lookup data",
			parameters: { type: "object" },
		});
		expect(ir.messages.map((message) => message.role)).toEqual([
			"system",
			"user",
			"assistant",
			"tool",
		]);
		expect((ir.messages[1] as any).content[1]).toMatchObject({
			type: "image",
			source: "url",
			data: "https://example.com/image.png",
			mimeType: "image/png",
		});
		const assistant = ir.messages[2];
		expect(assistant.role).toBe("assistant");
		if (assistant.role === "assistant") {
			expect(assistant.content).toEqual([
				{ type: "text", text: "I can inspect it." },
				{
					type: "reasoning_text",
					text: "Need to identify objects.",
					summary: "Need to identify objects.",
					thoughtSignature: "sig_1",
				},
			]);
			expect(assistant.toolCalls).toEqual([
				{
					id: "call_1",
					name: "lookup",
					arguments: "{\"q\":\"image\"}",
				},
			]);
		}
	});
});

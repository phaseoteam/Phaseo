import { describe, expect, it } from "vitest";
import { irToGemini, supportsGoogleInteractions } from "../index";

describe("google-ai-studio irToGemini", () => {
	it("matches Google's documented Interactions model allowlist", () => {
		expect(supportsGoogleInteractions("google/gemini-3.7-flash")).toBe(true);
		expect(supportsGoogleInteractions("google/gemini-3.8-flash")).toBe(true);
		expect(supportsGoogleInteractions("gemma-4-31b-it")).toBe(true);
		expect(supportsGoogleInteractions("gemma-3-27b-it")).toBe(false);
		expect(supportsGoogleInteractions("gemini-robotics-er-2-preview")).toBe(true);
		expect(supportsGoogleInteractions("gemini-robotics-er-1.6-preview")).toBe(false);
		expect(supportsGoogleInteractions("gemini-3.1-flash-lite-image")).toBe(false);
	});
	it.each(["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-robotics-er-1.6-preview"])(
		"uses the Interactions request shape for %s",
		async (model) => {
			const request = await irToGemini({
				model,
				stream: true,
				temperature: 0.2,
				topP: 0.8,
				topK: 20,
				frequencyPenalty: 0.2,
				presencePenalty: 0.3,
				maxTokens: 256,
				messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			} as any);

			expect(request.model).toBe(model);
			expect(request.input).toEqual([{
				type: "user_input",
				content: [{ type: "text", text: "hello" }],
			}]);
			expect(request.generation_config).toEqual({ max_output_tokens: 256 });
			expect(request).not.toHaveProperty("temperature");
			expect(request.generation_config).not.toHaveProperty("temperature");
			expect(request.generation_config).not.toHaveProperty("top_p");
			expect(request.generation_config).not.toHaveProperty("top_k");
			expect(request.generation_config).not.toHaveProperty("frequency_penalty");
			expect(request.generation_config).not.toHaveProperty("presence_penalty");
		},
	);

	it("maps Gemini 2.5 reasoning effort through Interactions", async () => {
		const request = await irToGemini({
			model: "gemini-2.5-flash",
			stream: false,
			reasoning: { enabled: true, effort: "medium" },
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		} as any);

		expect(request.generation_config?.thinking_level).toBe("medium");
	});

	it("maps Gemini 3.8 service tier and structured output through Interactions", async () => {
		const schema = { type: "object", properties: { answer: { type: "string" } } };
		const request = await irToGemini({
			model: "gemini-3.8-flash",
			stream: false,
			serviceTier: "priority",
			responseFormat: { type: "json_schema", name: "result", schema },
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		} as any);

		expect(request.service_tier).toBe("priority");
		expect(request.response_format).toMatchObject({
			type: "text",
			mime_type: "application/json",
			schema,
		});
	});

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

	it("sanitizes Interactions function schemas and maps function results", async () => {
		const request = await irToGemini({
			model: "gemini-3.5-flash-lite",
			stream: false,
			vendor: { google: { previous_interaction_id: "v1_interaction_datetime" } },
			messages: [
				{ role: "user", content: [{ type: "text", text: "What time is it?" }] },
				{
					role: "assistant",
					content: [],
					toolCalls: [{ id: "call_datetime", name: "datetime", arguments: "{\"timezone\":\"UTC\"}" }],
				},
				{
					role: "tool",
					toolResults: [{
						toolCallId: "call_datetime",
						content: { datetime: "2026-07-22T08:00:00Z" },
					}],
				},
			],
			tools: [{
				name: "datetime",
				description: "Get the current datetime",
				parameters: {
					type: "object",
					additionalProperties: false,
					properties: {
						timezone: { type: "string", additionalProperties: false },
					},
				},
			}],
		} as any);

		expect(request.tools).toEqual([{
			type: "function",
			name: "datetime",
			description: "Get the current datetime",
			parameters: {
				type: "object",
				properties: { timezone: { type: "string" } },
			},
		}]);
		expect(request.store).toBe(true);
		expect(request.previous_interaction_id).toBe("v1_interaction_datetime");
		expect(request.input).toHaveLength(1);
		expect(request.input.at(-1)).toEqual({
			type: "function_result",
			call_id: "call_datetime",
			name: "datetime",
			is_error: undefined,
			result: [{ type: "text", text: "{\"datetime\":\"2026-07-22T08:00:00Z\"}" }],
		});
	});

	it("honors store=false and ignores client previous response IDs", async () => {
		const request = await irToGemini({
			model: "gemini-3.5-flash-lite",
			stream: false,
			store: false,
			previousResponseId: "interactions/another-workspace",
			messages: [{ role: "user", content: [{ type: "text", text: "What time is it?" }] }],
			tools: [{
				name: "datetime",
				description: "Get the current datetime",
				parameters: { type: "object", properties: { timezone: { type: "string" } } },
			}],
		} as any);

		expect(request.store).toBe(false);
		expect(request).not.toHaveProperty("previous_interaction_id");
		expect(request.input).toEqual([{
			type: "user_input",
			content: [{ type: "text", text: "What time is it?" }],
		}]);
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

		expect(request).not.toHaveProperty("response_modalities");
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

		expect(request).not.toHaveProperty("response_modalities");
		expect(request.response_format).toMatchObject({ type: "image" });
	});

	it("maps audio modality for Gemini responseModalities", async () => {
		const request = await irToGemini({
			model: "lyria-3-pro",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "Write and sing a short hook" }] }],
			modalities: ["text", "audio"],
		} as any);

		expect(request).not.toHaveProperty("response_modalities");
		expect(request.response_format).toMatchObject({ type: "audio" });
	});

	it("uses the current Interactions named tool-choice shape", async () => {
		const request = await irToGemini({
			model: "gemini-3.7-flash",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "What time is it?" }] }],
			tools: [{ name: "datetime", parameters: { type: "object", properties: {} } }],
			toolChoice: { name: "datetime" },
		} as any);

		expect(request.generation_config?.tool_choice).toEqual({
			allowed_tools: { mode: "any", tools: ["datetime"] },
		});
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

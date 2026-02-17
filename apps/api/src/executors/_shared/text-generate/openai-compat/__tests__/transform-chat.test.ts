// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Unit tests for Chat Completions transformations
import { describe, expect, it } from "vitest";
import { irToOpenAIChat, openAIChatToIR } from "../transform-chat";

describe("openAIChatToIR", () => {
	describe("Z.AI Reasoning Extraction", () => {
		it("should extract reasoning_content from Z.AI response", () => {
			const zaiResponse = {
				id: "chatcmpl_123",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "The answer is 8.",
							reasoning_content: "Let me think step by step: 5 + 3 = 8",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30,
					reasoning_tokens: 5,
				},
			};

			const ir = openAIChatToIR(zaiResponse, "req_123", "glm-4-7-flash", "z-ai");

			// Should have 1 choice with both reasoning_text and text parts
			expect(ir.choices.length).toBe(1);

			const choice = ir.choices[0];
			expect(choice.message.content.length).toBe(2);

			// First part should be reasoning_text
			const reasoningPart = choice.message.content.find((p) => p.type === "reasoning_text");
			expect(reasoningPart).toBeDefined();
			expect(reasoningPart?.text).toBe("Let me think step by step: 5 + 3 = 8");

			// Second part should be text
			const textPart = choice.message.content.find((p) => p.type === "text");
			expect(textPart).toBeDefined();
			expect(textPart?.text).toBe("The answer is 8.");

			// Usage should include reasoning tokens
			expect(ir.usage?.inputTokens).toBe(10);
			expect(ir.usage?.outputTokens).toBe(20);
			expect(ir.usage?.reasoningTokens).toBe(5);
		});

		it("should work with zai provider ID variant", () => {
			const response = {
				id: "chatcmpl_456",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Final answer",
							reasoning_content: "Reasoning process",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 10,
					total_tokens: 15,
				},
			};

			const ir = openAIChatToIR(response, "req_456", "glm-4-7-flash", "zai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.some((p) => p.type === "reasoning_text")).toBe(true);
		});

		it("should handle response without reasoning_content", () => {
			const response = {
				id: "chatcmpl_789",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Simple answer without reasoning",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 5,
					total_tokens: 8,
				},
			};

			const ir = openAIChatToIR(response, "req_789", "glm-4-7-flash", "z-ai");

			// Should only have 1 choice with text content (no reasoning)
			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
			expect(ir.choices[0].message.content[0].text).toBe("Simple answer without reasoning");
		});

		it("should handle empty reasoning_content", () => {
			const response = {
				id: "chatcmpl_abc",
				object: "chat.completion",
				created: 1234567890,
				model: "glm-4-7-flash",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Answer",
							reasoning_content: "", // Empty string
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 3,
					completion_tokens: 5,
					total_tokens: 8,
				},
			};

			const ir = openAIChatToIR(response, "req_abc", "glm-4-7-flash", "z-ai");

			// Empty reasoning should not create a reasoning_text part
			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
		});
	});

	describe("Non-Z.AI Providers", () => {
		it("should handle standard OpenAI responses", () => {
			const openaiResponse = {
				id: "chatcmpl_openai",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Hello from OpenAI",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 4,
					total_tokens: 9,
				},
			};

			const ir = openAIChatToIR(openaiResponse, "req_openai", "gpt-4", "openai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content.length).toBe(1);
			expect(ir.choices[0].message.content[0].type).toBe("text");
			expect(ir.choices[0].message.content[0].text).toBe("Hello from OpenAI");
			expect(ir.provider).toBe("openai");
		});

		it("parses output_image blocks from structured message content", () => {
			const response = {
				id: "chatcmpl_img_1",
				object: "chat.completion",
				created: 1234567890,
				model: "gemini-2.5-flash-image",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: [
								{ type: "output_text", text: "Here is your image." },
								{
									type: "output_image",
									b64_json: "ZmFrZS1pbWFnZQ==",
									mime_type: "image/png",
								},
							],
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 4,
					total_tokens: 9,
				},
			};

			const ir = openAIChatToIR(response, "req_img_1", "gemini-2.5-flash-image", "google-ai-studio");
			const imagePart = ir.choices[0].message.content.find((p) => p.type === "image") as any;
			expect(imagePart).toBeDefined();
			expect(imagePart.source).toBe("data");
			expect(imagePart.mimeType).toBe("image/png");
			expect(imagePart.data).toBe("ZmFrZS1pbWFnZQ==");
		});

		it("parses message.images blocks into IR image parts", () => {
			const response = {
				id: "chatcmpl_img_2",
				object: "chat.completion",
				created: 1234567890,
				model: "gemini-2.5-flash-image",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Generated",
							images: [
								{
									type: "image_url",
									image_url: {
										url: "https://example.com/generated.png",
									},
								},
							],
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 4,
					total_tokens: 9,
				},
			};

			const ir = openAIChatToIR(response, "req_img_2", "gemini-2.5-flash-image", "google-ai-studio");
			const imagePart = ir.choices[0].message.content.find((p) => p.type === "image") as any;
			expect(imagePart).toBeDefined();
			expect(imagePart.source).toBe("url");
			expect(imagePart.data).toBe("https://example.com/generated.png");
		});

		it("should handle tool calls", () => {
			const response = {
				id: "chatcmpl_tools",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "",
							tool_calls: [
								{
									id: "call_123",
									type: "function",
									function: {
										name: "get_weather",
										arguments: '{"city":"Boston"}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
			};

			const ir = openAIChatToIR(response, "req_tools", "gpt-4", "openai");

			expect(ir.choices.length).toBe(1);
			expect(ir.choices[0].message.content).toEqual([]); // Empty content for tool calls
			expect(ir.choices[0].message.toolCalls).toBeDefined();
			expect(ir.choices[0].message.toolCalls?.[0].name).toBe("get_weather");
			expect(ir.choices[0].finishReason).toBe("tool_calls");
		});

		it("extracts Cerebras reasoning from message.reasoning", () => {
			const response = {
				id: "chatcmpl_cerebras",
				object: "chat.completion",
				created: 1234567890,
				model: "qwen-3-235b-a22b-instruct-2507",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "final",
							reasoning: "step-by-step",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIChatToIR(response, "req_cerebras", "qwen-3-235b-a22b-instruct-2507", "cerebras");
			expect(ir.choices[0].message.content).toEqual([
				{ type: "reasoning_text", text: "step-by-step" },
				{ type: "text", text: "final" },
			]);
		});

		it("extracts DeepSeek reasoning from message.reasoning_content", () => {
			const response = {
				id: "chatcmpl_deepseek",
				object: "chat.completion",
				created: 1234567890,
				model: "deepseek-chat",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "final",
							reasoning_content: "chain-of-thought",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIChatToIR(response, "req_deepseek", "deepseek-chat", "deepseek");
			expect(ir.choices[0].message.content).toEqual([
				{ type: "reasoning_text", text: "chain-of-thought" },
				{ type: "text", text: "final" },
			]);
		});

		it("extracts Novita reasoning from message.reasoning_content", () => {
			const response = {
				id: "chatcmpl_novita",
				object: "chat.completion",
				created: 1234567890,
				model: "deepseek/deepseek-r1-turbo",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "final",
							reasoning_content: "novita-thought",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIChatToIR(response, "req_novita", "deepseek/deepseek-r1-turbo", "novitaai");
			expect(ir.choices[0].message.content).toEqual([
				{ type: "reasoning_text", text: "novita-thought" },
				{ type: "text", text: "final" },
			]);
		});

		it("extracts Perplexity reasoning from message.reasoning_content", () => {
			const response = {
				id: "chatcmpl_perplexity",
				object: "chat.completion",
				created: 1234567890,
				model: "sonar-reasoning-pro",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "final",
							reasoning_content: "perplexity-thought",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 5,
					completion_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIChatToIR(response, "req_perplexity", "sonar-reasoning-pro", "perplexity");
			expect(ir.choices[0].message.content).toEqual([
				{ type: "reasoning_text", text: "perplexity-thought" },
				{ type: "text", text: "final" },
			]);
		});
	});
});

describe("irToOpenAIChat", () => {
	it("maps parallel tool call control for chat providers", () => {
		const request = irToOpenAIChat({
			model: "mistral/mistral-large-2-1-2024-11-18",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			parallelToolCalls: false,
		} as any, "mistral-large-latest", "mistral");

		expect(request.parallel_tool_calls).toBe(false);
	});

	it("maps Mistral developer role and random_seed", () => {
		const request = irToOpenAIChat({
			model: "mistral/mistral-large-latest",
			messages: [
				{
					role: "developer",
					content: [{ type: "text", text: "Be concise." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "hello" }],
				},
			],
			stream: false,
			seed: 11,
		} as any, "mistral-large-latest", "mistral");

		expect(request.messages[0].role).toBe("system");
		expect(request.seed).toBeUndefined();
		expect(request.random_seed).toBe(11);
	});

	it("preserves caller-provided OpenAI reasoning.summary", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-5-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			reasoning: {
				effort: "high",
				summary: "detailed",
			},
		} as any, "gpt-5-nano", "openai");

		expect(request.reasoning).toBeDefined();
		expect(request.reasoning.effort).toBe("high");
		expect(request.reasoning.summary).toBe("detailed");
	});

	it("defaults OpenAI reasoning.summary to auto when omitted", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-5-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			reasoning: {
				effort: "high",
			},
		} as any, "gpt-5-nano", "openai");

		expect(request.reasoning).toBeDefined();
		expect(request.reasoning.effort).toBe("high");
		expect(request.reasoning.summary).toBe("auto");
	});

	it("maps Arcee reasoning configuration to reasoning_effort", () => {
		const request = irToOpenAIChat({
			model: "arcee-ai/coder-large",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			reasoning: {
				effort: "xhigh",
			},
		} as any, "arcee-ai/coder-large", "arcee");

		expect(request.reasoning_effort).toBe("high");
		expect(request.reasoning).toBeUndefined();
	});

	it("maps Cerebras reasoning/service tier and rewrites developer role", () => {
		const request = irToOpenAIChat({
			model: "cerebras/qwen-3-235b-a22b-instruct-2507",
			messages: [
				{
					role: "developer",
					content: [{ type: "text", text: "Use concise answers." }],
				},
				{
					role: "user",
					content: [{ type: "text", text: "hi" }],
				},
			],
			stream: false,
			reasoning: {
				effort: "high",
			},
			serviceTier: "standard",
		} as any, "qwen-3-235b-a22b-instruct-2507", "cerebras");

		expect(request.reasoning_effort).toBe("high");
		expect(request.service_tier).toBe("default");
		expect(request.messages[0].role).toBe("system");
	});

	it("maps OpenAI service_tier=standard to default", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-5-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			serviceTier: "standard",
		} as any, "gpt-5-nano", "openai");

		expect(request.service_tier).toBe("default");
	});

	it("maps DeepSeek assistant reasoning_content and keeps json_object response_format", () => {
		const request = irToOpenAIChat({
			model: "deepseek/deepseek-chat",
			messages: [
				{
					role: "assistant",
					content: [
						{ type: "reasoning_text", text: "analysis" },
						{ type: "text", text: "answer" },
					],
				},
				{
					role: "user",
					content: [{ type: "text", text: "next" }],
				},
			],
			stream: false,
			responseFormat: {
				type: "json_object",
			},
		} as any, "deepseek-chat", "deepseek");

		expect(request.messages[0].content).toBe("answer");
		expect(request.messages[0].reasoning_content).toBe("analysis");
		expect(request.response_format).toEqual({ type: "json_object" });
	});
});


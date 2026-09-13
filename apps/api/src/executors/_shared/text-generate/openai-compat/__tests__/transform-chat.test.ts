// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Unit tests for Chat Completions transformations
import { describe, expect, it } from "vitest";
import { irToOpenAIChat, openAIChatToIR } from "../transform-chat";

describe("openAIChatToIR", () => {
	it("preserves Mistral's observed Priority Tier response", () => {
		const ir = openAIChatToIR({
			id: "chatcmpl_mistral_priority",
			created: 1234567890,
			model: "zai-glm-5-2",
			choices: [{
				index: 0,
				message: { role: "assistant", content: "Paris" },
				finish_reason: "stop",
			}],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 2,
				total_tokens: 12,
				service_tier: "priority",
			},
		}, "req_mistral_priority", "zai-glm-5-2", "mistral");

		expect(ir.serviceTier).toBe("priority");
		expect((ir.usage as any)?.serviceTier).toBe("priority");
	});

	it("preserves a top-level Mistral Standard fallback tier for billing", () => {
		const ir = openAIChatToIR({
			id: "chatcmpl_mistral_fallback",
			created: 1234567890,
			model: "zai-glm-5-2",
			service_tier: "standard",
			choices: [{
				index: 0,
				message: { role: "assistant", content: "Paris" },
				finish_reason: "stop",
			}],
			usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
		}, "req_mistral_fallback", "zai-glm-5-2", "mistral");

		expect(ir.serviceTier).toBe("standard");
		expect((ir.usage as any)?.serviceTier).toBe("standard");
	});

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

		it("maps cached and multimodal usage details into IR usage", () => {
			const response = {
				id: "chatcmpl_usage",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4.1-mini",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "ok",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 120,
					completion_tokens: 30,
					total_tokens: 150,
					input_tokens_details: {
						cached_tokens: 70,
						cache_creation_input_tokens: 13,
						input_images: 4,
					},
					completion_tokens_details: {
						reasoning_tokens: 11,
						output_images: 2,
					},
				},
			};

			const ir = openAIChatToIR(response, "req_usage", "gpt-4.1-mini", "openai");
			expect(ir.usage?.cachedInputTokens).toBe(70);
			expect(ir.usage?.cachedReadTokensAreSubsetOfInput).toBe(true);
			expect(ir.usage?.reasoningTokens).toBe(11);
			expect(ir.usage?._ext?.inputImageTokens).toBe(4);
			expect(ir.usage?._ext?.outputImageTokens).toBe(2);
			expect(ir.usage?._ext?.cachedWriteTokens).toBe(13);
		});

		it("maps server-side web search usage into IR usage", () => {
			const response = {
				id: "chatcmpl_search_usage",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4.1-mini",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "ok",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					prompt_tokens: 120,
					completion_tokens: 30,
					total_tokens: 150,
					server_tool_use: {
						datetime_requests: 1,
						web_search_requests: 2,
						web_fetch_requests: 3,
						advisor_requests: 1,
						image_generation_requests: 1,
						apply_patch_requests: 1,
					},
				},
			};

			const ir = openAIChatToIR(response, "req_search_usage", "gpt-4.1-mini", "openai");
			expect(ir.usage?._ext?.serverToolUse).toEqual({
				datetime_requests: 1,
				web_search_requests: 2,
				web_fetch_requests: 3,
				advisor_requests: 1,
				image_generation_requests: 1,
				apply_patch_requests: 1,
			});
		});

		it("maps input_tokens/output_tokens usage aliases into IR usage", () => {
			const response = {
				id: "chatcmpl_usage_alias",
				object: "chat.completion",
				created: 1234567890,
				model: "gpt-4o-mini",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "ok",
						},
						finish_reason: "stop",
					},
				],
				usage: {
					input_tokens: 42,
					output_tokens: 8,
					total_tokens: 50,
				},
			};

			const ir = openAIChatToIR(response, "req_usage_alias", "gpt-4o-mini", "openai");
			expect(ir.usage?.inputTokens).toBe(42);
			expect(ir.usage?.outputTokens).toBe(8);
			expect(ir.usage?.totalTokens).toBe(50);
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

		it("parses output_audio blocks and message.audios into IR audio parts", () => {
			const response = {
				id: "chatcmpl_audio_1",
				object: "chat.completion",
				created: 1234567890,
				model: "lyria-3-pro",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: [
								{ type: "output_text", text: "Here is your hook." },
								{
									type: "output_audio",
									b64_json: "UklGRlIAAABXQVZFZm10",
									format: "wav",
								},
							],
							audios: [
								{
									type: "audio_url",
									audio_url: { url: "https://example.com/hook.wav" },
									format: "wav",
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

			const ir = openAIChatToIR(response, "req_audio_1", "lyria-3-pro", "google-ai-studio");
			const audioParts = ir.choices[0].message.content.filter((p) => p.type === "audio") as Array<any>;
			expect(audioParts).toHaveLength(2);
			expect(audioParts[0]).toMatchObject({
				type: "audio",
				source: "data",
				data: "UklGRlIAAABXQVZFZm10",
				format: "wav",
			});
			expect(audioParts[1]).toMatchObject({
				type: "audio",
				source: "url",
				data: "https://example.com/hook.wav",
				format: "wav",
			});
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

		it("maps DeepSeek insufficient_system_resource to an error finish", () => {
			const ir = openAIChatToIR({
				id: "chatcmpl_resource",
				model: "deepseek-v4-pro",
				choices: [{
					index: 0,
					message: { role: "assistant", content: "partial" },
					finish_reason: "insufficient_system_resource",
				}],
			}, "req_resource", "deepseek-v4-pro", "deepseek");

			expect(ir.choices[0].finishReason).toBe("error");
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
					prompt_cache_hit_tokens: 4,
					prompt_cache_miss_tokens: 1,
					completion_tokens: 5,
					total_tokens: 10,
				},
			};

			const ir = openAIChatToIR(response, "req_deepseek", "deepseek-chat", "deepseek");
			expect(ir.choices[0].message.content).toEqual([
				{ type: "reasoning_text", text: "chain-of-thought" },
				{ type: "text", text: "final" },
			]);
			expect(ir.usage?.cachedInputTokens).toBe(4);
			expect(ir.usage?.cachedReadTokensAreSubsetOfInput).toBe(true);
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

describe("Perplexity Sonar response metadata", () => {
	it("preserves citations, search results, images, related questions, and usage meters", () => {
		const response = {
			id: "pplx-1",
			created: 1,
			model: "sonar-deep-research",
			choices: [{ index: 0, message: { role: "assistant", content: "Grounded answer" }, finish_reason: "stop" }],
			citations: ["https://example.com/source"],
			search_results: [{ title: "Source", url: "https://example.com/source", source: "web" }],
			images: [{ image_url: "https://example.com/image.jpg" }],
			related_questions: ["What next?"],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 20,
				total_tokens: 30,
				citation_tokens: 7,
				num_search_queries: 3,
				search_context_size: "high",
				cost: { total_cost: 0.12 },
			},
		};

		const ir = openAIChatToIR(response, "req-pplx", "sonar-deep-research", "perplexity");
		expect(ir.citations).toEqual(["https://example.com/source"]);
		expect(ir.searchResults).toEqual(response.search_results);
		expect(ir.images).toEqual(response.images);
		expect(ir.relatedQuestions).toEqual(["What next?"]);
		expect(ir.choices[0].message.content[0]).toMatchObject({
			type: "text",
			annotations: [{ type: "url_citation", url: "https://example.com/source", title: "Source" }],
		});
		expect(ir.usage?._ext).toMatchObject({
			citationTokens: 7,
			numSearchQueries: 3,
			searchContextSize: "high",
			providerCost: { total_cost: 0.12 },
			serverToolUse: { web_search_requests: 3 },
		});
	});
});

describe("Alibaba Cloud reasoning request contract", () => {
	it("maps effort levels without combining them with a token budget", () => {
		const effortRequest = irToOpenAIChat({
			model: "qwen3.8-max-0902",
			messages: [{ role: "user", content: [{ type: "text", text: "Plan the migration." }] }],
			stream: false,
			reasoning: { enabled: true, effort: "high" },
		} as any, "qwen3.8-max-0902", "alibaba-cloud");
		const budgetRequest = irToOpenAIChat({
			model: "qwen3.8-max-0902",
			messages: [{ role: "user", content: [{ type: "text", text: "Plan the migration." }] }],
			stream: false,
			reasoning: { enabled: true, effort: "high", maxTokens: 8192 },
		} as any, "qwen3.8-max-0902", "alibaba-cloud");

		expect(effortRequest).toMatchObject({ enable_thinking: true, reasoning_effort: "xhigh" });
		expect(budgetRequest).toMatchObject({ enable_thinking: true, thinking_budget: 8192 });
		expect(budgetRequest.reasoning_effort).toBeUndefined();
	});

	it("disables thinking when effort is none", () => {
		const request = irToOpenAIChat({
			model: "qwen3.8-max-0902",
			messages: [{ role: "user", content: [{ type: "text", text: "Hello." }] }],
			stream: false,
			reasoning: { effort: "none" },
		} as any, "qwen3.8-max-0902", "alibaba-cloud");

		expect(request.enable_thinking).toBe(false);
	});
});

describe("Mistral chat request contract", () => {
	it("emits documented reasoning, caching, and Mistral-specific controls", () => {
		const request = irToOpenAIChat({
			model: "mistral-large-latest",
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			stream: false,
			reasoning: { effort: "xhigh" },
			promptCacheKey: "shared-prefix",
			vendor: {
				mistral: {
					n: 2,
					prediction: { type: "content", content: "known suffix" },
					safe_prompt: true,
					prompt_mode: "reasoning",
					guardrails: [{ name: "policy" }],
				},
			},
		} as any, undefined, "mistral");

		expect(request).toMatchObject({
			reasoning_effort: "xhigh",
			prompt_cache_key: "shared-prefix",
			n: 2,
			prediction: { type: "content", content: "known suffix" },
			safe_prompt: true,
			prompt_mode: "reasoning",
			guardrails: [{ name: "policy" }],
		});
	});
});

describe("Moonshot chat extensions", () => {
	it("restores prediction and partial-mode message fields", () => {
		const request = irToOpenAIChat({
			model: "kimi-k2.6",
			messages: [
				{ role: "user", content: [{ type: "text", text: "write code" }] },
				{ role: "assistant", content: [{ type: "text", text: "```ts\n" }] },
			],
			stream: false,
			vendor: { moonshot: {
				prediction: { type: "content", content: "known output" },
				message_fields: [{ name: "caller" }, { partial: true }],
			} },
		} as any, undefined, "moonshotai");

		expect(request.prediction).toEqual({ type: "content", content: "known output" });
		expect(request.messages[0].name).toBe("caller");
		expect(request.messages[1].partial).toBe(true);
	});
});

describe("irToOpenAIChat", () => {
	it("passes current OpenAI Chat audio, cache, verbosity, and prompt breakpoint fields", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-4o-audio-preview",
			messages: [{
				role: "user",
				content: [{
					type: "text",
					text: "Say hello",
					cacheControl: { type: "prompt_cache_breakpoint", mode: "explicit" },
				}],
			}],
			stream: false,
			modalities: ["text", "audio"],
			audioConfig: { format: "wav", voice: "alloy" },
			promptCacheOptions: { mode: "explicit", ttl: "30m" },
			textVerbosity: "low",
		} as any, "gpt-4o-audio-preview", "openai-eu");

		expect(request.audio).toEqual({ format: "wav", voice: "alloy" });
		expect(request.prompt_cache_options).toEqual({ mode: "explicit", ttl: "30m" });
		expect(request.verbosity).toBe("low");
		expect(request.messages[0].content[0].prompt_cache_breakpoint).toEqual({ mode: "explicit" });
	});
	it("preserves cache_control markers for explicit cache providers", () => {
		const request = irToOpenAIChat({
			model: "qwen/qwen3.7-max",
			messages: [
				{
					role: "system",
					content: [{
						type: "text",
						text: "stable system prompt",
						cacheControl: { type: "ephemeral" },
					}],
				},
				{
					role: "user",
					content: [{
						type: "text",
						text: "current question",
						cacheControl: { type: "ephemeral" },
					}],
				},
			],
			stream: false,
		} as any, "qwen3.7-max", "alibaba");

		expect(request.messages[0].content).toEqual([
			{
				type: "text",
				text: "stable system prompt",
				cache_control: { type: "ephemeral" },
			},
		]);
		expect(request.messages[1].content).toEqual([
			{
				type: "text",
				text: "current question",
				cache_control: { type: "ephemeral" },
			},
		]);
	});

	it("preserves native web search tools and tool choice", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-4.1",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Find the latest news." }],
			}],
			stream: false,
			tools: [{
				name: "web_search_preview",
				type: "web_search_preview",
				parameters: {},
				raw: {
					type: "web_search_preview",
					search_context_size: "medium",
				},
			}],
			toolChoice: { name: "web_search_preview" },
		} as any, "gpt-4.1", "openai");

		expect(request.tools).toEqual([{
			type: "web_search_preview",
			search_context_size: "medium",
		}]);
		expect(request.tool_choice).toBe("web_search_preview");
	});

	it("passes web_search_options through to upstream chat requests", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-4.1",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Find the latest news." }],
			}],
			stream: false,
			webSearchOptions: {
				search_context_size: "high",
			},
		} as any, "gpt-4.1", "openai");

		expect(request.web_search_options).toEqual({
			search_context_size: "high",
		});
	});

	it("passes image generation raw request options through to upstream chat requests", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-image-2",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "make an image" }],
			}],
			stream: false,
			modalities: ["text", "image"],
			imageConfig: {
				aspectRatio: "16:9",
				imageSize: "1024x1024",
			},
			rawRequest: {
				quality: "high",
				background: "transparent",
				output_format: "png",
				output_compression: 80,
				moderation: "auto",
			},
		} as any, "gpt-image-2", "openai");

		expect(request.image_config).toEqual({
			aspect_ratio: "16:9",
			image_size: "1024x1024",
		});
		expect(request.quality).toBe("high");
		expect(request.background).toBe("transparent");
		expect(request.output_format).toBe("png");
		expect(request.output_compression).toBe(80);
		expect(request.moderation).toBe("auto");
	});

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

	it("omits parallel tool call control when no tools are present", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-5.4-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			parallelToolCalls: false,
		} as any, "gpt-5.4-nano", "openai");

		expect(request.parallel_tool_calls).toBeUndefined();
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

	it("maps OpenAI chat max tokens to max_completion_tokens", () => {
		const request = irToOpenAIChat({
			model: "openai/gpt-5.4-nano",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}],
			stream: false,
			maxTokens: 128,
		} as any, "gpt-5.4-nano", "openai");

		expect(request.max_completion_tokens).toBe(128);
		expect(request.max_tokens).toBeUndefined();
	});

	it("omits stale DeepSeek reasoning_content on non-tool turns and keeps json_object response_format", () => {
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
		expect(request.messages[0].reasoning_content).toBeUndefined();
		expect(request.response_format).toEqual({ type: "json_object" });
	});

	it("forwards DeepSeek thinking effort with the thinking toggle", () => {
		const request = irToOpenAIChat({
			model: "deepseek/deepseek-v4-pro-0813",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Solve this" }],
			}],
			stream: false,
			reasoning: { effort: "max" },
		} as any, "deepseek-v4-pro", "deepseek");

		expect(request.thinking).toEqual({ type: "enabled" });
		expect(request.reasoning_effort).toBe("max");
	});

	it.each([
		["minimal", "low"],
		["medium", "high"],
		["xhigh", "high"],
		["none", undefined],
	] as const)("maps DeepSeek V4 Pro 0813 effort %s", (effort, expected) => {
		const request = irToOpenAIChat({
			model: "deepseek/deepseek-v4-pro-0813",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Solve this" }],
			}],
			stream: false,
			reasoning: { effort },
		} as any, "deepseek-v4-pro", "deepseek");

		expect(request.thinking).toEqual({
			type: effort === "none" ? "disabled" : "enabled",
		});
		expect(request.reasoning_effort).toBe(expected);
	});

	it("forwards native effort control for DeepSeek V4 Flash 0731", () => {
		const request = irToOpenAIChat({
			model: "deepseek/deepseek-v4-flash-0731",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Solve this" }],
			}],
			stream: false,
			reasoning: { effort: "max" },
		} as any, "deepseek-v4-flash", "deepseek");

		expect(request.thinking).toEqual({ type: "enabled" });
		expect(request.reasoning_effort).toBe("max");
	});

	it("forwards effort after resolving the latest DeepSeek Flash alias", () => {
		const request = irToOpenAIChat({
			model: "deepseek/deepseek-flash-latest",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Solve this" }],
			}],
			stream: false,
			reasoning: { effort: "minimal" },
		} as any, "deepseek-v4-flash", "deepseek");

		expect(request.reasoning_effort).toBe("low");
	});

	it("does not add V4 Pro 0813 effort control to older DeepSeek models", () => {
		const request = irToOpenAIChat({
			model: "deepseek/deepseek-v3.2",
			messages: [{
				role: "user",
				content: [{ type: "text", text: "Solve this" }],
			}],
			stream: false,
			reasoning: { effort: "max" },
		} as any, "deepseek-v3.2", "deepseek");

		expect(request.thinking).toEqual({ type: "enabled" });
		expect(request.reasoning_effort).toBeUndefined();
	});

	it("maps Kimi K3 reasoning and preserves assistant reasoning_content", () => {
		const request = irToOpenAIChat({
			model: "moonshotai/kimi-k3",
			messages: [
				{
					role: "assistant",
					content: [
						{ type: "reasoning_text", text: "prior reasoning" },
						{ type: "text", text: "prior answer" },
					],
				},
				{
					role: "user",
					content: [{ type: "video", url: "ms://file_123" }],
				},
			],
			stream: false,
			maxTokens: 131072,
			reasoning: { effort: "low" },
			responseFormat: {
				type: "json_schema",
				name: "answer",
				strict: true,
				schema: {
					type: "object",
					properties: { answer: { type: "string" } },
					required: ["answer"],
					additionalProperties: false,
				},
			},
		} as any, "kimi-k3", "moonshotai");

		expect(request.messages[0].content).toBe("prior answer");
		expect(request.messages[0].reasoning_content).toBe("prior reasoning");
		expect(request.messages[1].content[0].type).toBe("video_url");
		expect(request.reasoning_effort).toBe("low");
		expect(request.max_completion_tokens).toBe(131072);
		expect(request.max_tokens).toBeUndefined();
		expect(request.response_format.type).toBe("json_schema");
		expect(request.response_format.json_schema.strict).toBe(true);
	});
});

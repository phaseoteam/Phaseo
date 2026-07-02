import { describe, expect, it } from "vitest";
import { AnthropicMessagesSchema, ChatCompletionsSchema, ResponsesSchema } from "../schemas";

describe("text request schema validation", () => {
	it("accepts chat streaming when tools are present", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			stream: true,
			messages: [{ role: "user", content: "hello" }],
			tools: [{
				type: "function",
				function: {
					name: "lookup",
					parameters: { type: "object" },
				},
			}],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts gateway datetime server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "what time is it?" }],
			tools: [{
				type: "gateway:datetime",
				parameters: {
					timezone: "Europe/London",
				},
			}],
			tool_choice: "gateway:datetime",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web search server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "find recent AI news" }],
			tools: [{
				type: "ai-stats:web_search",
				parameters: {
					max_results: 5,
					include_highlights: true,
				},
			}],
			tool_choice: "ai-stats:web_search",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web search engine parameters on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "find recent AI news" }],
			tools: [{
				type: "ai-stats:web_search",
				parameters: {
					engine: "native",
					max_characters: 2048,
					user_location: { type: "approximate", country: "US" },
				},
			}],
			tool_choice: "ai-stats:web_search",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web fetch server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "fetch this page" }],
			tools: [{
				type: "ai-stats:web_fetch",
				parameters: {
					max_chars: 8000,
				},
			}],
			tool_choice: "ai-stats:web_fetch",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats advisor server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "review this plan" }],
			tools: [{
				type: "ai-stats:advisor",
				parameters: {
					name: "reviewer",
					model: "claude-opus-4-8",
					instructions: "Review for correctness and missing edge cases.",
					forward_transcript: true,
					max_uses: 2,
					max_completion_tokens: 1400,
					reasoning: { effort: "high" },
					temperature: 0.2,
				},
			}],
			tool_choice: "ai-stats:advisor",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats image generation server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "make an image" }],
			tools: [{
				type: "ai-stats:image_generation",
				parameters: {
					model: "openai/gpt-image-2",
					quality: "high",
					aspect_ratio: "16:9",
					output_format: "png",
					output_compression: 80,
				},
			}],
			tool_choice: "ai-stats:image_generation",
		});

		expect(parsed.success).toBe(true);
	});

	it("rejects AI Stats apply patch server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "propose a patch" }],
			tools: [{
				type: "ai-stats:apply_patch",
				parameters: { engine: "auto" },
			}],
			tool_choice: "ai-stats:apply_patch",
		});

		expect(parsed.success).toBe(false);
	});

	it("rejects chat n", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			n: 1,
			messages: [{ role: "user", content: "hello" }],
		});

		expect(parsed.success).toBe(false);
	});

	it("accepts responses streaming when tools are present", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			stream: true,
			input: "hello",
			tools: [{
				type: "function",
				name: "lookup",
				parameters: { type: "object" },
			}],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts gateway datetime server tool on responses requests", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "what time is it?",
			tools: [{
				type: "gateway:datetime",
				parameters: {
					timezone: "UTC",
				},
			}],
			tool_choice: "gateway:datetime",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web search server tool on responses requests", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "find recent AI news",
			tools: [{
				type: "ai-stats:web_search",
				parameters: {
					max_results: 4,
					include_text: false,
				},
			}],
			tool_choice: "ai-stats:web_search",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web fetch server tool on responses requests", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "fetch this page",
			tools: [{
				type: "ai-stats:web_fetch",
				parameters: {
					max_chars: 12000,
				},
			}],
			tool_choice: "ai-stats:web_fetch",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats advisor server tool on responses requests", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "review this plan",
			tools: [{
				type: "ai-stats:advisor",
				parameters: {
					name: "architect",
					instructions: "Focus on system design tradeoffs.",
					forward_transcript: false,
					max_uses: 1,
					max_completion_tokens: 1600,
				},
			}],
			tool_choice: { type: "tool", name: "ai-stats:advisor" },
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats image generation and apply patch server tools on responses requests", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "create an image and propose a patch",
			tools: [
				{
					type: "ai-stats:image_generation",
					parameters: {
						model: "openai/gpt-image-2",
						size: "1024x1024",
					},
				},
				{
					type: "ai-stats:apply_patch",
					parameters: { engine: "auto" },
				},
			],
			tool_choice: "ai-stats:apply_patch",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts responses text config", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "hello",
			text: {
				format: {
					type: "json_schema",
					json_schema: {
						name: "answer",
						schema: { type: "object" },
						strict: false,
					},
				},
			},
		});
		expect(parsed.success).toBe(true);
	});

	it("accepts phase on assistant message items in responses input", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-5.4",
			input: [{
				type: "message",
				role: "assistant",
				phase: "final_answer",
				content: [{ type: "output_text", text: "answer" }],
			}],
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects phase on non-assistant message items in responses input", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-5.4",
			input: [{
				type: "message",
				role: "user",
				phase: "commentary",
				content: [{ type: "input_text", text: "hello" }],
			}],
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects invalid assistant phase values in responses input", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-5.4",
			input: [{
				type: "message",
				role: "assistant",
				phase: "draft",
				content: [{ type: "output_text", text: "answer" }],
			}],
		});
		expect(parsed.success).toBe(false);
	});

	it("accepts global beta flags", () => {
		const chatParsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			messages: [{ role: "user", content: "hello" }],
			beta: { openai_websocket_mode: true },
		});
		expect(chatParsed.success).toBe(true);

		const responsesParsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "hello",
			beta: { openai: { websocket_mode: true } },
		});
		expect(responsesParsed.success).toBe(true);
	});

	it("accepts responses provider_options.openai.context_management", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "openai/gpt-5-nano",
			input: "hello",
			provider_options: {
				openai: {
					context_management: {
						type: "compaction",
						compact_threshold: 0.6,
					},
				},
			},
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts gateway datetime server tool on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "what time is it?" }],
			tools: [{
				type: "gateway:datetime",
				parameters: { timezone: "Europe/London" },
			}],
		});
		expect(parsed.success).toBe(true);
	});

	it("accepts explicit web_search_options on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "find recent AI news" }],
			web_search_options: {
				search_context_size: "high",
			},
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts gateway plugins on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "return strict JSON" }],
			plugins: [{ id: "response-healing" }],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web search server tool on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "find recent AI news" }],
			tools: [{
				type: "ai-stats:web_search",
				parameters: { max_results: 3 },
			}],
		});
		expect(parsed.success).toBe(true);
	});

	it("accepts native anthropic web search tools on messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "find recent AI news" }],
			tools: [{
				type: "web_search_20250305",
				name: "web_search",
				max_uses: 3,
				allowed_domains: ["docs.anthropic.com"],
			}],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats web fetch server tool on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "fetch this page" }],
			tools: [{
				type: "ai-stats:web_fetch",
				parameters: { max_chars: 4000 },
			}],
		});
		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats image generation server tool on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 128,
			messages: [{ role: "user", content: "make an image" }],
			tools: [{
				type: "ai-stats:image_generation",
				parameters: {
					model: "openai/gpt-image-2",
					aspect_ratio: "1:1",
				},
			}],
		});
		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats advisor server tool on chat requests", () => {
		const parsed = ChatCompletionsSchema.safeParse({
			model: "anthropic/claude-sonnet-4.6",
			messages: [{ role: "user", content: "plan this refactor" }],
			tools: [{
				type: "ai-stats:advisor",
				parameters: {
					model: "claude-opus-4-8",
					max_uses: 2,
					max_tokens: 1400,
				},
			}],
			tool_choice: "ai-stats:advisor",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts Anthropic native web fetch on anthropic messages requests", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "claude-sonnet-4.6",
			max_tokens: 1024,
			messages: [{ role: "user", content: "read https://docs.ai-stats.com" }],
			tools: [{
				type: "web_fetch_20260209",
				name: "web_fetch",
				max_content_tokens: 9000,
				allowed_domains: ["docs.ai-stats.com"],
			}],
			tool_choice: { type: "tool", name: "web_fetch" },
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts AI Stats advisor and native Anthropic advisor on messages requests", () => {
		const aiStatsParsed = AnthropicMessagesSchema.safeParse({
			model: "claude-sonnet-4.6",
			max_tokens: 1024,
			messages: [{ role: "user", content: "plan this refactor" }],
			tools: [{
				type: "ai-stats:advisor",
				parameters: {
					name: "reviewer",
					model: "claude-opus-4-8",
					instructions: "Review for correctness and missing edge cases.",
					forward_transcript: true,
					max_uses: 2,
					max_completion_tokens: 1400,
					reasoning: { effort: "high" },
					temperature: 0.2,
				},
			}],
			tool_choice: { type: "tool", name: "ai-stats:advisor" },
		});
		expect(aiStatsParsed.success).toBe(true);

		const nativeParsed = AnthropicMessagesSchema.safeParse({
			model: "claude-sonnet-4.6",
			max_tokens: 1024,
			messages: [{ role: "user", content: "plan this refactor" }],
			tools: [{
				type: "advisor_20260301",
				name: "advisor",
				model: "claude-opus-4-8",
				max_uses: 2,
				max_tokens: 1400,
			}],
			tool_choice: { type: "tool", name: "advisor" },
		});
		expect(nativeParsed.success).toBe(true);
	});

	it("accepts Anthropic advisor server-tool blocks in messages history", () => {
		const parsed = AnthropicMessagesSchema.safeParse({
			model: "claude-sonnet-4.6",
			max_tokens: 1024,
			messages: [
				{
					role: "assistant",
					content: [
						{
							type: "server_tool_use",
							id: "srvu_123",
							name: "advisor",
							input: {},
						},
						{
							type: "advisor_tool_result",
							tool_use_id: "srvu_123",
							content: [{ type: "text", text: "Use a smaller patch." }],
						},
					],
				},
				{ role: "user", content: "continue" },
			],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts session_id on text request bodies", () => {
		const chatParsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			session_id: "conversation-123",
			messages: [{ role: "user", content: "hello" }],
		});
		expect(chatParsed.success).toBe(true);

		const responsesParsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			session_id: "conversation-123",
			input: "hello",
		});
		expect(responsesParsed.success).toBe(true);

		const messagesParsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			session_id: "conversation-123",
			max_tokens: 128,
			messages: [{ role: "user", content: "hello" }],
		});
		expect(messagesParsed.success).toBe(true);
	});

	it("rejects session_id values longer than 256 chars on text request bodies", () => {
		const tooLong = "s".repeat(257);

		const chatParsed = ChatCompletionsSchema.safeParse({
			model: "gpt-4.1",
			session_id: tooLong,
			messages: [{ role: "user", content: "hello" }],
		});
		expect(chatParsed.success).toBe(false);

		const responsesParsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			session_id: tooLong,
			input: "hello",
		});
		expect(responsesParsed.success).toBe(false);

		const messagesParsed = AnthropicMessagesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			session_id: tooLong,
			max_tokens: 128,
			messages: [{ role: "user", content: "hello" }],
		});
		expect(messagesParsed.success).toBe(false);
	});

	it("accepts provider-specific cache options in provider_options", () => {
		const responsesParsed = ResponsesSchema.safeParse({
			model: "anthropic/claude-3.7-sonnet",
			input: "hello",
			provider_options: {
				anthropic: {
					cache_control: {
						type: "ephemeral",
						ttl: "1h",
						scope: "all_text",
					},
				},
				google: {
					cached_content: "cachedContents/demo-cache",
					cache_ttl: "1h",
				},
			},
		});
		expect(responsesParsed.success).toBe(true);

		const chatParsed = ChatCompletionsSchema.safeParse({
			model: "openai/gpt-5-nano",
			messages: [{ role: "user", content: "hello" }],
			provider_options: {
				google: {
					cache_control: { type: "ephemeral", ttl: "5m" },
					cached_content: "cachedContents/demo-cache",
					cache_ttl: "5m",
				},
			},
		});
		expect(chatParsed.success).toBe(true);
	});

	it("rejects unsupported context management type", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "openai/gpt-5-nano",
			input: "hello",
			provider_options: {
				openai: {
					context_management: {
						type: "invalid",
					},
				},
			},
		});

		expect(parsed.success).toBe(false);
	});

	it("rejects responses n", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			n: 1,
			input: "hello",
		});

		expect(parsed.success).toBe(false);
	});
});

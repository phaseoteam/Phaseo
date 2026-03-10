import { describe, expect, it } from "vitest";
import { ChatCompletionsSchema, ResponsesSchema } from "../schemas";

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


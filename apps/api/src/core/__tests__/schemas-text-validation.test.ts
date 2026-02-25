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

	it("accepts responses response_format json_schema and json_object", () => {
		const jsonSchemaParsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "hello",
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: { type: "object" },
					strict: false,
				},
			},
		});
		expect(jsonSchemaParsed.success).toBe(true);

		const jsonObjectParsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			input: "hello",
			response_format: { type: "json_object" },
		});
		expect(jsonObjectParsed.success).toBe(true);
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

	it("rejects responses n", () => {
		const parsed = ResponsesSchema.safeParse({
			model: "gpt-4.1",
			n: 1,
			input: "hello",
		});

		expect(parsed.success).toBe(false);
	});
});

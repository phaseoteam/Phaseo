import { describe, expect, it } from "vitest";
import {
	extractCompletedResponseUsage,
	normalizeOpenAIWsResponseCreateEvent,
	resolveWebSocketErrorCode,
} from "./responses-ws";

describe("responses websocket request normalization", () => {
	it("normalizes OpenAI-prefixed model and enforces store=false", () => {
		const result = normalizeOpenAIWsResponseCreateEvent({
			type: "response.create",
			model: "openai/gpt-5-nano",
			store: true,
			stream: true,
			background: true,
			input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.gatewayModel).toBe("openai/gpt-5-nano");
		expect(result.payload.model).toBe("gpt-5-nano");
		expect(result.payload.store).toBe(false);
		expect(result.payload.stream).toBeUndefined();
		expect(result.payload.background).toBeUndefined();
	});

	it("accepts plain OpenAI model slugs and rewrites gateway model", () => {
		const result = normalizeOpenAIWsResponseCreateEvent({
			type: "response.create",
			model: "gpt-5-nano",
			store: false,
			stream_options: { include_usage: true },
			input: "hello",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.gatewayModel).toBe("openai/gpt-5-nano");
		expect(result.payload.model).toBe("gpt-5-nano");
		expect(result.payload.store).toBe(false);
		expect(result.payload.stream_options).toBeUndefined();
	});

	it("rejects non-OpenAI provider model prefixes", () => {
		const result = normalizeOpenAIWsResponseCreateEvent({
			type: "response.create",
			model: "anthropic/claude-sonnet-4",
			input: "hello",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("only OpenAI models");
	});

	it("rejects non-response.create events", () => {
		const result = normalizeOpenAIWsResponseCreateEvent({
			type: "response.cancel",
			model: "openai/gpt-5-nano",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("response.create");
	});

	it("rejects missing model", () => {
		const result = normalizeOpenAIWsResponseCreateEvent({
			type: "response.create",
			input: "hello",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("model is required");
	});

	it("rejects non-object payloads", () => {
		const result = normalizeOpenAIWsResponseCreateEvent("hello");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("JSON object");
	});
});

describe("responses websocket error code extraction", () => {
	it("prefers top-level code", () => {
		expect(resolveWebSocketErrorCode({ code: "session_timeout" })).toBe("session_timeout");
	});

	it("reads nested error.code", () => {
		expect(resolveWebSocketErrorCode({ error: { code: "previous_response_not_found" } })).toBe("previous_response_not_found");
	});

	it("returns null for invalid payloads", () => {
		expect(resolveWebSocketErrorCode(null)).toBeNull();
		expect(resolveWebSocketErrorCode("oops")).toBeNull();
		expect(resolveWebSocketErrorCode({})).toBeNull();
	});
});

describe("responses websocket completed usage extraction", () => {
	it("extracts usage and response id from response.completed events", () => {
		const parsed = extractCompletedResponseUsage({
			type: "response.completed",
			response: {
				id: "resp_123",
				usage: {
					input_tokens: 10,
					output_tokens: 5,
					total_tokens: 15,
				},
			},
		});
		expect(parsed.responseId).toBe("resp_123");
		expect(parsed.usage).toEqual({
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
		});
	});

	it("returns null usage for non-completed events", () => {
		const parsed = extractCompletedResponseUsage({
			type: "response.output_text.delta",
			delta: "hi",
		});
		expect(parsed.responseId).toBeNull();
		expect(parsed.usage).toBeNull();
	});

	it("returns null usage when response payload is missing", () => {
		const parsed = extractCompletedResponseUsage({
			type: "response.completed",
		});
		expect(parsed.responseId).toBeNull();
		expect(parsed.usage).toBeNull();
	});
});

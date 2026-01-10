// OpenAI Chat Completions - Encoder Tests
import { describe, it, expect } from "vitest";
import { encodeOpenAIChatResponse } from "../encode";
import type { IRChatResponse } from "@core/ir";

describe("encodeOpenAIChatResponse", () => {
	it("should encode simple text response", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Hello! How can I help you today?",
					},
					finishReason: "stop",
				},
			],
			usage: {
				promptTokens: 10,
				completionTokens: 8,
				totalTokens: 18,
			},
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

        expect(response.id).toBe("req-123");
        expect(response.nativeResponseId).toBe("chatcmpl-abc123");
		expect(response.model).toBe("gpt-4");
		expect(response.object).toBe("chat.completion");
		expect(response.choices).toHaveLength(1);
		expect(response.choices[0].message).toEqual({
			role: "assistant",
			content: "Hello! How can I help you today?",
		});
		expect(response.choices[0].finish_reason).toBe("stop");
		expect(response.usage).toEqual({
			prompt_tokens: 10,
			completion_tokens: 8,
			total_tokens: 18,
		});
	});

	it("should encode tool calls in response", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_abc123",
								name: "get_weather",
								arguments: '{"location": "Paris"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
			usage: {
				promptTokens: 50,
				completionTokens: 15,
				totalTokens: 65,
			},
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.choices[0].message.tool_calls).toHaveLength(1);
		expect(response.choices[0].message.tool_calls![0]).toEqual({
			id: "call_abc123",
			type: "function",
			function: {
				name: "get_weather",
				arguments: '{"location": "Paris"}',
			},
		});
		expect(response.choices[0].finish_reason).toBe("tool_calls");
	});

	it("should encode multiple tool calls", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								name: "get_weather",
								arguments: '{"location": "Paris"}',
							},
							{
								id: "call_2",
								name: "get_weather",
								arguments: '{"location": "London"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.choices[0].message.tool_calls).toHaveLength(2);
		expect(response.choices[0].message.tool_calls![0].id).toBe("call_1");
		expect(response.choices[0].message.tool_calls![1].id).toBe("call_2");
	});

	it("should handle missing usage gracefully", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Response without usage",
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.usage).toBeUndefined();
	});

	it("should encode different finish reasons", () => {
		const testCases: Array<{
			irReason: IRChatResponse["choices"][0]["finishReason"];
			expected: string;
		}> = [
			{ irReason: "stop", expected: "stop" },
			{ irReason: "length", expected: "length" },
			{ irReason: "tool_calls", expected: "tool_calls" },
			{ irReason: "content_filter", expected: "content_filter" },
		];

		for (const { irReason, expected } of testCases) {
			const ir: IRChatResponse = {
				id: "req-123",
				nativeId: "chatcmpl-abc123",
				model: "gpt-4",
				choices: [
					{
						index: 0,
						message: { role: "assistant", content: "Test" },
						finishReason: irReason,
					},
				],
			};

			const response = encodeOpenAIChatResponse(ir, "req-123");
			expect(response.choices[0].finish_reason).toBe(expected);
		}
	});

	it("should preserve null content when there are tool calls", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: null,
						toolCalls: [
							{
								id: "call_1",
								name: "test",
								arguments: "{}",
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.choices[0].message.content).toBeNull();
		expect(response.choices[0].message.tool_calls).toBeDefined();
	});

	it("should use fallback ID when nativeId is missing", () => {
		const ir: IRChatResponse = {
			id: "req-456",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: "Test" },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-456");

		expect(response.id).toBe("req-456");
	});

	it("should include created timestamp", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: "Test" },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.created).toBeGreaterThan(0);
		expect(typeof response.created).toBe("number");
	});

	it("should handle empty content string", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: "" },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.choices[0].message.content).toBe("");
	});

	it("should encode refusal if present", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "",
						refusal: "I cannot help with that request.",
					},
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.choices[0].message.refusal).toBe(
			"I cannot help with that request."
		);
	});

	it("should handle multiple choices", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: "First response" },
					finishReason: "stop",
				},
				{
					index: 1,
					message: { role: "assistant", content: "Second response" },
					finishReason: "stop",
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		expect(response.choices).toHaveLength(2);
		expect(response.choices[0].index).toBe(0);
		expect(response.choices[1].index).toBe(1);
	});

	it("should handle reasoning choices separately", () => {
		const ir: IRChatResponse = {
			id: "req-123",
			nativeId: "chatcmpl-abc123",
			model: "gpt-4",
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: "Thinking..." },
					finishReason: "stop",
					reasoning: true,
				},
				{
					index: 1,
					message: { role: "assistant", content: "Final answer" },
					finishReason: "stop",
					reasoning: false,
				},
			],
		};

		const response = encodeOpenAIChatResponse(ir, "req-123");

		// Should encode both choices
		expect(response.choices).toHaveLength(2);
	});
});

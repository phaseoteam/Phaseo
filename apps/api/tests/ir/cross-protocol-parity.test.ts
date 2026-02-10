// Cross-protocol parity tests
// Verifies that the same IR produces functionally equivalent outputs across protocols

import { describe, it, expect } from "vitest";
import type { IRChatResponse } from "@core/ir";
import { encodeOpenAIChatResponse } from "@/protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@/protocols/openai-responses/encode";
import { encodeAnthropicMessagesResponse } from "@/protocols/anthropic-messages/encode";

describe("Cross-Protocol Parity", () => {
	const baseIR: IRChatResponse = {
		id: "req_gateway123",
		nativeId: "chatcmpl_provider456",
		created: 1234567890,
		model: "gpt-4",
		provider: "openai",
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: [{ type: "text", text: "This is a test response." }],
				},
				finishReason: "stop",
			},
		],
		usage: {
			inputTokens: 10,
			outputTokens: 5,
			totalTokens: 15,
		},
	};

	describe("Basic Message Parity", () => {
		it("should produce equivalent content across all protocols", () => {
			const chatResponse = encodeOpenAIChatResponse(baseIR, "req_gateway123");
			const responsesResponse = encodeOpenAIResponsesResponse(baseIR, "req_gateway123");
			const anthropicResponse = encodeAnthropicMessagesResponse(baseIR);

			// Content should be the same
			expect(chatResponse.choices[0].message.content).toBe("This is a test response.");
			expect(anthropicResponse.content[0].type).toBe("text");
			expect((anthropicResponse.content[0] as any).text).toBe("This is a test response.");

			// Responses API has different structure but same content
			const responsesOutput = responsesResponse.output[0];
			expect(responsesOutput.type).toBe("message");
			expect((responsesOutput as any).content[0].text).toBe("This is a test response.");
		});

		it("should use gateway request ID consistently", () => {
			const requestId = "req_gateway123";

			const chatResponse = encodeOpenAIChatResponse(baseIR, requestId);
			const responsesResponse = encodeOpenAIResponsesResponse(baseIR, requestId);
			const anthropicResponse = encodeAnthropicMessagesResponse(baseIR);

			// All protocols should use the gateway request ID as primary
			expect(chatResponse.id).toBe(requestId);
			expect(responsesResponse.id).toBe(requestId);
			expect(anthropicResponse.id).toBe(baseIR.id); // Uses IR id which is the gateway id
		});

		it("should map usage statistics consistently", () => {
			const chatResponse = encodeOpenAIChatResponse(baseIR, "req_test");
			const responsesResponse = encodeOpenAIResponsesResponse(baseIR, "req_test");
			const anthropicResponse = encodeAnthropicMessagesResponse(baseIR);

			// OpenAI formats
			expect(chatResponse.usage?.prompt_tokens).toBe(10);
			expect(chatResponse.usage?.completion_tokens).toBe(5);
			expect(chatResponse.usage?.total_tokens).toBe(15);

			expect(responsesResponse.usage?.prompt_tokens).toBe(10);
			expect(responsesResponse.usage?.completion_tokens).toBe(5);
			expect(responsesResponse.usage?.total_tokens).toBe(15);

			// Anthropic format (same values, different names)
			expect(anthropicResponse.usage?.input_tokens).toBe(10);
			expect(anthropicResponse.usage?.output_tokens).toBe(5);
		});
	});

	describe("Finish Reason Mapping", () => {
		const finishReasonTests: Array<{
			irReason: IRChatResponse["choices"][0]["finishReason"];
			expectedOpenAI: string;
			expectedAnthropic: string;
		}> = [
			{ irReason: "stop", expectedOpenAI: "stop", expectedAnthropic: "end_turn" },
			{ irReason: "length", expectedOpenAI: "length", expectedAnthropic: "max_tokens" },
			{ irReason: "tool_calls", expectedOpenAI: "tool_calls", expectedAnthropic: "tool_use" },
			{ irReason: "content_filter", expectedOpenAI: "content_filter", expectedAnthropic: "refusal" },
		];

		finishReasonTests.forEach(({ irReason, expectedOpenAI, expectedAnthropic }) => {
			it(`should map ${irReason} correctly across protocols`, () => {
				const irWithReason: IRChatResponse = {
					...baseIR,
					choices: [
						{
							...baseIR.choices[0],
							finishReason: irReason,
						},
					],
				};

				const chatResponse = encodeOpenAIChatResponse(irWithReason, "req_test");
				const responsesResponse = encodeOpenAIResponsesResponse(irWithReason, "req_test");
				const anthropicResponse = encodeAnthropicMessagesResponse(irWithReason);

				expect(chatResponse.choices[0].finish_reason).toBe(expectedOpenAI);

				// Responses API maps some finish reasons to status
				if (irReason === "length") {
					expect(responsesResponse.status).toBe("incomplete");
				} else if (irReason === "error") {
					expect(responsesResponse.status).toBe("failed");
				} else {
					expect(responsesResponse.status).toBe("completed");
				}

				expect(anthropicResponse.stop_reason).toBe(expectedAnthropic);
			});
		});
	});

	describe("Tool Calling Parity", () => {
		const irWithTools: IRChatResponse = {
			...baseIR,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: [],
						toolCalls: [
							{
								id: "call_abc123",
								name: "get_weather",
								arguments: '{"location":"San Francisco","unit":"celsius"}',
							},
						],
					},
					finishReason: "tool_calls",
				},
			],
		};

		it("should encode tool calls correctly for OpenAI Chat", () => {
			const chatResponse = encodeOpenAIChatResponse(irWithTools, "req_test");

			expect(chatResponse.choices[0].finish_reason).toBe("tool_calls");
			expect(chatResponse.choices[0].message.tool_calls).toHaveLength(1);
			expect(chatResponse.choices[0].message.tool_calls![0].id).toBe("call_abc123");
			expect(chatResponse.choices[0].message.tool_calls![0].type).toBe("function");
			expect(chatResponse.choices[0].message.tool_calls![0].function.name).toBe("get_weather");
			expect(chatResponse.choices[0].message.tool_calls![0].function.arguments).toBe(
				'{"location":"San Francisco","unit":"celsius"}'
			);
		});

		it("should encode tool calls correctly for OpenAI Responses", () => {
			const responsesResponse = encodeOpenAIResponsesResponse(irWithTools, "req_test");

			// Responses API uses separate function_call items in output
			const functionCallItems = responsesResponse.output.filter((item: any) => item.type === "function_call");
			expect(functionCallItems).toHaveLength(1);
			expect((functionCallItems[0] as any).call_id).toBe("call_abc123");
			expect((functionCallItems[0] as any).name).toBe("get_weather");
			expect((functionCallItems[0] as any).arguments).toBe('{"location":"San Francisco","unit":"celsius"}');
		});

		it("should encode tool calls correctly for Anthropic Messages", () => {
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithTools);

			// Anthropic uses tool_use blocks in content array
			expect(anthropicResponse.stop_reason).toBe("tool_use");
			const toolUseBlocks = anthropicResponse.content.filter((c: any) => c.type === "tool_use");
			expect(toolUseBlocks).toHaveLength(1);
			expect((toolUseBlocks[0] as any).id).toBe("call_abc123");
			expect((toolUseBlocks[0] as any).name).toBe("get_weather");
			expect((toolUseBlocks[0] as any).input).toEqual({
				location: "San Francisco",
				unit: "celsius",
			});
		});

		it("should handle tool calls with text content", () => {
			const irWithToolsAndText: IRChatResponse = {
				...baseIR,
				choices: [
					{
						index: 0,
					message: {
						role: "assistant",
						content: [{ type: "text", text: "Let me check the weather for you." }],
						toolCalls: [
							{
									id: "call_xyz",
									name: "get_weather",
									arguments: '{"location":"NYC"}',
								},
							],
						},
						finishReason: "tool_calls",
					},
				],
			};

			const chatResponse = encodeOpenAIChatResponse(irWithToolsAndText, "req_test");
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithToolsAndText);

			// OpenAI: content and tool_calls both present
			expect(chatResponse.choices[0].message.content).toBe("Let me check the weather for you.");
			expect(chatResponse.choices[0].message.tool_calls).toHaveLength(1);

			// Anthropic: text block and tool_use block in content array
			expect(anthropicResponse.content).toHaveLength(2);
			expect(anthropicResponse.content[0].type).toBe("text");
			expect((anthropicResponse.content[0] as any).text).toBe("Let me check the weather for you.");
			expect(anthropicResponse.content[1].type).toBe("tool_use");
		});
	});

	describe("Empty and Edge Cases", () => {
		it("should handle empty content consistently", () => {
			const irWithEmptyContent: IRChatResponse = {
				...baseIR,
				choices: [
					{
						...baseIR.choices[0],
						message: {
							role: "assistant",
							content: [],
						},
					},
				],
			};

			const chatResponse = encodeOpenAIChatResponse(irWithEmptyContent, "req_test");
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithEmptyContent);

			expect(chatResponse.choices[0].message.content).toBe("");

			// Anthropic should include empty text block when no tool calls
			expect(anthropicResponse.content).toHaveLength(1);
			expect(anthropicResponse.content[0].type).toBe("text");
			expect((anthropicResponse.content[0] as any).text).toBe("");
		});

		it("should handle missing usage consistently", () => {
			const irWithoutUsage: IRChatResponse = {
				...baseIR,
				usage: undefined,
			};

			const chatResponse = encodeOpenAIChatResponse(irWithoutUsage, "req_test");
			const responsesResponse = encodeOpenAIResponsesResponse(irWithoutUsage, "req_test");
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithoutUsage);

			// All should handle missing usage gracefully
			expect(chatResponse.usage).toBeUndefined();
			expect(responsesResponse.usage).toBeUndefined();
			expect(anthropicResponse.usage?.input_tokens).toBe(0);
			expect(anthropicResponse.usage?.output_tokens).toBe(0);
		});
	});

	describe("Extended Usage Parity", () => {
		it("should preserve reasoning tokens across protocols", () => {
			const irWithReasoning: IRChatResponse = {
				...baseIR,
				usage: {
					inputTokens: 10,
					outputTokens: 5,
					totalTokens: 15,
					reasoningTokens: 20,
				},
			};

			const chatResponse = encodeOpenAIChatResponse(irWithReasoning, "req_test");
			const responsesResponse = encodeOpenAIResponsesResponse(irWithReasoning, "req_test");

			// Both OpenAI formats should preserve reasoning tokens
			expect(chatResponse.usage?.reasoning_tokens).toBe(20);
			expect(chatResponse.usage?.output_tokens_details?.reasoning_tokens).toBe(20);
			expect(responsesResponse.usage?.reasoning_tokens).toBe(20);

			// Anthropic doesn't have reasoning_tokens in their API
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithReasoning);
			expect((anthropicResponse.usage as any)?.reasoning_tokens).toBeUndefined();
		});

		it("should preserve cached tokens across protocols", () => {
			const irWithCaching: IRChatResponse = {
				...baseIR,
				usage: {
					inputTokens: 100,
					outputTokens: 50,
					totalTokens: 150,
					cachedInputTokens: 80,
				},
			};

			const chatResponse = encodeOpenAIChatResponse(irWithCaching, "req_test");
			const responsesResponse = encodeOpenAIResponsesResponse(irWithCaching, "req_test");

			// OpenAI formats should preserve cached tokens
			expect(chatResponse.usage?.input_details?.cached_tokens).toBe(80);
			expect(responsesResponse.usage?.prompt_tokens).toBe(100);
			expect(responsesResponse.usage?.completion_tokens).toBe(50);
		});
	});

	describe("Stop Sequence Preservation", () => {
		it("should preserve stop sequence for Anthropic", () => {
			const irWithStopSeq: IRChatResponse = {
				...baseIR,
				choices: [
					{
						...baseIR.choices[0],
						finishReason: "stop",
						stopSequence: "\n\n",
					},
				],
			};

			const anthropicResponse = encodeAnthropicMessagesResponse(irWithStopSeq);

			expect(anthropicResponse.stop_sequence).toBe("\n\n");
		});

		it("should handle missing stop sequence", () => {
			const anthropicResponse = encodeAnthropicMessagesResponse(baseIR);

			expect(anthropicResponse.stop_sequence).toBeNull();
		});
	});
});

// Test ID preservation through the IR pipeline
// Verifies that gateway IDs, native IDs, and upstream IDs are properly tracked

import { describe, it, expect } from "vitest";
import type { IRChatResponse } from "@core/ir";
import { encodeOpenAIChatResponse } from "@/protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@/protocols/openai-responses/encode";
import { encodeAnthropicMessagesResponse } from "@/protocols/anthropic-messages/encode";

describe("ID Preservation", () => {
	const mockIRResponse: IRChatResponse = {
		id: "req_test123",
		nativeId: "chatcmpl-provider456",
		created: 1234567890,
		model: "gpt-4",
		provider: "openai",
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: "Hello, world!",
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

	describe("OpenAI Chat Completions", () => {
		it("should use gateway requestId as primary id field", () => {
			const encoded = encodeOpenAIChatResponse(mockIRResponse, "req_test123");

			expect(encoded.id).toBe("req_test123");
			expect(encoded.nativeResponseId).toBe("chatcmpl-provider456");
		});

		it("should fallback to IR id when requestId not provided", () => {
			const encoded = encodeOpenAIChatResponse(mockIRResponse);

			expect(encoded.id).toBe("req_test123");
		});

		it("should preserve native response ID separately", () => {
			const encoded = encodeOpenAIChatResponse(mockIRResponse, "req_gateway");

			expect(encoded.id).toBe("req_gateway");
			expect(encoded.nativeResponseId).toBe("chatcmpl-provider456");
			// Gateway ID and native ID should be different
			expect(encoded.id).not.toBe(encoded.nativeResponseId);
		});
	});

	describe("OpenAI Responses API", () => {
		it("should use gateway requestId as primary id field (breaking change)", () => {
			const encoded = encodeOpenAIResponsesResponse(mockIRResponse, "req_test123");

			// After our fix, this should use requestId, not nativeId
			expect(encoded.id).toBe("req_test123");
		});

		it("should fallback to IR id when requestId not provided", () => {
			const encoded = encodeOpenAIResponsesResponse(mockIRResponse);

			expect(encoded.id).toBe("req_test123");
		});
	});

	describe("Anthropic Messages", () => {
		it("should use gateway request ID", () => {
			const encoded = encodeAnthropicMessagesResponse(mockIRResponse);

			expect(encoded.id).toBe("req_test123");
		});

		it("should preserve native response ID at top level", () => {
			const encoded = encodeAnthropicMessagesResponse(mockIRResponse);

			expect(encoded.nativeResponseId).toBe("chatcmpl-provider456");
		});

		it("should have consistent ID format with other protocols", () => {
			const encoded = encodeAnthropicMessagesResponse(mockIRResponse);

			// Should have same structure as OpenAI protocols
			expect(encoded.id).toBe("req_test123"); // Gateway ID
			expect(encoded.nativeResponseId).toBe("chatcmpl-provider456"); // Provider ID
		});
	});

	describe("ID Consistency", () => {
		it("should maintain identical ID structure across all protocols", () => {
			const requestId = "req_gateway123";
			const nativeId = "chatcmpl-native456";

			const irWithIds: IRChatResponse = {
				...mockIRResponse,
				id: requestId,
				nativeId,
			};

			const chatResponse = encodeOpenAIChatResponse(irWithIds, requestId);
			const responsesResponse = encodeOpenAIResponsesResponse(irWithIds, requestId);
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithIds);

			// All should use gateway request ID as primary
			expect(chatResponse.id).toBe(requestId);
			expect(responsesResponse.id).toBe(requestId);
			expect(anthropicResponse.id).toBe(requestId);

			// All should preserve native ID in the SAME location
			expect(chatResponse.nativeResponseId).toBe(nativeId);
			expect(responsesResponse.nativeResponseId).toBe(nativeId);
			expect(anthropicResponse.nativeResponseId).toBe(nativeId);
		});
	});

	describe("Missing ID Handling", () => {
		it("should handle missing nativeId gracefully across all protocols", () => {
			const irWithoutNativeId: IRChatResponse = {
				...mockIRResponse,
				nativeId: undefined,
			};

			const chatResponse = encodeOpenAIChatResponse(irWithoutNativeId, "req_test");
			const responsesResponse = encodeOpenAIResponsesResponse(irWithoutNativeId, "req_test");
			const anthropicResponse = encodeAnthropicMessagesResponse(irWithoutNativeId);

			// Should still work with undefined nativeId - consistent across all protocols
			expect(chatResponse.id).toBe("req_test");
			expect(chatResponse.nativeResponseId).toBeUndefined();

			expect(responsesResponse.id).toBe("req_test");
			expect(responsesResponse.nativeResponseId).toBeUndefined();

			expect(anthropicResponse.id).toBe("req_test123");
			expect(anthropicResponse.nativeResponseId).toBeUndefined();
		});
	});

	describe("Stop Sequence Preservation", () => {
		it("should preserve stop sequence in IR and Anthropic encoding", () => {
			const irWithStopSeq: IRChatResponse = {
				...mockIRResponse,
				choices: [
					{
						...mockIRResponse.choices[0],
						stopSequence: "\n\n",
					},
				],
			};

			const anthropicResponse = encodeAnthropicMessagesResponse(irWithStopSeq);

			expect(anthropicResponse.stop_sequence).toBe("\n\n");
		});

		it("should handle missing stop sequence", () => {
			const anthropicResponse = encodeAnthropicMessagesResponse(mockIRResponse);

			expect(anthropicResponse.stop_sequence).toBeNull();
		});
	});
});

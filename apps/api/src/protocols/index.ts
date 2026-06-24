// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Protocol codec registry
// Provides encode/decode functions for all supported protocols

import type { Protocol } from "./detect";
import type { IRChatRequest, IRChatResponse } from "@core/ir";
import type { ChatCompletionsRequest, InteractionsRequest } from "@core/schemas";
import type { GatewayCompletionsResponse } from "@core/types";

import { decodeOpenAIChatRequest } from "./openai-chat/decode";
import { encodeOpenAIChatResponse } from "./openai-chat/encode";
import { decodeOpenAIResponsesRequest } from "./openai-responses/decode";
import { encodeOpenAIResponsesResponse } from "./openai-responses/encode";
import { decodeGoogleInteractionsRequest } from "./google-interactions/decode";
import { encodeGoogleInteractionsResponse } from "./google-interactions/encode";
import { decodeAnthropicMessagesRequest } from "./anthropic-messages/decode";
import { encodeAnthropicMessagesResponse } from "./anthropic-messages/encode";

/**
 * Decode a protocol-specific request to IR
 *
 * @param protocol - Protocol identifier
 * @param body - Validated request body
 * @returns IR chat request
 * @throws Error if protocol not supported
 */
export function decodeProtocol(protocol: Protocol, body: any): IRChatRequest {
	switch (protocol) {
		case "openai.chat.completions":
			return decodeOpenAIChatRequest(body as ChatCompletionsRequest);

		case "openai.responses":
			return decodeOpenAIResponsesRequest(body);

		case "google.interactions":
			return decodeGoogleInteractionsRequest(body as InteractionsRequest);

		case "anthropic.messages":
			return decodeAnthropicMessagesRequest(body);

		default:
			throw new Error(`Unknown protocol: ${protocol}`);
	}
}

/**
 * Encode IR response to protocol-specific format
 *
 * @param protocol - Protocol identifier
 * @param ir - IR chat response
 * @param requestId - Gateway request ID
 * @returns Protocol-specific response
 * @throws Error if protocol not supported
 */
export function encodeProtocol(
	protocol: Protocol,
	ir: IRChatResponse,
	requestId: string,
): GatewayCompletionsResponse | any {
	switch (protocol) {
		case "openai.chat.completions":
			return encodeOpenAIChatResponse(ir, requestId);

		case "openai.responses":
			return encodeOpenAIResponsesResponse(ir);

		case "google.interactions":
			return encodeGoogleInteractionsResponse(ir, requestId);

		case "anthropic.messages":
			return encodeAnthropicMessagesResponse(ir);

		default:
			throw new Error(`Unknown protocol: ${protocol}`);
	}
}

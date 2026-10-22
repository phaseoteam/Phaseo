// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Provider Quirks System
// Handles provider-specific transformations for OpenAI-compatible APIs

import type { IRChatRequest } from "@core/ir";

/**
 * Provider quirks interface
 * Each provider can implement custom logic for request/response transformations
 */
export interface ProviderQuirks {
	/**
	 * Transform request before sending to provider
	 * Allows adding custom fields, modifying parameters, etc.
	 */
	transformRequest?(args: {
		request: any; // The OpenAI-format request about to be sent
		ir: IRChatRequest; // Original IR request for context
		model?: string | null;
	}): void;

	/**
	 * Extract reasoning content from response choice
	 * Returns { main: content, reasoning: [...reasoningBlocks] }
	 */
	extractReasoning?(args: {
		choice: any; // Response choice object
		rawContent: string; // Extracted text content
	}): { main: string; reasoning: string[] };

	/**
	 * Transform streaming chunk
	 * Allows modifying chunks in real-time (e.g., extract reasoning_content deltas)
	 */
	transformStreamChunk?(args: {
		chunk: any; // Streaming chunk
		accumulated: any; // Accumulated state
	}): void;

	/**
	 * Normalize response after buffering
	 * Allows final cleanup/transformation of complete response
	 */
	normalizeResponse?(args: {
		response: any; // Complete response
		ir: IRChatRequest; // Original IR request for context
	}): void;

	/**
	 * Normalize the complete response carried by a streamed Responses API terminal event
	 * (`response.completed` / `response.incomplete`) before it is forwarded, so streamed
	 * clients and billing see the same usage as a buffered response.
	 */
	normalizeStreamedResponse?(args: {
		response: any; // Complete response from the terminal event
	}): void;
}

/**
 * Context for quirks application
 */
export interface QuirksContext {
	providerId: string;
	ir: IRChatRequest;
	model?: string | null;
}


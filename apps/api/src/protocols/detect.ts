// Purpose: Protocol adapter for client-facing payloads.
// Why: Keeps protocol encoding/decoding separate from provider logic.
// How: Maps between protocol payloads and IR structures.

// Protocol detection logic
// Determines which protocol codec to use based on the endpoint and request path

import type { Endpoint } from "@core/types";

/**
 * Protocol identifiers
 * Each protocol represents a client-facing API format:
 * - openai.chat.completions: OpenAI Chat Completions API
 * - openai.responses: OpenAI Responses API (unified responses format)
 * - anthropic.messages: Anthropic Messages API
 */
export type Protocol =
	| "openai.chat.completions"
	| "openai.responses"
	| "openai.embeddings"
	| "openai.moderations"
	| "anthropic.messages";

/**
 * Detect which protocol the client is using based on endpoint and request path
 *
 * Detection strategy:
 * 1. Check request path for explicit protocol indicators
 * 2. Fall back to endpoint type
 *
 * @param endpoint - The gateway endpoint being called
 * @param requestPath - The HTTP request path (e.g., "/v1/chat/completions")
 * @returns The detected protocol
 */
export function detectProtocol(endpoint: Endpoint, requestPath?: string): Protocol {
	// Explicit Anthropic Messages API route
	if (requestPath?.includes("/v1/messages") || requestPath?.includes("/messages")) {
		return "anthropic.messages";
	}

	// Endpoint-based detection
	switch (endpoint) {
		case "responses":
			return "openai.responses";

		case "embeddings":
			return "openai.embeddings";
		case "moderations":
			return "openai.moderations";

		case "chat.completions":
			return "openai.chat.completions";

		// Default: treat everything else as OpenAI Chat for now
		// (embeddings, images, audio, etc. will use OpenAI-compatible format)
		default:
			return "openai.chat.completions";
	}
}

/**
 * Get the canonical path for a protocol
 * Useful for route registration and documentation
 */
export function getProtocolPath(protocol: Protocol): string {
	switch (protocol) {
		case "openai.chat.completions":
			return "/v1/chat/completions";
		case "openai.responses":
			return "/v1/responses";
		case "openai.embeddings":
			return "/v1/embeddings";
		case "openai.moderations":
			return "/v1/moderations";
		case "anthropic.messages":
			return "/v1/messages";
	}
}

/**
 * Check if a protocol supports a specific feature
 */
export function protocolSupportsFeature(
	protocol: Protocol,
	feature: "tools" | "streaming" | "reasoning" | "multimodal",
): boolean {
	switch (feature) {
		case "tools":
			// All protocols support tool calling
			return true;

		case "streaming":
			// All protocols support streaming
			return protocol !== "openai.embeddings" && protocol !== "openai.moderations";

		case "reasoning":
			// OpenAI Responses API has native reasoning support
			// Chat Completions can represent it via our split-choice mechanism
			// Anthropic Messages may support thinking blocks (future)
			return protocol === "openai.responses" || protocol === "openai.chat.completions";

		case "multimodal":
			// All protocols support multimodal content
			return true;

		default:
			return false;
	}
}

/**
 * Get human-readable protocol name for logging/observability
 */
export function getProtocolDisplayName(protocol: Protocol): string {
	switch (protocol) {
		case "openai.chat.completions":
			return "OpenAI Chat Completions";
		case "openai.responses":
			return "OpenAI Responses";
		case "openai.embeddings":
			return "OpenAI Embeddings";
		case "openai.moderations":
			return "OpenAI Moderations";
		case "anthropic.messages":
			return "Anthropic Messages";
	}
}


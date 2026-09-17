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
	| "openai.rerank"
	| "typesafe.systemone"
	| "anthropic.messages";

export type TextProtocol =
	| "openai.chat.completions"
	| "openai.responses"
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
		case "rerank":
			return "openai.rerank";
		case "systemone":
			return "typesafe.systemone";

		case "chat.completions":
			return "openai.chat.completions";

		// Default: treat everything else as OpenAI Chat for now
		// (embeddings, images, audio, etc. will use OpenAI-compatible format)
		default:
			return "openai.chat.completions";
	}
}

export function detectTextProtocol(
	endpoint: Endpoint,
	requestPath?: string,
): TextProtocol {
	if (requestPath?.includes("/v1/messages") || requestPath?.includes("/messages")) {
		return "anthropic.messages";
	}

	switch (endpoint) {
		case "responses":
			return "openai.responses";
		case "chat.completions":
			return "openai.chat.completions";
		case "messages":
			return "anthropic.messages";
		default:
			throw new Error(
				`Text protocol detection received unsupported endpoint: ${endpoint}`,
			);
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
		case "openai.rerank":
			return "/v1/rerank";
		case "typesafe.systemone":
			return "/v1/systemone";
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
			// Structured decision evaluation is not a tool-calling protocol.
			return protocol !== "typesafe.systemone";

		case "streaming":
			// All protocols support streaming
			return protocol !== "openai.embeddings" && protocol !== "openai.moderations" && protocol !== "openai.rerank" && protocol !== "typesafe.systemone";

		case "reasoning":
			// OpenAI Responses API has native reasoning support
			// Chat Completions can represent it via our split-choice mechanism
			// Anthropic Messages may support thinking blocks (future)
			return protocol === "openai.responses" || protocol === "openai.chat.completions";

		case "multimodal":
			// TypeSafe receives structured state, not multimodal message content.
			return protocol !== "typesafe.systemone";

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
		case "openai.rerank":
			return "OpenAI Rerank";
		case "typesafe.systemone":
			return "TypeSafe System One";
		case "anthropic.messages":
			return "Anthropic Messages";
	}
}

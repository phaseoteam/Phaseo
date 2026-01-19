// Intermediate Representation (IR) types for the AI Stats Gateway
// This IR provides a protocol-agnostic format for chat completions that can:
// 1. Represent OpenAI Chat Completions, OpenAI Responses API, and Anthropic Messages
// 2. Handle tool calling across all three protocols
// 3. Support multimodal content (text, images, audio, video)
// 4. Support reasoning/thinking (MiniMax-style interleaved thinking)

// ============================================================================
// CONTENT PRIMITIVES
// ============================================================================

/**
 * Content parts represent different types of media in messages
 */
export type IRContentPart =
	| { type: "text"; text: string }
	| {
			type: "image";
			source: "url" | "data";
			data: string; // URL or base64
			mimeType?: string;
			detail?: "auto" | "low" | "high"; // OpenAI detail level
	  }
	| {
			type: "audio";
			source: "url" | "data";
			data: string; // URL or base64
			format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
	  }
	| {
			type: "video";
			source: "url";
			url: string;
	  };

// ============================================================================
// TOOL CALLING
// ============================================================================

/**
 * Tool definition (function schema)
 * Compatible with OpenAI tools[] and Anthropic tools[]
 */
export type IRTool = {
	name: string;
	description?: string;
	parameters: Record<string, any>; // JSON Schema
};

/**
 * Tool call from assistant (request to execute a tool)
 * Maps from:
 * - OpenAI: message.tool_calls[]
 * - OpenAI Responses: function_call output item
 * - Anthropic: content block with type="tool_use"
 */
export type IRToolCall = {
	id: string; // Unique identifier for this tool call
	name: string; // Function name
	arguments: string; // JSON string of arguments
};

/**
 * Tool result from user (response after executing a tool)
 * Maps from:
 * - OpenAI: message with role="tool"
 * - OpenAI Responses: function_call_output input item
 * - Anthropic: content block with type="tool_result"
 */
export type IRToolResult = {
	toolCallId: string; // References IRToolCall.id
	content: string; // Result (can be structured JSON string)
	isError?: boolean; // Optional error flag
};

// ============================================================================
// MESSAGES
// ============================================================================

/**
 * Unified message format that can represent messages from all protocols
 */
export type IRMessage =
	| {
			role: "system";
			content: IRContentPart[];
	  }
	| {
			role: "user";
			content: IRContentPart[];
	  }
	| {
			role: "assistant";
			content: IRContentPart[]; // Regular assistant content
			toolCalls?: IRToolCall[]; // Optional tool calls
	  }
	| {
			role: "tool";
			toolResults: IRToolResult[]; // Results from tool executions
	  };

// ============================================================================
// REQUEST
// ============================================================================

/**
 * Tool choice configuration
 * Maps from:
 * - OpenAI: tool_choice (string | {type, function})
 * - Anthropic: tool_choice (object with type)
 */
export type IRToolChoice =
	| "auto" // Let model decide
	| "none" // Never call tools
	| "required" // Must call at least one tool
	| { name: string }; // Specific tool to call

/**
 * Reasoning configuration (for o1-style and MiniMax-style reasoning)
 */
export type IRReasoning = {
	effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
	summary?: "auto" | "concise" | "detailed";
};

/**
 * Response format configuration
 */
export type IRResponseFormat =
	| { type: "text" }
	| { type: "json_object"; schema?: Record<string, any> }
	| { type: "json_schema"; schema: Record<string, any>; name?: string; strict?: boolean };

/**
 * Complete chat request in IR format
 * This can be decoded from any protocol and encoded to any surface
 */
export type IRChatRequest = {
	// Core fields
	messages: IRMessage[];
	model: string; // Internal model ID

	// Generation parameters
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	topK?: number;
	seed?: number;
	stream: boolean;

	// Tool calling
	tools?: IRTool[];
	toolChoice?: IRToolChoice;
	parallelToolCalls?: boolean;
	maxToolCalls?: number;

	// Reasoning (o1, MiniMax, etc.)
	reasoning?: IRReasoning;

	// Response format
	responseFormat?: IRResponseFormat;

	// Advanced parameters
	frequencyPenalty?: number;
	presencePenalty?: number;
	repetitionPenalty?: number;
	logitBias?: Record<string, number>;
	stop?: string | string[];
	logprobs?: boolean;
	topLogprobs?: number;
	background?: boolean;
	serviceTier?: string;
	promptCacheKey?: string;
	safetyIdentifier?: string;

	// Metadata
	userId?: string;
	metadata?: Record<string, string>;

	// Vendor-specific extensions (for features that don't map cleanly)
	vendor?: Record<string, any>;
};

// ============================================================================
// RESPONSE
// ============================================================================

/**
 * Logprobs information (token-level probabilities)
 */
export type IRLogprobs = {
	token: string;
	logprob: number;
	bytes?: number[];
	topLogprobs?: Array<{
		token: string;
		logprob: number;
		bytes?: number[];
	}>;
};

/**
 * A single completion choice
 * For reasoning models, there may be multiple choices (reasoning + answer)
 */
export type IRChoice = {
	index: number;
	message: {
		role: "assistant";
		content: string;
		toolCalls?: IRToolCall[];
		refusal?: string; // Refusal to answer (content filter)
	};
	finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "error" | null;

	// Which stop sequence triggered (if finishReason is "stop")
	// Useful for debugging and understanding model behavior
	stopSequence?: string;

	// Reasoning flag: true if this choice contains reasoning/thinking
	// Used for o1-style models and MiniMax interleaved thinking
	reasoning?: boolean;

	// Token-level logprobs
	logprobs?: IRLogprobs[];
};

/**
 * Usage statistics (token counts)
 * Normalized across all providers
 */
export type IRUsage = {
	// Core counts (always present if usage is available)
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;

	// Optional detailed counts
	cachedInputTokens?: number; // Prompt caching
	reasoningTokens?: number; // Reasoning/thinking tokens (o1, MiniMax)

	// Modality-specific counts (extended meters)
	// These are stored in _ext for pricing but may be promoted to top-level later
	_ext?: {
		inputImageTokens?: number;
		inputAudioTokens?: number;
		inputVideoTokens?: number;
		outputImageTokens?: number;
		outputAudioTokens?: number;
		outputVideoTokens?: number;
		cachedWriteTokens?: number;
	};
};

/**
 * Complete chat response in IR format
 * Can be encoded to any protocol
 */
export type IRChatResponse = {
	// Identifiers
	id: string; // Gateway request ID
	nativeId?: string; // Provider's response ID

	// Metadata
	created: number; // Unix timestamp
	model: string; // Model used
	provider: string; // Provider name

	// Content
	choices: IRChoice[];
	usage?: IRUsage;

	// Service metadata
	serviceTier?: string; // e.g., "default", "priority"
	systemFingerprint?: string; // Provider fingerprint
};

// ============================================================================
// STREAMING
// ============================================================================

/**
 * Delta for streaming responses
 * Represents incremental updates to the response
 */
export type IRStreamDelta = {
	role?: "assistant";
	content?: string; // Incremental text
	toolCalls?: Array<{
		index: number; // Index in the tool_calls array
		id?: string; // Only in first chunk
		name?: string; // Only in first chunk
		arguments?: string; // Incremental arguments JSON
	}>;
	refusal?: string;
};

/**
 * Streaming chunk (SSE event)
 * Sent incrementally during streaming
 */
export type IRStreamChunk = {
	id: string; // Gateway request ID
	created: number;
	model: string;
	provider: string;
	choices: Array<{
		index: number;
		delta: IRStreamDelta;
		finishReason?: IRChoice["finishReason"];
		reasoning?: boolean; // True if this is a reasoning chunk
		logprobs?: IRLogprobs;
	}>;

	// Usage may be included in final chunk or omitted during streaming
	usage?: IRUsage;
};

/**
 * Stream completion marker (final event)
 * Sent as the last event in a stream to indicate completion
 */
export type IRStreamComplete = {
	type: "complete";
	response: IRChatResponse;
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isToolMessage(message: IRMessage): message is Extract<IRMessage, { role: "tool" }> {
	return message.role === "tool";
}

export function isAssistantMessage(
	message: IRMessage,
): message is Extract<IRMessage, { role: "assistant" }> {
	return message.role === "assistant";
}

export function isTextContent(part: IRContentPart): part is Extract<IRContentPart, { type: "text" }> {
	return part.type === "text";
}

export function isImageContent(
	part: IRContentPart,
): part is Extract<IRContentPart, { type: "image" }> {
	return part.type === "image";
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract all text content from a message
 */
export function extractText(message: IRMessage): string {
	if (message.role === "tool") {
		return message.toolResults.map((r) => r.content).join("\n");
	}
	return message.content.filter(isTextContent).map((p) => p.text).join("");
}

/**
 * Create a simple text message
 */
export function createTextMessage(
	role: "system" | "user" | "assistant",
	text: string,
): IRMessage {
	return {
		role,
		content: [{ type: "text", text }],
	} as IRMessage;
}

/**
 * Check if a message has tool calls
 */
export function hasToolCalls(message: IRMessage): boolean {
	return isAssistantMessage(message) && (message.toolCalls?.length ?? 0) > 0;
}

/**
 * Count total tokens in usage
 */
export function countTotalTokens(usage?: IRUsage): number {
	return usage?.totalTokens ?? 0;
}

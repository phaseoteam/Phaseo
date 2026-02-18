// Purpose: Core gateway primitives.
// Why: Shared types/schemas/utilities used across modules.
// How: Exposes reusable building blocks for the gateway.

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
 *
 * Image parts can be used for both:
 * - Input images (user messages) - typically from URLs or base64
 * - Output images (assistant messages) - from models like Google Nano Banana (gemini-2.5-flash-image)
 *   that generate images alongside text in text.generate responses
 */
export type IRContentPart =
	| { type: "text"; text: string }
	| {
		type: "reasoning_text";
		text: string;
		thoughtSignature?: string; // Encrypted state for multi-turn conversations
		summary?: string; // Abbreviated thought (Gemini 2.5+)
	}
	| {
		type: "image";
		source: "url" | "data";
		data: string; // URL or base64
		mimeType?: string;
		detail?: "auto" | "low" | "high"; // OpenAI detail level
		// Optional signature for preserving reasoning context across turns (Google Nano Banana)
		thoughtSignature?: string;
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
		role: "developer";
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
	enabled?: boolean;
	maxTokens?: number;
};

/**
 * Response format configuration
 */
export type IRResponseFormat =
	| { type: "text" }
	| { type: "json_object"; schema?: Record<string, any> }
	| { type: "json_schema"; schema: Record<string, any>; name?: string; strict?: boolean };

/**
 * Image generation configuration for multimodal text.generate requests
 * Enables models to generate images alongside text in text.generate responses.
 */
export type IRImageConfig = {
	/**
	 * Aspect ratio for generated images (for example: "1:1", "16:9")
	 */
	aspectRatio?: string;
	/**
	 * Output image resolution tiers used by some models (for example: "1K", "2K", "4K")
	 */
	imageSize?: "1K" | "2K" | "4K";
	/**
	 * Custom font rendering inputs (provider-specific)
	 */
	fontInputs?: Array<{
		fontUrl: string;
		text: string;
	}>;
	/**
	 * Super-resolution reference images (provider-specific)
	 */
	superResolutionReferences?: string[];
};

/**
 * Complete chat request in IR format
 * This can be decoded from any protocol and encoded to any provider protocol
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
	// Output modalities (text, image)
	modalities?: Array<"text" | "image">;
	// Optional image configuration for multimodal text generation
	imageConfig?: IRImageConfig;

	// Advanced parameters
	frequencyPenalty?: number;
	presencePenalty?: number;
	repetitionPenalty?: number;
	logitBias?: Record<string, number>;
	stop?: string | string[];
	logprobs?: boolean;
	topLogprobs?: number;
	streamOptions?: Record<string, any>;
	store?: boolean;
	truncation?: string;
	include?: string[];
	conversation?: string | Record<string, any>;
	previousResponseId?: string;
	prompt?: {
		id: string;
		variables?: Record<string, any>;
		version?: string;
	};
	background?: boolean;
	serviceTier?: string;
	speed?: string;
	promptCacheKey?: string;
	safetyIdentifier?: string;

	// Metadata
	userId?: string;
	metadata?: Record<string, string>;

	// Vendor-specific extensions (for features that don't map cleanly)
	vendor?: Record<string, any>;

	// Debug-only fields (never logged)
	rawRequest?: any;
};

// ============================================================================
// EMBEDDINGS
// ============================================================================

export type IREmbeddingsRequest = {
	model: string;
	input: string | string[];
	encodingFormat?: string;
	dimensions?: number;
	embeddingOptions?: {
		google?: {
			outputDimensionality?: number;
			taskType?: string;
			title?: string;
		};
		mistral?: {
			outputDimension?: number;
			outputDtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
		};
	};
	userId?: string;
	metadata?: Record<string, string>;
	// Debug-only fields (never logged)
	rawRequest?: any;
};

export type IREmbedding = {
	index: number;
	embedding: number[];
};

export type IREmbeddingsUsage = {
	inputTokens?: number;
	totalTokens?: number;
	embeddingTokens?: number;
};

export type IREmbeddingsResponse = {
	object: "list";
	model: string;
	data: IREmbedding[];
	usage?: IREmbeddingsUsage;
	// Debug-only fields (never logged)
	rawResponse?: any;
};

// ============================================================================
// MODERATIONS
// ============================================================================

export type IRModerationsRequest = {
	model: string;
	input: any;
	userId?: string;
	metadata?: Record<string, string>;
	// Debug-only fields (never logged)
	rawRequest?: any;
};

export type IRModerationsResult = {
	flagged: boolean;
	categories?: Record<string, boolean>;
	categoryScores?: Record<string, number>;
	categoryAppliedInputTypes?: Record<string, string[]>;
};

export type IRModerationsResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	results: IRModerationsResult[];
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
	// Debug-only fields (never logged)
	rawResponse?: any;
};

// ============================================================================
// IMAGE GENERATION (BASELINE)
// ============================================================================

export type IRImageGenerationRequest = {
	model: string;
	prompt: string;
	image?: string | string[];
	mask?: string;
	size?: string;
	n?: number;
	quality?: string;
	responseFormat?: string;
	outputFormat?: "png" | "jpeg" | "webp";
	outputCompression?: number;
	background?: "transparent" | "opaque" | "auto";
	moderation?: "auto" | "low";
	inputFidelity?: "high" | "low";
	style?: string;
	userId?: string;
	rawRequest?: any;
};

export type IRImageGenerationResponse = {
	id?: string;
	nativeId?: string;
	created: number;
	model: string;
	provider: string;
	data: Array<{
		url?: string | null;
		b64Json?: string | null;
		revisedPrompt?: string | null;
	}>;
	usage?: IRUsage;
	rawResponse?: any;
};

// ============================================================================
// AUDIO (BASELINE)
// ============================================================================

export type IRAudioSpeechRequest = {
	model: string;
	input: string;
	voice?: string;
	format?: "mp3" | "wav" | "ogg" | "aac";
	responseFormat?: "mp3" | "wav" | "aac" | "flac" | "opus" | "pcm";
	streamFormat?: "audio" | "sse";
	speed?: number;
	instructions?: string;
	vendor?: {
		elevenlabs?: Record<string, any>;
	};
	userId?: string;
	rawRequest?: any;
};

export type IRAudioSpeechResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	provider: string;
	audio?: {
		data?: string;
		url?: string;
		mimeType?: string;
	};
	usage?: IRUsage;
	rawResponse?: any;
};

export type IRAudioTranscriptionRequest = {
	model: string;
	file: File | Blob;
	language?: string;
	prompt?: string;
	temperature?: number;
	responseFormat?: string;
	timestampGranularities?: Array<"word" | "segment">;
	include?: string[];
	rawRequest?: any;
};

export type IRAudioTranscriptionResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	provider: string;
	text: string;
	segments?: any[];
	usage?: IRUsage;
	rawResponse?: any;
};

export type IRAudioTranslationRequest = {
	model: string;
	file: File | Blob;
	language?: string;
	prompt?: string;
	temperature?: number;
	responseFormat?: string;
	rawRequest?: any;
};

export type IRAudioTranslationResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	provider: string;
	text: string;
	segments?: any[];
	usage?: IRUsage;
	rawResponse?: any;
};

// ============================================================================
// VIDEO (BASELINE)
// ============================================================================

export type IRVideoGenerationRequest = {
	model: string;
	prompt: string;
	seconds?: number | string;
	size?: string;
	quality?: string;
	inputReference?: string;
	inputReferenceMimeType?: string;
	input?: {
		image?: string | Record<string, any>;
		video?: string | Record<string, any>;
		lastFrame?: string | Record<string, any>;
		referenceImages?: Array<Record<string, any>>;
	};
	inputImage?: string | Record<string, any>;
	inputVideo?: string | Record<string, any>;
	lastFrame?: string | Record<string, any>;
	referenceImages?: Array<Record<string, any>>;
	duration?: number;
	durationSeconds?: number;
	ratio?: string;
	aspectRatio?: string;
	resolution?: string;
	negativePrompt?: string;
	sampleCount?: number;
	numberOfVideos?: number;
	seed?: number;
	personGeneration?: string;
	generateAudio?: boolean;
	enhancePrompt?: boolean;
	outputStorageUri?: string;
	rawRequest?: any;
};

export type IRVideoGenerationResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	provider: string;
	status?: "queued" | "in_progress" | "completed" | "failed";
	output?: any[];
	result?: any;
	usage?: IRUsage;
	rawResponse?: any;
};

// ============================================================================
// OCR + MUSIC (BASELINE)
// ============================================================================

export type IROcrRequest = {
	model: string;
	image: string;
	language?: string;
	rawRequest?: any;
};

export type IROcrResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	provider: string;
	text: string;
	rawResponse?: any;
};

export type IRMusicGenerateRequest = {
	model: string;
	prompt?: string;
	duration?: number;
	format?: "mp3" | "wav" | "ogg" | "aac";
	vendor?: Record<string, any>;
	rawRequest?: any;
};

export type IRMusicGenerateResponse = {
	id?: string;
	nativeId?: string;
	model: string;
	provider: string;
	status?: string;
	audioUrl?: string;
	audioBase64?: string;
	result?: any;
	usage?: IRUsage;
	rawResponse?: any;
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
 * For reasoning models, content array may contain both reasoning_text and text parts
 * For multimodal output models (e.g., Google Nano Banana), content may include image parts
 */
export type IRChoice = {
	index: number;
	message: {
		role: "assistant";
		content: IRContentPart[]; // Array of content parts (can include reasoning_text, image, etc.)
		toolCalls?: IRToolCall[];
		refusal?: string; // Refusal to answer (content filter)
	};
	finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "error" | null;

	// Which stop sequence triggered (if finishReason is "stop")
	// Useful for debugging and understanding model behavior
	stopSequence?: string;

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

	// Debug-only fields (never logged)
	rawResponse?: any;
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
	content?: string; // Incremental text (legacy - will be deprecated)
	contentParts?: IRContentPart[]; // Incremental content parts (supports reasoning_text)
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

export function isReasoningContent(
	part: IRContentPart,
): part is Extract<IRContentPart, { type: "reasoning_text" }> {
	return part.type === "reasoning_text";
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
 * Extract all text content from a message (excludes reasoning_text)
 */
export function extractText(message: IRMessage): string {
	if (message.role === "tool") {
		return message.toolResults.map((r) => r.content).join("\n");
	}
	return message.content.filter(isTextContent).map((p) => p.text).join("");
}

/**
 * Extract all reasoning content from a message
 */
export function extractReasoning(message: IRMessage): string {
	if (message.role === "tool") {
		return "";
	}
	return message.content.filter(isReasoningContent).map((p) => p.text).join("");
}

/**
 * Extract all text and reasoning content from content parts
 */
export function extractAllText(parts: IRContentPart[]): string {
	return parts
		.filter((p) => p.type === "text" || p.type === "reasoning_text")
		.map((p) => p.text)
		.join("");
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

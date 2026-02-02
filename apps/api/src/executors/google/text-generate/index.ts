// Purpose: Executor for google / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Google Gemini Text Generation Executor
// Documentation: https://ai.google.dev/gemini-api/docs/text-generation
// NOT OpenAI-compatible - uses Google's native API format

import type { IRChatRequest, IRChatResponse, IRContentPart, IRMessage, IRChoice, IRStreamChunk, IRStreamDelta } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { computeBill } from "@pipeline/pricing/engine";

/**
 * Transform IR request to Google Gemini format
 *
 * Google uses:
 * - `contents` array (not `messages`)
 * - `parts` within each content (can be text, inline_data, etc.)
 * - `systemInstruction` for system messages (not in contents)
 * - `generationConfig` for parameters
 * - Model in URL path, not request body
 */
function irToGemini(ir: IRChatRequest): any {
	const contents: any[] = [];
	let systemInstruction: any = null;

	// Process messages
	for (const msg of ir.messages) {
		if (msg.role === "system") {
			// System messages go in systemInstruction, not contents
			const parts = msg.content.map(irPartToGeminiPart);
			systemInstruction = { parts };
		} else if (msg.role === "user") {
			contents.push({
				role: "user",
				parts: msg.content.map(irPartToGeminiPart),
			});
		} else if (msg.role === "assistant") {
			contents.push({
				role: "model", // Google uses "model" not "assistant"
				parts: msg.content.map(irPartToGeminiPart),
			});
		} else if (msg.role === "tool") {
			// Tool results
			for (const toolResult of msg.toolResults) {
				contents.push({
					role: "function",
					parts: [{
						functionResponse: {
							name: toolResult.toolCallId, // TODO: Need to track function name
							response: JSON.parse(toolResult.content),
						},
					}],
				});
			}
		}
	}

	const request: any = {
		contents,
	};

	if (systemInstruction) {
		request.systemInstruction = systemInstruction;
	}

	// Build generationConfig
	const generationConfig: any = {};

	if (ir.temperature !== undefined) generationConfig.temperature = ir.temperature;
	if (ir.maxTokens !== undefined) generationConfig.maxOutputTokens = ir.maxTokens;
	if (ir.topP !== undefined) generationConfig.topP = ir.topP;
	if (ir.topK !== undefined) generationConfig.topK = ir.topK;
	if (ir.stop) {
		generationConfig.stopSequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	}

	// Thinking mode support (Google uses thinkingBudget)
	if (ir.reasoning?.enabled || (ir.reasoning?.maxTokens && ir.reasoning.maxTokens > 0)) {
		generationConfig.thinkingBudget = {
			tokens: ir.reasoning?.maxTokens || 8192, // Default thinking budget
		};
	}

	// Response format (JSON mode)
	if (ir.responseFormat) {
		if (ir.responseFormat.type === "json_object") {
			generationConfig.responseMimeType = "application/json";
		} else if (ir.responseFormat.type === "json_schema") {
			generationConfig.responseMimeType = "application/json";
			generationConfig.responseSchema = ir.responseFormat.schema;
		}
	}

	// Response modalities (text/image)
	if (Array.isArray(ir.modalities) && ir.modalities.length > 0) {
		const mapped = ir.modalities
			.map((mode) => (typeof mode === "string" ? mode.toUpperCase() : ""))
			.filter((mode) => mode === "TEXT" || mode === "IMAGE");
		if (mapped.length > 0) {
			generationConfig.responseModalities = mapped;
		}
	}

	if (Object.keys(generationConfig).length > 0) {
		request.generationConfig = generationConfig;
	}

	// Tools (function calling)
	if (ir.tools && ir.tools.length > 0) {
		request.tools = [{
			functionDeclarations: ir.tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
			})),
		}];

		// Tool choice
		if (ir.toolChoice) {
			if (ir.toolChoice === "auto") {
				request.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
			} else if (ir.toolChoice === "none") {
				request.toolConfig = { functionCallingConfig: { mode: "NONE" } };
			} else if (ir.toolChoice === "required") {
				request.toolConfig = { functionCallingConfig: { mode: "ANY" } };
			} else if (typeof ir.toolChoice === "object" && "name" in ir.toolChoice) {
				request.toolConfig = {
					functionCallingConfig: {
						mode: "ANY",
						allowedFunctionNames: [ir.toolChoice.name],
					},
				};
			}
		}
	}

	return request;
}

/**
 * Convert IR content part to Google Gemini part
 */
function irPartToGeminiPart(part: IRContentPart): any {
	if (part.type === "text" || part.type === "reasoning_text") {
		return { text: part.text };
	}

	if (part.type === "image") {
		if (part.source === "url") {
			// Google doesn't support URLs directly - need to fetch and convert to base64
			// For now, return as inline_data with URL (caller should pre-fetch)
			return {
				inline_data: {
					mime_type: part.mimeType || "image/jpeg",
					data: part.data, // Assume already base64
				},
			};
		} else {
			// Base64 data
			return {
				inline_data: {
					mime_type: part.mimeType || "image/jpeg",
					data: part.data,
				},
			};
		}
	}

	if (part.type === "audio") {
		return {
			inline_data: {
				mime_type: `audio/${part.format || "wav"}`,
				data: part.data,
			},
		};
	}

	if (part.type === "video") {
		return {
			inline_data: {
				mime_type: "video/mp4",
				data: part.url, // TODO: Should be base64
			},
		};
	}

	// Fallback
	return { text: String(part) };
}

/**
 * Transform Google Gemini response to IR format
 */
function geminiToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const choices: IRChoice[] = [];

	// Process candidates
	for (const candidate of json.candidates || []) {
		const contentParts: IRContentPart[] = [];
		const toolCalls: any[] = [];

		// Extract parts from candidate.content.parts
		if (candidate.content?.parts) {
			for (const part of candidate.content.parts) {
				if (part.text) {
					// Regular text part
					contentParts.push({
						type: "text",
						text: part.text,
					});
				} else if (part.inline_data) {
					// Image part (Nano Banana models)
					contentParts.push({
						type: "image",
						source: "data",
						data: part.inline_data.data,
						mimeType: part.inline_data.mime_type,
						thoughtSignature: part.inline_data.thought_signature,
					});
				} else if (part.functionCall) {
					// Tool call
					toolCalls.push({
						id: part.functionCall.name, // Google doesn't provide IDs
						name: part.functionCall.name,
						arguments: JSON.stringify(part.functionCall.args || {}),
					});
				}
			}
		}

		// Map finish reason
		const finishReason = mapGeminiFinishReason(candidate.finishReason);

		choices.push({
			index: candidate.index || 0,
			message: {
				role: "assistant",
				content: contentParts,
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			},
			finishReason,
		});
	}

	// Extract usage metadata
	const usage = json.usageMetadata ? {
		inputTokens: json.usageMetadata.promptTokenCount || 0,
		outputTokens: json.usageMetadata.candidatesTokenCount || 0,
		totalTokens: json.usageMetadata.totalTokenCount || 0,
		cachedInputTokens: json.usageMetadata.cachedContentTokenCount,
	} : undefined;

	return {
		id: requestId,
		nativeId: json.id,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage,
	};
}

/**
 * Map Google finish reason to IR format
 */
function mapGeminiFinishReason(reason: string | undefined): IRChoice["finishReason"] {
	switch (reason) {
		case "STOP":
			return "stop";
		case "MAX_TOKENS":
			return "length";
		case "SAFETY":
		case "RECITATION":
		case "PROHIBITED_CONTENT":
		case "SPII":
		case "BLOCKLIST":
			return "content_filter";
		case "MALFORMED_FUNCTION_CALL":
			return "error";
		default:
			return "stop";
	}
}

/**
 * Preprocess IR request
 */
export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

/**
 * Execute Google Gemini request
 */
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const { ir, providerId, providerModelSlug, requestId, byokMeta, pricingCard, meta } = args;

	// Resolve API key
	const apiKey = byokMeta?.[0]?.value ||
		process.env.GOOGLE_API_KEY ||
		process.env.GOOGLE_AI_STUDIO_API_KEY;

	if (!apiKey) {
		return {
			kind: "completed",
			ir: undefined,
			upstream: new Response(JSON.stringify({ error: "Missing Google API key" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Determine model (must be in URL, not body)
	const model = providerModelSlug || ir.model || "gemini-2.0-flash-exp";

	// Transform IR to Google format
	const geminiRequest = irToGemini(ir);

	// Determine endpoint based on streaming
	// Note: We MUST append ?alt=sse for streaming to get Server-Sent Events
	const endpoint = ir.stream
		? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
		: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

	const upstreamStartMs = Date.now();

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": apiKey,
			},
			body: JSON.stringify(geminiRequest),
		});

		if (!response.ok) {
			return {
				kind: "completed",
				ir: undefined,
				upstream: response,
				bill: { cost_cents: 0, currency: "USD" },
			};
		}

		// Handle streaming
		if (ir.stream && response.body) {
			return {
				kind: "stream",
				stream: response.body,
				bill: { cost_cents: 0, currency: "USD" },
				upstream: response,
				usageFinalizer: async () => null,
			};
		}

		// Non-streaming response
		const data = await response.json();
		const irResponse = geminiToIR(data, requestId, model, providerId);

		// Calculate pricing
		const bill: any = {
			cost_cents: 0,
			currency: "USD",
		};

		if (irResponse.usage && pricingCard) {
			const priced = computeBill(irResponse.usage, pricingCard);
			bill.cost_cents = priced.pricing.total_cents;
			bill.currency = priced.pricing.currency;
			bill.usage = priced;
		}

		const totalMs = Date.now() - upstreamStartMs;

		return {
			kind: "completed",
			ir: irResponse,
			upstream: response,
			bill,
			timing: {
				latencyMs: undefined,
				generationMs: totalMs,
			},
		};
	} catch (error: any) {
		return {
			kind: "completed",
			ir: undefined,
			upstream: new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}
}

/**
 * Postprocess IR response
 */
export function postprocess(ir: any): any {
	return ir;
}

/**
 * Transform stream
 * Google SSE format:
 * data: {"candidates": [...], "usageMetadata": {...}}
 *
 * We map this to IRStreamChunk, then to GatewayCompletionsResponse chunks.
 */
export function transformStream(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	let created = Math.floor(Date.now() / 1000);
	const model = args.providerModelSlug || args.ir.model || "gemini-2.0-flash-exp";
	const provider = args.providerId || "google";

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					buf += decoder.decode(value, { stream: true });
					const lines = buf.split(/\r?\n\r?\n/); // Split by double newline (SSE blocks)
					buf = lines.pop() ?? "";

					for (const block of lines) {
						// Extract data line
						const dataMatch = block.match(/^data: (.*)/m);
						if (!dataMatch) continue;

						const dataStr = dataMatch[1].trim();
						if (!dataStr || dataStr === "[DONE]") continue;

						let payload: any;
						try {
							payload = JSON.parse(dataStr);
						} catch {
							continue;
						}

						// Convert to IR Chunk
						const irChunk: IRStreamChunk = {
							id: args.requestId,
							created,
							model,
							provider,
							choices: [],
						};

						if (payload.candidates) {
							for (const cand of payload.candidates) {
								const index = cand.index || 0;
								const parts = cand.content?.parts || [];
								
								// Accumulate content from parts
								let content = "";
								let reasoning = "";
								
								for (const part of parts) {
									if (part.text) {
										if (part.thought) {
											reasoning += part.text;
										} else {
											content += part.text;
										}
									}
								}

								// Construct delta
								const delta: IRStreamDelta = {};
								if (content) delta.content = content;
								if (reasoning) {
									delta.contentParts = [{ type: "reasoning_text", text: reasoning }];
								}

								const finishReason = cand.finishReason ? mapGeminiFinishReason(cand.finishReason) : undefined;

								if (Object.keys(delta).length > 0 || finishReason) {
									irChunk.choices.push({
										index,
										delta: {
											role: "assistant",
											...delta,
										},
										finishReason,
									});
								}
							}
						}

						if (payload.usageMetadata) {
							irChunk.usage = {
								inputTokens: payload.usageMetadata.promptTokenCount || 0,
								outputTokens: payload.usageMetadata.candidatesTokenCount || 0,
								totalTokens: payload.usageMetadata.totalTokenCount || 0,
								reasoningTokens: payload.usageMetadata.thoughtTokenCount,
							};
						}

						// Encode IR Chunk to OpenAI Chunk (bytes)
						const openAIChunk = encodeIRChunkToOpenAI(irChunk);
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
					}
				}
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			} catch (err) {
				console.error("Google stream transform error:", err);
				controller.error(err);
			} finally {
				controller.close();
			}
		},
	});
}

/**
 * Helper to encode IR Chunk to OpenAI Protocol Chunk
 */
function encodeIRChunkToOpenAI(chunk: IRStreamChunk): any {
	const choices = chunk.choices.map(c => {
		const delta: any = {};
		if (c.delta.role) delta.role = c.delta.role;
		if (c.delta.content) delta.content = c.delta.content;
		
		if (c.delta.contentParts) {
			for (const part of c.delta.contentParts) {
				if (part.type === "reasoning_text") {
					delta.reasoning_content = part.text;
				} else if (part.type === "text") {
					delta.content = (delta.content || "") + part.text;
				}
			}
		}

		return {
			index: c.index,
			delta,
			finish_reason: c.finishReason || null,
		};
	});

	const response: any = {
		id: chunk.id,
		object: "chat.completion.chunk",
		created: chunk.created,
		model: chunk.model,
		provider: chunk.provider,
		choices,
	};

	if (chunk.usage) {
		response.usage = {
			prompt_tokens: chunk.usage.inputTokens,
			completion_tokens: chunk.usage.outputTokens,
			total_tokens: chunk.usage.totalTokens,
			output_tokens_details: chunk.usage.reasoningTokens ? {
				reasoning_tokens: chunk.usage.reasoningTokens,
			} : undefined,
		};
	}

	return response;
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});


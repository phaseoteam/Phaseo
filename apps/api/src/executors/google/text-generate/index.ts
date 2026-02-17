// Purpose: Executor for google / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Google Gemini Text Generation Executor
// Documentation: https://ai.google.dev/gemini-api/docs/text-generation
// NOT OpenAI-compatible - uses Google's native API format

import type { IRChatRequest, IRChatResponse, IRContentPart, IRChoice, IRStreamChunk, IRStreamDelta } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { computeBill } from "@pipeline/pricing/engine";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { withNormalizedReasoning } from "./normalize-reasoning";
import { irPartsToGeminiParts } from "../shared/media";
import { resolveGoogleModelCandidates } from "../shared/model";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";

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
async function irToGemini(ir: IRChatRequest, modelOverride?: string | null): Promise<any> {
	const contents: any[] = [];
	let systemInstruction: any = null;
	const toolNamesById = new Map<string, string>();

	for (const msg of ir.messages) {
		if (msg.role !== "assistant" || !Array.isArray(msg.toolCalls)) continue;
		for (const toolCall of msg.toolCalls) {
			if (!toolCall?.id || !toolCall?.name) continue;
			toolNamesById.set(toolCall.id, toolCall.name);
		}
	}

	// Process messages
	for (const msg of ir.messages) {
		if (msg.role === "system") {
			// System messages go in systemInstruction, not contents
			const parts = await irPartsToGeminiParts(msg.content);
			systemInstruction = { parts };
		} else if (msg.role === "user") {
			contents.push({
				role: "user",
				parts: await irPartsToGeminiParts(msg.content),
			});
		} else if (msg.role === "assistant") {
			contents.push({
				role: "model", // Google uses "model" not "assistant"
				parts: await irPartsToGeminiParts(msg.content),
			});
		} else if (msg.role === "tool") {
			// Tool results
			for (const toolResult of msg.toolResults) {
				let responsePayload: any = toolResult.content;
				if (typeof toolResult.content === "string") {
					try {
						responsePayload = JSON.parse(toolResult.content);
					} catch {
						responsePayload = { content: toolResult.content };
					}
				}
				contents.push({
					role: "user",
					parts: [{
						functionResponse: {
							name: toolNamesById.get(toolResult.toolCallId) ?? toolResult.toolCallId,
							response: responsePayload,
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

	// Thinking mode support (Gemini 2.x and 3.x)
	if (ir.reasoning?.enabled || ir.reasoning?.effort || (ir.reasoning?.maxTokens !== undefined)) {
		const thinkingConfig: any = {
			includeThoughts: true,
		};
		const modelName = modelOverride ?? ir.model;
		const isGemini3 = typeof modelName === "string" && modelName.startsWith("gemini-3");
		if (ir.reasoning?.effort && isGemini3) {
			const levelMap: Record<string, string> = {
				minimal: "MINIMAL",
				low: "LOW",
				medium: "MEDIUM",
				high: "HIGH",
				xhigh: "HIGH",
			};
			thinkingConfig.thinkingLevel = levelMap[ir.reasoning.effort] || "HIGH";
		} else if (ir.reasoning?.maxTokens !== undefined) {
			thinkingConfig.thinkingBudget = ir.reasoning.maxTokens;
		} else if (ir.reasoning?.enabled) {
			if (isGemini3) {
				thinkingConfig.thinkingLevel = "HIGH";
			} else {
				thinkingConfig.thinkingBudget = -1;
			}
		}
		generationConfig.thinkingConfig = thinkingConfig;
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

	// Image generation configuration (multimodal text.generate)
	if (ir.imageConfig) {
		const imageConfig: any = {};

		if (ir.imageConfig.aspectRatio) {
			imageConfig.aspectRatio = ir.imageConfig.aspectRatio;
		}

		if (ir.imageConfig.imageSize) {
			imageConfig.imageSize = ir.imageConfig.imageSize;
		}

		if (Object.keys(imageConfig).length > 0) {
			generationConfig.imageConfig = imageConfig;
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
				const inlineData = normalizeGeminiInlineData(part);
				if (part.text) {
					// Regular text part
					contentParts.push({
						type: "text",
						text: part.text,
					});
				} else if (inlineData?.data) {
					// Image part (Nano Banana models)
					contentParts.push({
						type: "image",
						source: "data",
						data: inlineData.data,
						mimeType: inlineData.mime_type,
						thoughtSignature: inlineData.thought_signature,
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

	// Extract usage metadata (including multimodal token details)
	const usage = googleUsageMetadataToIRUsage(json.usageMetadata);

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
	const { ir, providerId, providerModelSlug, requestId, pricingCard, meta } = args;
	const bindings = getBindings() as any;

	const keyInfo = resolveProviderKey(args, () => {
		return bindings.GOOGLE_API_KEY || bindings.GOOGLE_AI_STUDIO_API_KEY;
	});

	// Determine model candidates (must be in URL, not body)
	const requestedModel = providerModelSlug || ir.model || "gemini-2.0-flash-exp";
	const modelCandidates = resolveGoogleModelCandidates(requestedModel);
	let model = modelCandidates[0] || "gemini-2.0-flash-exp";
	const baseRoot = String(bindings.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
	const baseUrl = /\/v1(beta)?$/i.test(baseRoot) ? baseRoot : `${baseRoot}/v1beta`;

	const upstreamStartMs = meta.upstreamStartMs ?? Date.now();
	const makeEndpoint = (candidateModel: string) =>
		ir.stream
			? `${baseUrl}/models/${encodeURIComponent(candidateModel)}:streamGenerateContent?alt=sse`
			: `${baseUrl}/models/${encodeURIComponent(candidateModel)}:generateContent`;

	try {
		const doRequest = async (candidateModel: string) => {
			const requestBody = await irToGemini(ir, candidateModel);
			const endpoint = makeEndpoint(candidateModel);
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": keyInfo.key,
				},
				body: JSON.stringify(requestBody),
			});
			return { candidateModel, requestBody, response };
		};

		const attempted = await doRequest(model);

		model = attempted.candidateModel;
		const geminiRequest = attempted.requestBody;
		const response = attempted.response;
		const mappedRequest = (
			meta.echoUpstreamRequest ||
			meta.returnUpstreamRequest ||
			meta.debug?.return_upstream_request ||
			meta.debug?.trace
		)
			? JSON.stringify(geminiRequest)
			: undefined;

		if (!response.ok) {
			return {
				kind: "completed",
				ir: undefined,
				upstream: response,
				bill: { cost_cents: 0, currency: "USD" },
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
			};
		}

		// Handle streaming
		if (ir.stream && response.body) {
			return {
				kind: "stream",
				stream: response.body,
				bill: { cost_cents: 0, currency: "USD" },
				upstream: response,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
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

		const usageMeters = normalizeTextUsageForPricing(irResponse.usage ?? data?.usageMetadata);
		if (usageMeters && pricingCard) {
			const priced = computeBill(usageMeters, pricingCard);
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
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			timing: {
				latencyMs: undefined,
				generationMs: totalMs,
			},
		};
	} catch (error: any) {
		const mappedRequest = (
			meta.echoUpstreamRequest ||
			meta.returnUpstreamRequest ||
			meta.debug?.return_upstream_request ||
			meta.debug?.trace
		) ? JSON.stringify({ model }) : undefined;
		return {
			kind: "completed",
			ir: undefined,
			upstream: new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}
}

function normalizeGeminiInlineData(part: any): {
	data?: string;
	mime_type?: string;
	thought_signature?: string;
} | null {
	if (part?.inline_data && typeof part.inline_data === "object") {
		return part.inline_data;
	}
	if (part?.inlineData && typeof part.inlineData === "object") {
		return {
			data: part.inlineData.data,
			mime_type: part.inlineData.mimeType ?? part.inlineData.mime_type,
			thought_signature:
				part.inlineData.thoughtSignature ??
				part.inlineData.thought_signature,
		};
	}
	return null;
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

	const openAIStream = new ReadableStream<Uint8Array>({
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
								const imageParts: any[] = [];
								
								for (const part of parts) {
									const inlineData = normalizeGeminiInlineData(part);
									if (part.text) {
										if (part.thought) {
											reasoning += part.text;
										} else {
											content += part.text;
										}
									} else if (inlineData?.data) {
										imageParts.push({
											type: "image",
											source: "data",
											data: inlineData.data,
											mimeType: inlineData.mime_type,
											thoughtSignature: inlineData.thought_signature,
										});
									}
								}

								// Construct delta
								const delta: IRStreamDelta = {};
								if (content) delta.content = content;
								const deltaContentParts: any[] = [];
								if (reasoning) {
									deltaContentParts.push({ type: "reasoning_text", text: reasoning });
								}
								if (imageParts.length > 0) {
									deltaContentParts.push(...imageParts);
								}
								if (deltaContentParts.length > 0) {
									delta.contentParts = deltaContentParts as any;
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

						const chunkUsage = googleUsageMetadataToIRUsage(payload.usageMetadata);
						if (chunkUsage) {
							irChunk.usage = chunkUsage;
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

	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	if (protocol === "openai.chat.completions") {
		return openAIStream;
	}

	return resolveStreamForProtocol(
		new Response(openAIStream),
		args,
		"chat",
	);
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
				} else if (part.type === "image") {
					const imageUrl = part.source === "data"
						? `data:${part.mimeType || "image/png"};base64,${part.data}`
						: part.data;
					if (!Array.isArray(delta.images)) {
						delta.images = [];
					}
					delta.images.push({
						type: "image_url",
						image_url: { url: imageUrl },
						...(part.mimeType ? { mime_type: part.mimeType } : {}),
					});
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
		const inputDetails: Record<string, number> = {};
		const outputDetails: Record<string, number> = {};
		if (typeof chunk.usage.cachedInputTokens === "number") {
			inputDetails.cached_tokens = chunk.usage.cachedInputTokens;
		}
		if (typeof chunk.usage._ext?.inputImageTokens === "number") {
			inputDetails.input_images = chunk.usage._ext.inputImageTokens;
		}
		if (typeof chunk.usage._ext?.inputAudioTokens === "number") {
			inputDetails.input_audio = chunk.usage._ext.inputAudioTokens;
		}
		if (typeof chunk.usage._ext?.inputVideoTokens === "number") {
			inputDetails.input_videos = chunk.usage._ext.inputVideoTokens;
		}
		if (typeof chunk.usage.reasoningTokens === "number") {
			outputDetails.reasoning_tokens = chunk.usage.reasoningTokens;
		}
		if (typeof chunk.usage._ext?.cachedWriteTokens === "number") {
			outputDetails.cached_tokens = chunk.usage._ext.cachedWriteTokens;
		}
		if (typeof chunk.usage._ext?.outputImageTokens === "number") {
			outputDetails.output_images = chunk.usage._ext.outputImageTokens;
		}
		if (typeof chunk.usage._ext?.outputAudioTokens === "number") {
			outputDetails.output_audio = chunk.usage._ext.outputAudioTokens;
		}
		if (typeof chunk.usage._ext?.outputVideoTokens === "number") {
			outputDetails.output_videos = chunk.usage._ext.outputVideoTokens;
		}

		response.usage = {
			prompt_tokens: chunk.usage.inputTokens,
			completion_tokens: chunk.usage.outputTokens,
			total_tokens: chunk.usage.totalTokens,
			...(Object.keys(inputDetails).length > 0 ? { input_tokens_details: inputDetails } : {}),
			...(Object.keys(outputDetails).length > 0 ? { output_tokens_details: outputDetails } : {}),
		};
	}

	return response;
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess: (ir, args) =>
		preprocess(
			withNormalizedReasoning(
				ir,
				args.capabilityParams,
				args.providerModelSlug ?? ir.model,
			),
			args,
		),
	execute,
	postprocess,
	transformStream,
});


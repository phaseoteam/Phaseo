// Purpose: Executor for google-ai-studio / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Google AI Studio Text Generation Executor
// Documentation: https://ai.google.dev/gemini-api/docs/text-generation
// Uses Google's native Gemini API format (NOT OpenAI-compatible)

import type { IRChatRequest, IRChatResponse, IRContentPart, IRChoice, IRStreamChunk, IRStreamDelta } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { withNormalizedReasoning } from "./normalize-reasoning";
import { irPartsToGeminiParts } from "../../google/shared/media";
import { resolveGoogleModelCandidates } from "../../google/shared/model";
import { applyGoogleOutputTokenFallback, applyOpenAIUsageFallback } from "../../google/shared/usage-fallback";
import {
	modelSupportsGoogleThinkingLevels,
	resolveGoogleThinkingLevelForEffort,
} from "../../google/shared/thinking";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";

const DEFAULT_LYRIA_RETRY_ATTEMPTS = 3;
const DEFAULT_LYRIA_RETRY_DELAY_MS = 300;

function parsePositiveInt(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) return fallback;
	return Math.floor(parsed);
}

function isLyriaModelName(value: string): boolean {
	return String(value ?? "").toLowerCase().includes("lyria-3");
}

function isGeminiImageModelName(value: string): boolean {
	const normalized = String(value ?? "").toLowerCase();
	return (
		normalized.includes("gemini-2-5-flash-image") ||
		normalized.includes("gemini-2.5-flash-image") ||
		normalized.includes("gemini-3-pro-image-preview") ||
		normalized.includes("image-preview") ||
		normalized.includes("flash-image")
	);
}

function isRetryableGoogleStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
	if (!Number.isFinite(ms) || ms <= 0) return;
	await new Promise((resolve) => setTimeout(resolve, ms));
}

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
export async function irToGemini(ir: IRChatRequest, modelOverride?: string | null): Promise<any> {
	const contents: any[] = [];
	const systemInstructionParts: any[] = [];
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
		if (msg.role === "system" || msg.role === "developer") {
			// System/developer messages go in systemInstruction, not contents.
			const parts = await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true });
			systemInstructionParts.push(...parts);
		} else if (msg.role === "user") {
			contents.push({
				role: "user",
				parts: await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true }),
			});
		} else if (msg.role === "assistant") {
			contents.push({
				role: "model", // Google uses "model" not "assistant"
				parts: await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true }),
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

	if (ir.googleCachedContent !== undefined) {
		request.cachedContent = ir.googleCachedContent;
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
	if (
		ir.reasoning?.enabled ||
		ir.reasoning?.effort ||
		(ir.reasoning?.maxTokens !== undefined) ||
		(ir.reasoning?.includeThoughts !== undefined)
	) {
		const thinkingConfig: any = {
			includeThoughts: ir.reasoning?.includeThoughts ?? true
		};

		const modelName = modelOverride ?? ir.model;
		const supportsThinkingLevel = modelSupportsGoogleThinkingLevels(modelName ?? "");

		// Gemini 3+ Thinking Level
		if (ir.reasoning?.effort && supportsThinkingLevel) {
			const level = resolveGoogleThinkingLevelForEffort(modelName ?? "", ir.reasoning.effort);
			if (level) thinkingConfig.thinkingLevel = level;
		}
		// Gemini 2.x Thinking Budget (or fallback for Gemini 3 if effort not set)
		else if (ir.reasoning?.maxTokens !== undefined) {
			// -1 is dynamic budget for Gemini 2.5
			thinkingConfig.thinkingBudget = ir.reasoning.maxTokens;
		} else if (ir.reasoning?.enabled) {
			// default to dynamic/high
			if (supportsThinkingLevel) {
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

			// Reinforce schema adherence for models that treat responseSchema as soft guidance.
			const schemaText = (() => {
				try {
					return JSON.stringify(ir.responseFormat?.schema ?? {});
				} catch {
					return "";
				}
			})();
			if (schemaText) {
				const schemaInstruction =
					`Return only valid JSON that matches this schema exactly: ${schemaText}. ` +
					"Do not include markdown or any extra text.";
				systemInstructionParts.push({ text: schemaInstruction });
			}
		}
	}

	// Response modalities (text/image/audio)
	const requestedModalities = Array.isArray(ir.modalities) && ir.modalities.length > 0
		? ir.modalities
		: isGeminiImageModelName(modelOverride ?? ir.model)
			? (["text", "image"] as const)
			: [];
	if (requestedModalities.length > 0) {
		const mapped = requestedModalities
			.map((mode) => (typeof mode === "string" ? mode.toUpperCase() : ""))
			.filter((mode) => mode === "TEXT" || mode === "IMAGE" || mode === "AUDIO");
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

		if (typeof ir.imageConfig.includeRaiReason === "boolean") {
			imageConfig.includeRaiReason = ir.imageConfig.includeRaiReason;
		}

		if (
			Array.isArray(ir.imageConfig.referenceImages) &&
			ir.imageConfig.referenceImages.length > 0
		) {
			imageConfig.referenceImages = ir.imageConfig.referenceImages;
		}

		if (Object.keys(imageConfig).length > 0) {
			generationConfig.imageConfig = imageConfig;
		}
	}

	if (Object.keys(generationConfig).length > 0) {
		request.generationConfig = generationConfig;
	}

	if (systemInstructionParts.length > 0) {
		request.systemInstruction = { parts: systemInstructionParts };
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
					// Check if it's a reasoning part
					if (part.thought) {
						contentParts.push({
							type: "reasoning_text",
							text: part.text,
							thoughtSignature: part.thought_signature,
							summary: part.thought_summary,
						} as any);
					} else {
						// Regular text part
						contentParts.push({
							type: "text",
							text: part.text,
						});
					}
				} else if (inlineData?.data) {
					const mediaPart = inlineDataToIRContentPart(inlineData);
					if (mediaPart) {
						contentParts.push(mediaPart);
					}
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

		// Map finish reason (tool calls should surface as tool_calls, not stop)
		let finishReason = mapGeminiFinishReason(candidate.finishReason);
		if (finishReason === "stop" && toolCalls.length > 0) {
			finishReason = "tool_calls";
		}

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
		nativeId: json.id ?? json.responseId,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage,
	};
}

function mergeGeminiChunkArray(chunks: any[]): any {
	const byIndex = new Map<number, any>();
	let usageMetadata: any = undefined;
	let responseId: string | undefined;
	let modelVersion: string | undefined;

	for (const chunk of chunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if (chunk.usageMetadata !== undefined) {
			usageMetadata = chunk.usageMetadata;
		}
		if (typeof chunk.responseId === "string" && chunk.responseId.length > 0) {
			responseId = chunk.responseId;
		}
		if (typeof chunk.modelVersion === "string" && chunk.modelVersion.length > 0) {
			modelVersion = chunk.modelVersion;
		}

		const candidates = Array.isArray(chunk.candidates) ? chunk.candidates : [];
		for (const candidate of candidates) {
			if (!candidate || typeof candidate !== "object") continue;
			const index = Number.isFinite(candidate.index) ? Number(candidate.index) : 0;
			let merged = byIndex.get(index);
			if (!merged) {
				merged = {
					index,
					content: {
						role: candidate.content?.role ?? "model",
						parts: [],
					},
				};
				byIndex.set(index, merged);
			}

			const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
			if (parts.length > 0) {
				merged.content.parts.push(...parts);
			}

			if (candidate.finishReason !== undefined) {
				merged.finishReason = candidate.finishReason;
			}
		}
	}

	return {
		candidates: [...byIndex.values()].sort((a, b) => a.index - b.index),
		usageMetadata,
		responseId,
		modelVersion,
	};
}

function normalizeGeminiResponsePayload(payload: any): any {
	if (Array.isArray(payload)) {
		return mergeGeminiChunkArray(payload);
	}
	return payload;
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
 * Execute Google AI Studio request
 */
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const { ir, providerId, providerModelSlug, requestId, pricingCard, meta } = args;
	const bindings = getBindings() as any;

	// Resolve API key: prefer decrypted BYOK for this provider, else use gateway keys.
	const keyInfo = resolveProviderKey(args, () => {
		return bindings.GOOGLE_AI_STUDIO_API_KEY;
	});

	// Determine model candidates (must be in URL, not body)
	const requestedModel = providerModelSlug || ir.model || "gemini-2.0-flash-exp";
	const forceSyntheticImageStream = Boolean(ir.stream) && isGeminiImageModelName(requestedModel);
	const modelCandidates = resolveGoogleModelCandidates(requestedModel);
	let model = modelCandidates[0] || "gemini-2.0-flash-exp";

	// Google AI Studio base URL (allow env override for proxy/self-host routing)
	const baseRoot = String(
		bindings.GOOGLE_AI_STUDIO_BASE_URL ||
		bindings.GOOGLE_BASE_URL ||
		"https://generativelanguage.googleapis.com",
	).replace(/\/+$/, "");
	const baseUrl = /\/v1(beta)?$/i.test(baseRoot) ? baseRoot : `${baseRoot}/v1beta`;

	const upstreamStartMs = meta.upstreamStartMs ?? Date.now();

	const makeEndpoint = (candidateModel: string, stream: boolean) =>
		stream
			? `${baseUrl}/models/${encodeURIComponent(candidateModel)}:streamGenerateContent?alt=sse`
			: `${baseUrl}/models/${encodeURIComponent(candidateModel)}:generateContent`;

	const lyriaRetryAttempts = parsePositiveInt(
		bindings.GOOGLE_AI_STUDIO_LYRIA_RETRY_ATTEMPTS,
		DEFAULT_LYRIA_RETRY_ATTEMPTS,
	);
	const lyriaRetryDelayMs = parsePositiveInt(
		bindings.GOOGLE_AI_STUDIO_LYRIA_RETRY_DELAY_MS,
		DEFAULT_LYRIA_RETRY_DELAY_MS,
	);
	const shouldSleepBetweenRetries = String(bindings.NODE_ENV ?? "").toLowerCase() !== "test";

	try {
		const doRequest = async (candidateModel: string) => {
			const requestBody = await irToGemini(ir, candidateModel);
			const endpoint = makeEndpoint(
				candidateModel,
				Boolean(ir.stream) && !forceSyntheticImageStream,
			);
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": keyInfo.key,
					...upstreamTestHeaders(meta),
				},
				body: JSON.stringify(requestBody),
			});
			return { candidateModel, requestBody, response };
		};

		let attempted: Awaited<ReturnType<typeof doRequest>> | null = null;
		for (const candidateModel of modelCandidates.length ? modelCandidates : [model]) {
			const maxAttemptsForCandidate = isLyriaModelName(candidateModel) ? lyriaRetryAttempts : 1;
			for (let attemptIndex = 0; attemptIndex < maxAttemptsForCandidate; attemptIndex++) {
				const current = await doRequest(candidateModel);
				attempted = current;
				if (current.response.ok) break;
				const shouldRetrySameCandidate =
					isRetryableGoogleStatus(current.response.status) &&
					attemptIndex + 1 < maxAttemptsForCandidate;
				if (shouldRetrySameCandidate) {
					if (shouldSleepBetweenRetries) {
						await sleep(lyriaRetryDelayMs * (attemptIndex + 1));
					}
					continue;
				}
				break;
			}
			if (attempted?.response.ok) break;
		}

		if (!attempted) {
			throw new Error("google_ai_studio_no_attempt");
		}

		model = attempted.candidateModel;
		const geminiRequest = attempted.requestBody;
		const response = attempted.response;
		const mappedRequest = (
			meta.echoUpstreamRequest ||
			meta.returnUpstreamRequest ||
			meta.debug?.return_upstream_request ||
			meta.debug?.trace
		) ? JSON.stringify(geminiRequest) : undefined;

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

		if (forceSyntheticImageStream) {
			const rawData = await response.json();
			const data = normalizeGeminiResponsePayload(rawData);
			const irResponse = geminiToIR(data, requestId, model, providerId);
			applyGoogleOutputTokenFallback(irResponse);

			const bill: any = {
				cost_cents: 0,
				currency: "USD",
			};
			const usageMeters = normalizeTextUsageForPricing(irResponse.usage ?? data?.usageMetadata);
			if (usageMeters) {
				bill.usage = usageMeters;
			}

			const totalMs = Date.now() - upstreamStartMs;
			const finalPayload = encodeOpenAIChatResponse(irResponse, requestId);
			const encoder = new TextEncoder();
			const chatStream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalPayload)}\n\n`));
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					controller.close();
				},
			});
			const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
			const stream =
				protocol === "openai.chat.completions"
					? chatStream
					: resolveStreamForProtocol(
						new Response(chatStream),
						{
							...args,
							providerModelSlug: model,
							ir: {
								...args.ir,
								model,
								stream: true,
							},
						} as ExecutorExecuteArgs,
						"chat",
					);

			return {
				kind: "stream",
				stream,
				upstream: response,
				bill,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				usageFinalizer: async () => bill.usage ?? null,
				timing: {
					latencyMs: totalMs,
					generationMs: 0,
				},
			};
		}

		const contentType = String(response.headers.get("content-type") || "").toLowerCase();
		const isJsonResponse = contentType.includes("application/json") && !contentType.includes("text/event-stream");

		if (response.body && !isJsonResponse) {
			if (ir.stream) {
				const streamingArgs = {
					...args,
					providerModelSlug: model,
				} as ExecutorExecuteArgs;
				const transformedStream = transformStream(response.body, streamingArgs);
				return {
					kind: "stream",
					stream: transformedStream,
					bill: { cost_cents: 0, currency: "USD" },
					upstream: response,
					keySource: keyInfo.source,
					byokKeyId: keyInfo.byokId,
					mappedRequest,
					usageFinalizer: async () => null,
				};
			}

			const bufferingArgs = {
				...args,
				ir: {
					...args.ir,
					model,
				},
				providerModelSlug: model,
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			} as ExecutorExecuteArgs;
			const transformedStream = transformStream(response.body, bufferingArgs);
			const transformedResponse = new Response(transformedStream, {
				status: response.status,
				headers: response.headers,
			});
			const { ir: irResponse, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
				transformedResponse,
				bufferingArgs,
				"chat",
				upstreamStartMs,
			);
			const fallback = applyGoogleOutputTokenFallback(irResponse);
			if (fallback.applied) {
				applyOpenAIUsageFallback(
					(rawResponse as any)?.usage,
					irResponse.usage?.inputTokens ?? 0,
					irResponse.usage?.outputTokens ?? 0,
					irResponse.usage?.totalTokens ?? 0,
				);
			}

			const bill: any = {
				cost_cents: 0,
				currency: "USD",
			};

			const usageMeters = normalizeTextUsageForPricing(irResponse?.usage ?? usage);
			if (usageMeters) {
				bill.usage = usageMeters;
			}

			return {
				kind: "completed",
				ir: irResponse,
				upstream: response,
				bill,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				rawResponse,
				timing: {
					latencyMs: firstByteMs ?? totalMs,
					generationMs: firstByteMs === null ? 0 : Math.max(0, totalMs - firstByteMs),
				},
			};
		}

		const rawData = await response.json();
		const data = normalizeGeminiResponsePayload(rawData);
		const irResponse = geminiToIR(data, requestId, model, providerId);
		applyGoogleOutputTokenFallback(irResponse);

		// Calculate pricing
		const bill: any = {
			cost_cents: 0,
			currency: "USD",
		};

		const usageMeters = normalizeTextUsageForPricing(irResponse.usage ?? data?.usageMetadata);
		if (usageMeters) {
			bill.usage = usageMeters;
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
			rawResponse: rawData,
			timing: {
				latencyMs: totalMs,
				generationMs: 0,
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

function resolveAudioFormatFromMimeType(mimeType?: string): Extract<IRContentPart, { type: "audio" }>["format"] {
	const normalized = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
	switch (normalized) {
		case "audio/wav":
		case "audio/x-wav":
			return "wav";
		case "audio/mpeg":
		case "audio/mp3":
			return "mp3";
		case "audio/flac":
			return "flac";
		case "audio/mp4":
		case "audio/m4a":
		case "audio/x-m4a":
			return "m4a";
		case "audio/ogg":
			return "ogg";
		case "audio/pcm":
		case "audio/l16":
			return "pcm16";
		case "audio/l24":
			return "pcm24";
		default:
			return undefined;
	}
}

function inlineDataToIRContentPart(
	inlineData: { data?: string; mime_type?: string; thought_signature?: string },
): IRContentPart | null {
	if (!inlineData?.data) return null;
	const mimeType = typeof inlineData.mime_type === "string" ? inlineData.mime_type : undefined;
	const normalizedMimeType = mimeType?.toLowerCase();
	if (normalizedMimeType?.startsWith("audio/")) {
		return {
			type: "audio",
			source: "data",
			data: inlineData.data,
			format: resolveAudioFormatFromMimeType(mimeType),
		};
	}

	return {
		type: "image",
		source: "data",
		data: inlineData.data,
		mimeType,
		thoughtSignature: inlineData.thought_signature,
	};
}

/**
 * Postprocess IR response
 */
export function postprocess(ir: any, args: ExecutorExecuteArgs): any {
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
	type StreamToolState = {
		id: string;
		argumentsSoFar: string;
		emittedName: boolean;
	};
	const toolStates = new Map<string, StreamToolState>();

	let created = Math.floor(Date.now() / 1000);
	const model = args.providerModelSlug || args.ir.model || "gemini-2.0-flash-exp";
	const provider = args.providerId || "google-ai-studio";
	const toPayloadEntries = (payload: any): any[] => {
		if (Array.isArray(payload)) return payload.filter((entry) => entry && typeof entry === "object");
		return payload && typeof payload === "object" ? [payload] : [];
	};
	const splitSseBlocks = (value: string): { blocks: string[]; remainder: string } => {
		const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		const blocks = normalized.split(/\n\n/);
		return {
			blocks: blocks.slice(0, -1),
			remainder: blocks[blocks.length - 1] ?? "",
		};
	};
	const emitPayloadEntries = (
		payloadEntries: any[],
		controller: ReadableStreamDefaultController<Uint8Array>,
	): number => {
		let emitted = 0;
		for (const payloadEntry of payloadEntries) {
			const irChunk: IRStreamChunk = {
				id: args.requestId,
				created,
				model,
				provider,
				choices: [],
			};

			if (Array.isArray(payloadEntry?.candidates)) {
				for (const cand of payloadEntry.candidates) {
					const index = cand.index || 0;
					const parts = cand.content?.parts || [];

					let content = "";
					let reasoning = "";
					const mediaParts: IRContentPart[] = [];
					const toolCalls: Array<{
						index: number;
						id?: string;
						name?: string;
						arguments?: string;
					}> = [];
					let functionCallIndex = 0;

					for (const [partIdx, part] of parts.entries()) {
						if (part.text) {
							if (part.thought) {
								reasoning += part.text;
							} else {
								content += part.text;
							}
						} else if (part.functionCall) {
							const toolIndex = functionCallIndex++;
							const stateKey = `${index}:${partIdx}:${part.functionCall.name || "tool"}`;
							let state = toolStates.get(stateKey);
							if (!state) {
								state = {
									id: `call_${args.requestId}_${index}_${partIdx}`,
									argumentsSoFar: "",
									emittedName: false,
								};
								toolStates.set(stateKey, state);
							}

							const partialArgs = typeof part.functionCall.partialArgs === "string"
								? part.functionCall.partialArgs
								: "";
							const hasPartialArgs = partialArgs.length > 0;
							const nextArguments = hasPartialArgs
								? `${state.argumentsSoFar}${partialArgs}`
								: JSON.stringify(part.functionCall.args || {});
							let argumentsDelta = "";
							if (hasPartialArgs) {
								argumentsDelta = partialArgs;
							} else if (!state.argumentsSoFar) {
								argumentsDelta = nextArguments;
							} else if (nextArguments.startsWith(state.argumentsSoFar)) {
								argumentsDelta = nextArguments.slice(state.argumentsSoFar.length);
							} else if (nextArguments !== state.argumentsSoFar) {
								argumentsDelta = nextArguments;
							}

							const functionDelta: { name?: string; arguments?: string } = {};
							if (!state.emittedName && part.functionCall.name) {
								functionDelta.name = part.functionCall.name;
								state.emittedName = true;
							}
							if (argumentsDelta) {
								functionDelta.arguments = argumentsDelta;
								state.argumentsSoFar = nextArguments;
							}

							if (Object.keys(functionDelta).length > 0) {
								toolCalls.push({
									index: toolIndex,
									id: state.id,
									name: functionDelta.name,
									arguments: functionDelta.arguments,
								});
							}
						} else {
							const inlineData = normalizeGeminiInlineData(part);
							if (inlineData?.data) {
								const mediaPart = inlineDataToIRContentPart(inlineData);
								if (mediaPart) {
									mediaParts.push(mediaPart);
								}
							}
						}
					}

					const delta: IRStreamDelta = {};
					if (content) delta.content = content;
					const deltaContentParts: any[] = [];
					if (reasoning) {
						deltaContentParts.push({
							type: "reasoning_text",
							text: reasoning,
						} as any);
					}
					if (mediaParts.length > 0) {
						deltaContentParts.push(...mediaParts);
					}
					if (deltaContentParts.length > 0) {
						delta.contentParts = deltaContentParts;
					}

					let finishReason = cand.finishReason ? mapGeminiFinishReason(cand.finishReason) : undefined;
					if (finishReason === "stop" && toolCalls.length > 0) {
						finishReason = "tool_calls";
					}

					const choice: any = {
						index,
						delta: {
							role: "assistant",
							...delta,
						},
						finishReason,
					};
					if (toolCalls.length > 0) {
						choice.delta.toolCalls = toolCalls;
					}

					if (Object.keys(choice.delta).length > 0 || finishReason) {
						irChunk.choices.push(choice);
					}
				}
			}

			const chunkUsage = googleUsageMetadataToIRUsage(payloadEntry?.usageMetadata);
			if (chunkUsage) {
				irChunk.usage = chunkUsage;
			}

			if (irChunk.choices.length === 0 && !irChunk.usage) {
				continue;
			}

			const openAIChunk = encodeIRChunkToOpenAI(irChunk);
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
			emitted += 1;
		}
		return emitted;
	};

	const openAIStream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let rawText = "";
			let emittedChunkCount = 0;
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) {
						const trimmed = buf.trim();
						if (trimmed.length > 0) {
							const { blocks, remainder } = splitSseBlocks(`${buf}\n\n`);
							buf = remainder;
							for (const block of blocks) {
								const dataStr = block
									.split(/\n/)
									.map((line) => line.replace(/\r$/, ""))
									.filter((line) => line.startsWith("data:"))
									.map((line) => line.slice(5).trimStart())
									.join("")
									.trim();
								if (!dataStr || dataStr === "[DONE]") continue;
								let payload: any;
								try {
									payload = JSON.parse(dataStr);
								} catch {
									continue;
								}
								emittedChunkCount += emitPayloadEntries(toPayloadEntries(payload), controller);
							}
						}
						if (emittedChunkCount === 0 && rawText.trim().length > 0) {
							const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
							const fallbackPayloads = normalized.startsWith("data:")
								? normalized
									.split("\n")
									.map((line) => line.trim())
									.filter((line) => line.startsWith("data:"))
									.map((line) => line.slice(5).trimStart())
									.filter((line) => line.length > 0 && line !== "[DONE]")
								: [normalized];
							for (const payloadStr of fallbackPayloads) {
								let payload: any;
								try {
									payload = JSON.parse(payloadStr);
								} catch {
									continue;
								}
								emittedChunkCount += emitPayloadEntries(toPayloadEntries(payload), controller);
							}
						}
						break;
					}

					const decoded = decoder.decode(value, { stream: true });
					rawText += decoded;
					buf += decoded;
					const split = splitSseBlocks(buf);
					const lines = split.blocks;
					buf = split.remainder;

					for (const block of lines) {
						// Extract data payload; Gemini SSE can include multiple data: lines.
						const dataStr = block
							.split(/\r?\n/)
							.map((line) => line.replace(/\r$/, ""))
							.filter((line) => line.startsWith("data:"))
							.map((line) => line.slice(5).trimStart())
							.join("")
							.trim();
						if (!dataStr || dataStr === "[DONE]") continue;

						let payload: any;
						try {
							payload = JSON.parse(dataStr);
						} catch {
							continue;
						}
						emittedChunkCount += emitPayloadEntries(toPayloadEntries(payload), controller);
					}
				}
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			} catch (err) {
				console.error("Gemini stream transform error:", err);
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

		// Handle reasoning in contentParts
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
				} else if (part.type === "audio") {
					const mimeType = (() => {
						if (part.format === "wav") return "audio/wav";
						if (part.format === "mp3") return "audio/mpeg";
						if (part.format === "flac") return "audio/flac";
						if (part.format === "m4a") return "audio/m4a";
						if (part.format === "ogg") return "audio/ogg";
						if (part.format === "pcm16") return "audio/l16";
						if (part.format === "pcm24") return "audio/l24";
						return "audio/wav";
					})();
					const audioUrl = part.source === "data"
						? `data:${mimeType};base64,${part.data}`
						: part.data;
					if (!Array.isArray(delta.audios)) {
						delta.audios = [];
					}
					delta.audios.push({
						type: "audio_url",
						audio_url: { url: audioUrl },
						...(part.format ? { format: part.format } : {}),
						mime_type: mimeType,
					});
				}
			}
		}
		if (Array.isArray(c.delta.toolCalls) && c.delta.toolCalls.length > 0) {
			delta.tool_calls = c.delta.toolCalls.map((tc) => ({
				index: tc.index,
				...(tc.id ? { id: tc.id } : {}),
				type: "function",
				function: {
					...(tc.name ? { name: tc.name } : {}),
					...(typeof tc.arguments === "string" ? { arguments: tc.arguments } : {}),
				},
			}));
		}

		return {
			index: c.index,
			delta,
			finish_reason: c.finishReason || null,
		};
	});

	// Only include usage if present (OpenAI standard is to include it in the final chunk)
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





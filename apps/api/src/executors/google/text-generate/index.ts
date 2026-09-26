// Purpose: Executor for google / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Google Gemini Text Generation Executor
// Documentation: https://ai.google.dev/gemini-api/docs/text-generation
// NOT OpenAI-compatible - uses Google's native API format

import type { IRChatRequest, IRChatResponse, IRContentPart, IRChoice } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import type { ProviderExecutor } from "../../types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { bufferStreamToIR } from "@executors/_shared/text-generate/openai-compat";
import { transformStream } from "@executors/google-ai-studio/text-generate";
import { withNormalizedReasoning } from "./normalize-reasoning";
import { irPartsToGeminiParts } from "../shared/media";
import { resolveGoogleModelCandidates } from "../shared/model";
import { applyGoogleOutputTokenFallback, applyOpenAIUsageFallback } from "../shared/usage-fallback";
import {
	modelSupportsGoogleThinkingLevels,
	resolveGoogleThinkingLevelForEffort,
} from "../shared/thinking";
import { sanitizeGeminiSchema } from "../shared/schema";
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
async function irToGemini(ir: IRChatRequest, modelOverride?: string | null, upstreamTiming?: ExecutorExecuteArgs["upstreamTiming"]): Promise<any> {
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
			const parts = await irPartsToGeminiParts(msg.content, { upstreamTiming });
			systemInstruction = { parts };
		} else if (msg.role === "user") {
			contents.push({
				role: "user",
				parts: await irPartsToGeminiParts(msg.content, { upstreamTiming }),
			});
		} else if (msg.role === "assistant") {
			contents.push({
				role: "model", // Google uses "model" not "assistant"
				parts: await irPartsToGeminiParts(msg.content, { upstreamTiming }),
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
	if (
		ir.reasoning?.enabled ||
		ir.reasoning?.effort ||
		(ir.reasoning?.maxTokens !== undefined) ||
		(ir.reasoning?.includeThoughts !== undefined)
	) {
		const thinkingConfig: any = {
			includeThoughts: ir.reasoning?.includeThoughts ?? true,
		};
		const modelName = modelOverride ?? ir.model;
		const supportsThinkingLevel = modelSupportsGoogleThinkingLevels(modelName ?? "");
		if (ir.reasoning?.effort && supportsThinkingLevel) {
			const level = resolveGoogleThinkingLevelForEffort(modelName ?? "", ir.reasoning.effort);
			if (level) thinkingConfig.thinkingLevel = level;
		} else if (ir.reasoning?.maxTokens !== undefined) {
			thinkingConfig.thinkingBudget = ir.reasoning.maxTokens;
		} else if (ir.reasoning?.enabled) {
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
			generationConfig.responseSchema = sanitizeGeminiSchema(ir.responseFormat.schema);
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

	// Tools (function calling)
	if (ir.tools && ir.tools.length > 0) {
		request.tools = [{
			functionDeclarations: ir.tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: sanitizeGeminiSchema(tool.parameters),
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
		return bindings.GOOGLE_AI_STUDIO_API_KEY;
	});

	// Determine model candidates (must be in URL, not body)
	const requestedModel = providerModelSlug || ir.model || "gemini-2.0-flash-exp";
	const modelCandidates = resolveGoogleModelCandidates(requestedModel);
	let model = modelCandidates[0] || "gemini-2.0-flash-exp";
	const baseRoot = String(bindings.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
	const baseUrl = /\/v1(beta)?$/i.test(baseRoot) ? baseRoot : `${baseRoot}/v1beta`;

	const makeEndpoint = (candidateModel: string) =>
		`${baseUrl}/models/${encodeURIComponent(candidateModel)}:streamGenerateContent?alt=sse`;

	try {
		const doRequest = async (candidateModel: string) => {
			const requestBody = await irToGemini(ir, candidateModel, args.upstreamTiming);
			const endpoint = makeEndpoint(candidateModel);
			const response = await fetchUpstream(args, endpoint, {
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
		const selectedDispatchAtMs = args.upstreamTiming?.timingFor(response)?.dispatchAtMs ?? Date.now();
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

		const contentType = String(response.headers.get("content-type") || "").toLowerCase();
		const isJsonResponse = contentType.includes("application/json") && !contentType.includes("text/event-stream");

		if (response.body && !isJsonResponse) {
			if (ir.stream) {
				const transformedStream = transformStream(response.body, args, keyInfo.source);
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
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
			} as ExecutorExecuteArgs;
			const transformedStream = transformStream(response.body, bufferingArgs, keyInfo.source);
			const transformedResponse = new Response(transformedStream, {
				status: response.status,
				headers: response.headers,
			});
			const { ir: irResponse, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
				transformedResponse,
				args,
				"chat",
				selectedDispatchAtMs,
				undefined, keyInfo.source,
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
			latencyMs: firstByteMs ?? undefined,
					generationMs: totalMs,
				},
			};
		}

		const data = await response.json();
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

		const totalMs = Date.now() - selectedDispatchAtMs;

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
// Google and Vertex use the same bounded native Gemini stream translator.
export { transformStream } from "@executors/google-ai-studio/text-generate";

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


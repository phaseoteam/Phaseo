// Purpose: Executor for google-ai-studio / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Google AI Studio Text Generation Executor
// Documentation: https://ai.google.dev/gemini-api/docs/text-generation
// Uses Google's native Gemini API format (NOT OpenAI-compatible)

import type { IRChatRequest, IRChatResponse, IRContentPart, IRChoice, IRStreamChunk, IRStreamDelta, IRToolCall, IRUsage } from "@core/ir";
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
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
import { buildSyntheticServerToolStream } from "@pipeline/surfaces/server-tools.stream";

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

async function irToLegacyGemini(ir: IRChatRequest, modelOverride?: string | null): Promise<any> {
	const contents: any[] = [];
	const systemInstructionParts: any[] = [];
	const toolNamesById = new Map<string, string>();

	for (const message of ir.messages) {
		if (message.role !== "assistant") continue;
		for (const toolCall of message.toolCalls ?? []) {
			if (toolCall.id && toolCall.name) toolNamesById.set(toolCall.id, toolCall.name);
		}
	}

	for (const message of ir.messages) {
		if (message.role === "system" || message.role === "developer") {
			systemInstructionParts.push(...await irPartsToGeminiParts(message.content, { preserveReasoningAsThought: true }));
			continue;
		}

		if (message.role === "user" || message.role === "assistant") {
			contents.push({
				role: message.role === "assistant" ? "model" : "user",
				parts: await irPartsToGeminiParts(message.content, { preserveReasoningAsThought: true }),
			});
			continue;
		}

		if (message.role === "tool") {
			for (const toolResult of message.toolResults) {
				let response: any = toolResult.content;
				if (typeof response === "string") {
					try {
						response = JSON.parse(response);
					} catch {
						response = { content: response };
					}
				}
				contents.push({
					role: "user",
					parts: [{
						functionResponse: {
							name: toolNamesById.get(toolResult.toolCallId) ?? toolResult.toolCallId,
							response,
						},
					}],
				});
			}
		}
	}

	const request: any = { contents };
	if (ir.googleCachedContent !== undefined) request.cachedContent = ir.googleCachedContent;
	if (systemInstructionParts.length > 0) request.systemInstruction = { parts: systemInstructionParts };

	const generationConfig: any = {};
	if (ir.temperature !== undefined) generationConfig.temperature = ir.temperature;
	if (ir.maxTokens !== undefined) generationConfig.maxOutputTokens = ir.maxTokens;
	if (ir.topP !== undefined) generationConfig.topP = ir.topP;
	if (ir.topK !== undefined) generationConfig.topK = ir.topK;
	if (ir.stop) generationConfig.stopSequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];

	if (ir.reasoning?.enabled || ir.reasoning?.effort || ir.reasoning?.maxTokens !== undefined || ir.reasoning?.includeThoughts !== undefined) {
		const thinkingConfig: any = { includeThoughts: ir.reasoning?.includeThoughts ?? true };
		const modelName = modelOverride ?? ir.model;
		if (ir.reasoning?.effort && modelSupportsGoogleThinkingLevels(modelName ?? "")) {
			const level = resolveGoogleThinkingLevelForEffort(modelName ?? "", ir.reasoning.effort);
			if (level) thinkingConfig.thinkingLevel = level;
		} else if (ir.reasoning?.maxTokens !== undefined) {
			thinkingConfig.thinkingBudget = ir.reasoning.maxTokens;
		} else if (ir.reasoning?.enabled) {
			thinkingConfig.thinkingBudget = -1;
		}
		generationConfig.thinkingConfig = thinkingConfig;
	}

	if (ir.responseFormat?.type === "json_object") {
		generationConfig.responseMimeType = "application/json";
	} else if (ir.responseFormat?.type === "json_schema") {
		generationConfig.responseMimeType = "application/json";
		generationConfig.responseSchema = ir.responseFormat.schema;
	}

	const modalities = (ir.modalities ?? [])
		.map((modality) => String(modality).toUpperCase())
		.filter((modality) => modality === "TEXT" || modality === "IMAGE" || modality === "AUDIO");
	if (modalities.length > 0) generationConfig.responseModalities = modalities;

	if (ir.imageConfig) {
		const imageConfig: any = {};
		if (ir.imageConfig.aspectRatio) imageConfig.aspectRatio = ir.imageConfig.aspectRatio;
		if (ir.imageConfig.imageSize) imageConfig.imageSize = ir.imageConfig.imageSize;
		if (typeof ir.imageConfig.includeRaiReason === "boolean") imageConfig.includeRaiReason = ir.imageConfig.includeRaiReason;
		if (ir.imageConfig.referenceImages?.length) imageConfig.referenceImages = ir.imageConfig.referenceImages;
		if (Object.keys(imageConfig).length > 0) generationConfig.imageConfig = imageConfig;
	}

	if (Object.keys(generationConfig).length > 0) request.generationConfig = generationConfig;

	if (ir.tools?.length) {
		request.tools = [{ functionDeclarations: ir.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		})) }];
		if (ir.toolChoice === "auto") request.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
		if (ir.toolChoice === "none") request.toolConfig = { functionCallingConfig: { mode: "NONE" } };
		if (ir.toolChoice === "required") request.toolConfig = { functionCallingConfig: { mode: "ANY" } };
		if (typeof ir.toolChoice === "object" && "name" in ir.toolChoice) {
			request.toolConfig = { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [ir.toolChoice.name] } };
		}
	}

	return request;
}

/**
 * Transform IR request to Google's Interactions API format.
 *
 * Interactions uses:
 * - `input` as content blocks, steps, turns, or text
 * - `system_instruction` as a plain string
 * - `generation_config` with snake_case parameter names
 * - `model` in the JSON body
 */
export async function irToGemini(ir: IRChatRequest, modelOverride?: string | null): Promise<any> {
	const input: any[] = [];
	const systemInstructionParts: string[] = [];
	const toolNamesById = new Map<string, string>();

	for (const msg of ir.messages) {
		if (msg.role !== "assistant" || !Array.isArray(msg.toolCalls)) continue;
		for (const toolCall of msg.toolCalls) {
			if (!toolCall?.id || !toolCall?.name) continue;
			toolNamesById.set(toolCall.id, toolCall.name);
		}
	}

	for (const msg of ir.messages) {
		if (msg.role === "system" || msg.role === "developer") {
			const text = await irPartsToPlainText(msg.content);
			if (text) systemInstructionParts.push(text);
		} else if (msg.role === "user") {
			input.push({
				type: "user_input",
				content: await irPartsToInteractionContent(msg.content),
			});
		} else if (msg.role === "assistant") {
			const outputContent = await irPartsToInteractionContent(
				msg.content.filter((part) => part.type !== "reasoning_text"),
			);
			if (outputContent.length > 0) {
				input.push({
					type: "model_output",
					content: outputContent,
				});
			}
			for (const part of msg.content) {
				if (part.type !== "reasoning_text") continue;
				input.push({
					type: "thought",
					...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}),
					summary: { type: "text", text: part.summary || part.text },
				});
			}
			if (Array.isArray(msg.toolCalls)) {
				for (const toolCall of msg.toolCalls) {
					input.push({
						type: "function_call",
						id: toolCall.id,
						name: toolCall.name,
						arguments: parseToolCallArguments(toolCall.arguments),
					});
				}
			}
		} else if (msg.role === "tool") {
			for (const toolResult of msg.toolResults) {
				let responsePayload: any = toolResult.content;
				if (typeof toolResult.content === "string") {
					try {
						responsePayload = JSON.parse(toolResult.content);
					} catch {
						responsePayload = { content: toolResult.content };
					}
				}
				input.push({
					type: "function_result",
					call_id: toolResult.toolCallId,
					name: toolNamesById.get(toolResult.toolCallId) ?? toolResult.toolCallId,
					is_error: toolResult.isError,
					result: responsePayload,
				});
			}
		}
	}

	const previousInteractionId = resolvePreviousInteractionId(ir);
	const request: any = {
		model: modelOverride ?? ir.model,
		input,
		store: Boolean(ir.store || previousInteractionId || ir.background),
	};

	if (ir.googleCachedContent !== undefined) {
		request.cached_content = ir.googleCachedContent;
	}

	if (previousInteractionId) {
		request.previous_interaction_id = previousInteractionId;
	}
	if (ir.background !== undefined) {
		request.background = ir.background;
	}
	if (ir.serviceTier) {
		request.service_tier = ir.serviceTier;
	}

	const generationConfig: any = {};

	if (ir.temperature !== undefined) generationConfig.temperature = ir.temperature;
	if (ir.maxTokens !== undefined) generationConfig.max_output_tokens = ir.maxTokens;
	if (ir.topP !== undefined) generationConfig.top_p = ir.topP;
	if (ir.seed !== undefined) generationConfig.seed = ir.seed;
	if (ir.frequencyPenalty !== undefined) generationConfig.frequency_penalty = ir.frequencyPenalty;
	if (ir.presencePenalty !== undefined) generationConfig.presence_penalty = ir.presencePenalty;
	if (ir.stop) {
		generationConfig.stop_sequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	}

	if (
		ir.reasoning?.enabled ||
		ir.reasoning?.effort ||
		(ir.reasoning?.maxTokens !== undefined) ||
		(ir.reasoning?.includeThoughts !== undefined)
	) {
		const modelName = modelOverride ?? ir.model;
		const supportsThinkingLevel = modelSupportsGoogleThinkingLevels(modelName ?? "");
		if (ir.reasoning?.effort && supportsThinkingLevel) {
			const level = resolveGoogleThinkingLevelForEffort(modelName ?? "", ir.reasoning.effort);
			if (level) generationConfig.thinking_level = level.toLowerCase();
		}
		else if (ir.reasoning?.enabled && supportsThinkingLevel) {
			generationConfig.thinking_level = "high";
		}

		generationConfig.thinking_summaries = ir.reasoning?.includeThoughts === false ? "none" : "auto";
	}

	const responseFormatEntries: any[] = [];
	if (ir.responseFormat) {
		if (ir.responseFormat.type === "json_object") {
			responseFormatEntries.push({ type: "text", mime_type: "application/json" });
		} else if (ir.responseFormat.type === "json_schema") {
			responseFormatEntries.push({
				type: "text",
				mime_type: "application/json",
				schema: ir.responseFormat.schema,
			});
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
				systemInstructionParts.push(schemaInstruction);
			}
		}
	}

	const requestedModalities = Array.isArray(ir.modalities) && ir.modalities.length > 0
		? ir.modalities
		: isGeminiImageModelName(modelOverride ?? ir.model)
			? (["text", "image"] as const)
			: [];
	let mappedResponseModalities: string[] = [];
	if (requestedModalities.length > 0) {
		const mapped = requestedModalities
			.map((mode) => (typeof mode === "string" ? mode.toLowerCase() : ""))
			.filter((mode) => mode === "text" || mode === "image" || mode === "audio");
		if (mapped.length > 0) {
			mappedResponseModalities = mapped;
			request.response_modalities = mapped;
		}
	}

	if (ir.imageConfig) {
		const imageFormat: any = {
			type: "image",
			mime_type: "image/jpeg",
			delivery: "inline",
		};

		if (ir.imageConfig.aspectRatio) {
			imageFormat.aspect_ratio = ir.imageConfig.aspectRatio;
		}

		if (ir.imageConfig.imageSize) {
			imageFormat.image_size = ir.imageConfig.imageSize === "0.5K"
				? "512"
				: ir.imageConfig.imageSize;
		}

		responseFormatEntries.push(imageFormat);
	}

	if (mappedResponseModalities.includes("image") && !responseFormatEntries.some((entry) => entry?.type === "image")) {
		responseFormatEntries.push({
			type: "image",
			mime_type: "image/jpeg",
			delivery: "inline",
		});
	}
	if (mappedResponseModalities.includes("audio") && !responseFormatEntries.some((entry) => entry?.type === "audio")) {
		responseFormatEntries.push({
			type: "audio",
			delivery: "inline",
		});
	}

	if (Object.keys(generationConfig).length > 0) {
		request.generation_config = generationConfig;
	}

	if (systemInstructionParts.length > 0) {
		request.system_instruction = systemInstructionParts.join("\n\n");
	}

	if (responseFormatEntries.length === 1) {
		request.response_format = responseFormatEntries[0];
	} else if (responseFormatEntries.length > 1) {
		request.response_format = responseFormatEntries;
	}

	if (ir.tools && ir.tools.length > 0) {
		request.tools = ir.tools.map(tool => ({
			type: "function",
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		}));

		if (ir.toolChoice) {
			if (ir.toolChoice === "auto") {
				generationConfig.tool_choice = "auto";
			} else if (ir.toolChoice === "none") {
				generationConfig.tool_choice = "none";
			} else if (ir.toolChoice === "required") {
				generationConfig.tool_choice = "any";
			} else if (typeof ir.toolChoice === "object" && "name" in ir.toolChoice) {
				generationConfig.tool_choice = {
					type: "function",
					name: ir.toolChoice.name,
				};
			}
			request.generation_config = generationConfig;
		}
	}

	return request;
}

async function irPartsToPlainText(parts: IRContentPart[]): Promise<string> {
	const mapped = await irPartsToGeminiParts(parts, { preserveReasoningAsThought: true });
	return mapped
		.map((part) => {
			if (typeof part?.text === "string") return part.text;
			if (part?.inline_data?.mime_type) return `[${part.inline_data.mime_type} omitted from system instruction]`;
			if (part?.file_data?.file_uri) return `[file: ${part.file_data.file_uri}]`;
			try {
				return JSON.stringify(part);
			} catch {
				return "";
			}
		})
		.filter((text) => text.length > 0)
		.join("\n");
}

async function irPartsToInteractionContent(parts: IRContentPart[]): Promise<any[]> {
	const mapped = await irPartsToGeminiParts(parts, { preserveReasoningAsThought: true });
	const content: any[] = [];

	for (const part of mapped) {
		content.push(...geminiPartToInteractionContent(part));
	}

	return content;
}

function geminiPartToInteractionContent(part: any): any[] {
	if (!part || typeof part !== "object") return [];
	if (typeof part.text === "string") {
		return [{ type: "text", text: part.text }];
	}

	const inlineData = normalizeGeminiInlineData(part);
	if (inlineData?.data) {
		const mimeType = inlineData.mime_type || "application/octet-stream";
		if (mimeType.startsWith("image/")) {
			return [{
				type: "image",
				mime_type: mimeType,
				data: inlineData.data,
			}];
		}
		if (mimeType.startsWith("audio/")) {
			return [{
				type: "audio",
				mime_type: mimeType,
				data: inlineData.data,
			}];
		}
		if (mimeType.startsWith("video/")) {
			return [{
				type: "video",
				mime_type: mimeType,
				data: inlineData.data,
			}];
		}
		return [{
			type: "document",
			mime_type: mimeType,
			data: inlineData.data,
		}];
	}

	if (part.file_data?.file_uri) {
		const mimeType = part.file_data.mime_type || "application/octet-stream";
		const mediaType =
			mimeType.startsWith("image/")
				? "image"
				: mimeType.startsWith("audio/")
					? "audio"
					: mimeType.startsWith("video/")
						? "video"
						: "document";
		return [{
			type: mediaType,
			mime_type: mimeType,
			uri: part.file_data.file_uri,
		}];
	}

	return [];
}

function parseToolCallArguments(value: string): Record<string, any> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed
			: { value: parsed };
	} catch {
		return { value };
	}
}

function resolvePreviousInteractionId(ir: IRChatRequest): string | undefined {
	const vendorGoogle = (ir.vendor as any)?.google;
	const candidates = [
		vendorGoogle?.previous_interaction_id,
		vendorGoogle?.previousInteractionId,
		vendorGoogle?.interaction_id,
		vendorGoogle?.interactionId,
		typeof ir.previousResponseId === "string" && ir.previousResponseId.startsWith("interactions/")
			? ir.previousResponseId
			: undefined,
	];
	return candidates.find((value): value is string => typeof value === "string" && value.length > 0);
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

function isInteractionPayload(json: any): boolean {
	return Boolean(
		json &&
		typeof json === "object" &&
		(
			Array.isArray(json.steps) ||
			json.object === "interaction" ||
			typeof json.id === "string" && json.id.startsWith("interactions/")
		),
	);
}

function providerPayloadToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	if (isInteractionPayload(json)) {
		return interactionToIR(json, requestId, model, provider);
	}
	return geminiToIR(json, requestId, model, provider);
}

function interactionToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const contentParts: IRContentPart[] = [];
	const toolCalls: IRToolCall[] = [];

	for (const step of Array.isArray(json?.steps) ? json.steps : []) {
		if (!step || typeof step !== "object") continue;

		if (step.type === "model_output") {
			for (const block of Array.isArray(step.content) ? step.content : []) {
				const part = interactionContentToIRPart(block);
				if (part) contentParts.push(part);
			}
		} else if (step.type === "thought") {
			const text = interactionTextFromContent(step.summary);
			if (text) {
				contentParts.push({
					type: "reasoning_text",
					text,
					thoughtSignature: typeof step.signature === "string" ? step.signature : undefined,
					summary: text,
				});
			}
		} else if (step.type === "function_call") {
			toolCalls.push({
				id: typeof step.id === "string" ? step.id : `call_${requestId}_${toolCalls.length}`,
				name: String(step.name ?? "function"),
				arguments: stringifyToolArguments(step.arguments),
			});
		}
	}

	const finishReason = toolCalls.length > 0
		? "tool_calls"
		: mapInteractionStatusToFinishReason(json?.status);

	return {
		id: requestId,
		nativeId: json?.id ?? json?.name,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices: [{
			index: 0,
			message: {
				role: "assistant",
				content: contentParts,
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			},
			finishReason,
		}],
		usage: interactionUsageToIRUsage(
			json?.usage ??
			json?.metadata?.total_usage ??
			json?.usage_metadata ??
			json?.usageMetadata,
		),
	};
}

function interactionContentToIRPart(block: any): IRContentPart | null {
	if (!block || typeof block !== "object") return null;

	if (block.type === "text" && typeof block.text === "string") {
		return {
			type: "text",
			text: block.text,
		};
	}

	if (block.type === "image") {
		const mimeType = typeof block.mime_type === "string" ? block.mime_type : undefined;
		if (typeof block.data === "string") {
			return {
				type: "image",
				source: "data",
				data: block.data,
				mimeType,
			};
		}
		if (typeof block.uri === "string") {
			return {
				type: "image",
				source: "url",
				data: block.uri,
				mimeType,
			};
		}
	}

	if (block.type === "audio") {
		if (typeof block.data === "string") {
			return {
				type: "audio",
				source: "data",
				data: block.data,
				format: resolveAudioFormatFromMimeType(block.mime_type),
			};
		}
		if (typeof block.uri === "string") {
			return {
				type: "audio",
				source: "url",
				data: block.uri,
				format: resolveAudioFormatFromMimeType(block.mime_type),
			};
		}
	}

	if (block.type === "video" && typeof block.uri === "string") {
		return {
			type: "video",
			source: "url",
			url: block.uri,
		};
	}

	return null;
}

function interactionTextFromContent(value: any): string {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.map(interactionTextFromContent).filter(Boolean).join("");
	}
	if (typeof value === "object") {
		if (typeof value.text === "string") return value.text;
		if (value.content) return interactionTextFromContent(value.content);
	}
	return "";
}

function stringifyToolArguments(value: any): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value ?? {});
	} catch {
		return "{}";
	}
}

function mapInteractionStatusToFinishReason(status: unknown): IRChoice["finishReason"] {
	switch (status) {
		case "failed":
		case "cancelled":
		case "expired":
			return "error";
		case "incomplete":
			return "length";
		default:
			return "stop";
	}
}

function pickFiniteUsageNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readInteractionModalityCounts(items: unknown): Record<string, number> {
	const counts: Record<string, number> = {};
	if (!Array.isArray(items)) return counts;

	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const entry = item as any;
		const modality = typeof entry.modality === "string" ? entry.modality.toLowerCase() : "text";
		const tokens = pickFiniteUsageNumber(entry.tokens ?? entry.token_count ?? entry.tokenCount);
		if (tokens == null) continue;
		counts[modality] = (counts[modality] ?? 0) + tokens;
	}

	return counts;
}

function sumUsageCounts(counts: Record<string, number>): number | undefined {
	const values = Object.values(counts).filter((value) => Number.isFinite(value));
	if (values.length === 0) return undefined;
	return values.reduce((total, value) => total + value, 0);
}

function interactionUsageToIRUsage(usage: any): IRUsage | undefined {
	if (!usage || typeof usage !== "object") return undefined;

	const inputByModality = readInteractionModalityCounts(usage.input_tokens_by_modality);
	const outputByModality = readInteractionModalityCounts(usage.output_tokens_by_modality);
	const cachedByModality = readInteractionModalityCounts(usage.cached_tokens_by_modality);

	const inputTokens =
		pickFiniteUsageNumber(usage.total_input_tokens ?? usage.input_tokens) ??
		sumUsageCounts(inputByModality) ??
		0;
	const outputTokens =
		pickFiniteUsageNumber(usage.total_output_tokens ?? usage.output_tokens) ??
		sumUsageCounts(outputByModality) ??
		0;
	const totalTokens =
		pickFiniteUsageNumber(usage.total_tokens) ??
		inputTokens + outputTokens;
	const cachedInputTokens =
		pickFiniteUsageNumber(usage.total_cached_tokens ?? usage.cached_tokens) ??
		sumUsageCounts(cachedByModality);
	const reasoningTokens =
		pickFiniteUsageNumber(
			usage.total_thought_tokens ??
			usage.thought_tokens ??
			usage.reasoning_tokens,
		);

	const ext: IRUsage["_ext"] = {};
	if (pickFiniteUsageNumber(inputByModality.image) != null) ext.inputImageTokens = inputByModality.image;
	if (pickFiniteUsageNumber(inputByModality.audio) != null) ext.inputAudioTokens = inputByModality.audio;
	if (pickFiniteUsageNumber(inputByModality.video) != null) ext.inputVideoTokens = inputByModality.video;
	if (pickFiniteUsageNumber(outputByModality.image) != null) ext.outputImageTokens = outputByModality.image;
	if (pickFiniteUsageNumber(outputByModality.audio) != null) ext.outputAudioTokens = outputByModality.audio;
	if (pickFiniteUsageNumber(outputByModality.video) != null) ext.outputVideoTokens = outputByModality.video;

	const irUsage: IRUsage = {
		inputTokens,
		outputTokens,
		totalTokens,
	};

	if (cachedInputTokens != null) {
		irUsage.cachedInputTokens = cachedInputTokens;
		irUsage.cachedReadTokensAreSubsetOfInput = true;
	}
	if (reasoningTokens != null) irUsage.reasoningTokens = reasoningTokens;
	if (Object.keys(ext).length > 0) irUsage._ext = ext;

	return irUsage;
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
	const isInteractionsRequest = args.protocol === "google.interactions";
	const bindings = getBindings() as any;

	// Resolve API key: prefer decrypted BYOK for this provider, else use gateway keys.
	const keyInfo = resolveProviderKey(args, () => {
		return bindings.GOOGLE_AI_STUDIO_API_KEY;
	});

	// Determine model candidates (must be in URL, not body)
	const requestedModel = providerModelSlug || ir.model || "gemini-2.0-flash-exp";
	const forceSyntheticImageStream = !isInteractionsRequest && Boolean(ir.stream) && isGeminiImageModelName(requestedModel);
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

	const makeEndpoint = (candidateModel: string) => {
		if (isInteractionsRequest) return `${baseUrl}/interactions`;
		return Boolean(ir.stream) && !forceSyntheticImageStream
			? `${baseUrl}/models/${encodeURIComponent(candidateModel)}:streamGenerateContent?alt=sse`
			: `${baseUrl}/models/${encodeURIComponent(candidateModel)}:generateContent`;
	};

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
			const requestBody = isInteractionsRequest
				? await irToGemini(ir, candidateModel)
				: await irToLegacyGemini(ir, candidateModel);
			if (isInteractionsRequest && Boolean(ir.stream) && !forceSyntheticImageStream) {
				requestBody.stream = true;
			}
			const endpoint = makeEndpoint(candidateModel);
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
		const googleInteractionRequest = attempted.requestBody;
		const response = attempted.response;
		const mappedRequest = (
			meta.echoUpstreamRequest ||
			meta.returnUpstreamRequest ||
			meta.debug?.return_upstream_request ||
			meta.debug?.trace
		) ? JSON.stringify(googleInteractionRequest) : undefined;

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
			const irResponse = providerPayloadToIR(data, requestId, model, providerId);
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
			const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
			const stream =
				protocol === "openai.chat.completions"
					? buildSyntheticServerToolStream({
						protocol,
						payload: finalPayload,
						requestId,
						model,
						created: finalPayload.created,
					})
					: createSyntheticResponsesStreamFromIR(irResponse, requestId);

			if (!stream) {
				throw new Error("google_ai_studio_synthetic_stream_failed");
			}

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
		const irResponse = providerPayloadToIR(data, requestId, model, providerId);
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
	type InteractionStepState = {
		type: string;
		id?: string;
		name?: string;
		argumentsSoFar: string;
		emittedName: boolean;
		toolIndex: number;
	};
	const toolStates = new Map<string, StreamToolState>();
	const interactionStepStates = new Map<number, InteractionStepState>();
	let interactionToolCallCount = 0;
	let interactionSawFunctionCall = false;

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
	const enqueueIRChunk = (
		irChunk: IRStreamChunk,
		controller: ReadableStreamDefaultController<Uint8Array>,
	): void => {
		const openAIChunk = encodeIRChunkToOpenAI(irChunk);
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
	};
	const buildBaseIRChunk = (): IRStreamChunk => ({
		id: args.requestId,
		created,
		model,
		provider,
		choices: [],
	});
	const emitInteractionPayloadEntry = (
		payloadEntry: any,
		controller: ReadableStreamDefaultController<Uint8Array>,
	): number | null => {
		const eventType = typeof payloadEntry?.event_type === "string" ? payloadEntry.event_type : null;
		if (!eventType) return null;

		if (eventType === "interaction.created") {
			const createdAt = Date.parse(payloadEntry?.interaction?.created ?? "");
			if (Number.isFinite(createdAt)) {
				created = Math.floor(createdAt / 1000);
			}
			return 0;
		}

		if (eventType === "step.start") {
			const index = Number.isFinite(payloadEntry.index) ? Number(payloadEntry.index) : 0;
			const step = payloadEntry.step ?? {};
			const state: InteractionStepState = {
				type: String(step.type ?? ""),
				id: typeof step.id === "string" ? step.id : undefined,
				name: typeof step.name === "string" ? step.name : undefined,
				argumentsSoFar: "",
				emittedName: false,
				toolIndex: interactionToolCallCount,
			};
			if (state.type === "function_call") {
				interactionSawFunctionCall = true;
				interactionToolCallCount += 1;
			}
			interactionStepStates.set(index, state);

			if (state.type === "function_call") {
				const irChunk = buildBaseIRChunk();
				irChunk.choices.push({
					index: 0,
					delta: {
						role: "assistant",
						toolCalls: [{
							index: state.toolIndex,
							...(state.id ? { id: state.id } : {}),
							...(state.name ? { name: state.name } : {}),
							arguments: "",
						}],
					},
				} as any);
				state.emittedName = Boolean(state.name);
				enqueueIRChunk(irChunk, controller);
				return 1;
			}

			return 0;
		}

		if (eventType === "step.delta") {
			const index = Number.isFinite(payloadEntry.index) ? Number(payloadEntry.index) : 0;
			const state = interactionStepStates.get(index);
			const delta = payloadEntry.delta ?? {};
			const irChunk = buildBaseIRChunk();
			const choice: any = {
				index: 0,
				delta: {
					role: "assistant",
				},
			};

			if (delta.type === "text" && typeof delta.text === "string") {
				choice.delta.content = delta.text;
			} else if (delta.type === "image" || delta.type === "audio") {
				const part = interactionContentToIRPart(delta);
				if (part) {
					choice.delta.contentParts = [part];
				}
			} else if (delta.type === "thought_summary") {
				const text = interactionTextFromContent(delta.content);
				if (text) {
					choice.delta.contentParts = [{
						type: "reasoning_text",
						text,
					}];
				}
			} else if (delta.type === "arguments_delta") {
				const argumentsDelta = typeof delta.arguments === "string" ? delta.arguments : "";
				const toolIndex = state?.toolIndex ?? 0;
				const toolDelta: {
					index: number;
					id?: string;
					name?: string;
					arguments?: string;
				} = {
					index: toolIndex,
				};
				if (state?.id) toolDelta.id = state.id;
				if (state?.name && !state.emittedName) {
					toolDelta.name = state.name;
					state.emittedName = true;
				}
				if (argumentsDelta) {
					toolDelta.arguments = argumentsDelta;
					if (state) {
						state.argumentsSoFar += argumentsDelta;
					}
				}
				choice.delta.toolCalls = [toolDelta];
			}

			const hasDelta = Object.keys(choice.delta).some((key) => key !== "role");
			if (!hasDelta) return 0;
			irChunk.choices.push(choice);
			enqueueIRChunk(irChunk, controller);
			return 1;
		}

		if (eventType === "interaction.completed") {
			const interaction = payloadEntry.interaction ?? {};
			const usage = interactionUsageToIRUsage(
				interaction.usage ??
				payloadEntry.usage ??
				payloadEntry.metadata?.total_usage,
			);
			const irChunk = buildBaseIRChunk();
			irChunk.choices.push({
				index: 0,
				delta: { role: "assistant" },
				finishReason: interactionSawFunctionCall
					? "tool_calls"
					: mapInteractionStatusToFinishReason(interaction.status),
			});
			if (usage) irChunk.usage = usage;
			enqueueIRChunk(irChunk, controller);
			return 1;
		}

		if (eventType === "error") {
			const message = payloadEntry?.error?.message || "google_interaction_stream_error";
			throw new Error(message);
		}

		return 0;
	};
	const emitPayloadEntries = (
		payloadEntries: any[],
		controller: ReadableStreamDefaultController<Uint8Array>,
	): number => {
		let emitted = 0;
		for (const payloadEntry of payloadEntries) {
			const interactionEmitted = emitInteractionPayloadEntry(payloadEntry, controller);
			if (interactionEmitted !== null) {
				emitted += interactionEmitted;
				continue;
			}

			const irChunk = buildBaseIRChunk();

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

			enqueueIRChunk(irChunk, controller);
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

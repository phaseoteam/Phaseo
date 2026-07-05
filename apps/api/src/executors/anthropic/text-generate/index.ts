// Purpose: Executor for anthropic / text-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Anthropic Executor
// Handles: Anthropic Messages API
// CRITICAL FIX: Properly extracts tool_use blocks from responses!

import type { ExecutorExecuteArgs, ExecutorResult, Bill, ProviderExecutor } from "@executors/types";
import type { IRChatRequest, IRChatResponse, IRChoice, IRContentPart, IRToolCall } from "@core/ir";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { createAnthropicToResponsesStreamTransformer } from "./stream-transformer";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { mapIrEffortToAnthropic } from "@core/reasoningEffort";
import { isIRNativeToolDefinition } from "@core/nativeTools";

const ANTHROPIC_FAST_MODE_BETA = "fast-mode-2026-02-01";
const ANTHROPIC_ADVISOR_BETA = "advisor-tool-2026-03-01";

function anthropicBaseUrl(): string {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	return String(bindings.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
}

function usesAnthropicNativeWebFetch(requestBody: any): boolean {
	return Array.isArray(requestBody?.tools) &&
		requestBody.tools.some((tool: any) => tool?.type === "web_fetch_20260209");
}

function usesAnthropicNativeAdvisor(requestBody: any): boolean {
	return Array.isArray(requestBody?.tools) &&
		requestBody.tools.some((tool: any) => tool?.type === "advisor_20260301");
}

/**
 * Executes IR requests using Anthropic Messages API
 */
export async function executeAnthropic(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
		// Use upstream start time from pipeline (set before executor is called)
		// Falls back to current time if not provided (backward compatibility)
		const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();

		// Resolve API key (gateway or BYOK)
		const keyInfo = resolveProviderKey(
			{
				providerId: args.providerId,
				byokMeta: args.byokMeta,
			} as any,
			() => {
				const bindings = getBindings() as any;
				return bindings.ANTHROPIC_API_KEY;
			},
		);

		// Transform IR to Anthropic Messages format
		const requestPayload = irToAnthropicMessages(
			args.ir,
			args.maxOutputTokens,
			args.providerModelSlug || args.ir.model,
			{
				inferenceGeo: resolveAnthropicInferenceGeo(args.providerId, args.ir),
			},
		);

		const requestBody = {
			...requestPayload,
			model: args.providerModelSlug || args.ir.model,
			stream: true,
		};
		const requestPayloadJson = JSON.stringify(requestBody);
		const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestPayloadJson : undefined;
	const anthropicBetas = [
		requestBody.speed === "fast" ? ANTHROPIC_FAST_MODE_BETA : null,
		usesAnthropicNativeWebFetch(requestBody) ? "web-fetch-2026-02-09" : null,
		usesAnthropicNativeAdvisor(requestBody) ? ANTHROPIC_ADVISOR_BETA : null,
	].filter((entry): entry is string => Boolean(entry));

		// Execute upstream call
		const res = await fetch(`${anthropicBaseUrl()}/v1/messages`, {
			method: "POST",
			headers: {
				"x-api-key": keyInfo.key,
				"Content-Type": "application/json",
				"anthropic-version": "2023-06-01",
				...(anthropicBetas.length > 0 ? { "anthropic-beta": anthropicBetas.join(",") } : {}),
				...upstreamTestHeaders(args.meta),
			},
			body: requestPayloadJson,
		});

		// Initialize billing
                const bill: Bill = {
                        cost_cents: 0,
                        currency: "USD",
                        usage: undefined,
                        upstream_id: res.headers.get("request-id") || undefined,
                        finish_reason: null,
                };
                if (!res.ok) {
                        return {
                                kind: "completed",
                                ir: undefined,
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                        };
                }

                // Handle streaming vs non-streaming
                if (args.ir.stream) {
                        if (!res.body) {
                                throw new Error("anthropic_stream_missing_body");
                        }

                        const model = args.providerModelSlug || args.ir.model;
                        const responsesStream = res.body.pipeThrough(
                                createAnthropicToResponsesStreamTransformer(args.requestId, model),
                        );
                        const normalized = resolveStreamForProtocol(
                                new Response(responsesStream, {
                                        status: res.status,
                                        headers: res.headers,
                                }),
                                args,
                                "responses",
                        );

                        return {
                                kind: "stream",
                                stream: normalized,
                                usageFinalizer: createUsageFinalizer(res, args),
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                        };
                } else {
                        // Buffer streaming response into a final snapshot
                        const { message, firstFrameMs, totalMs } = await bufferAnthropicStreamToMessage(res, upstreamStartMs);

                        // CRITICAL: Convert to IR with proper tool_use extraction
                        const ir = anthropicMessagesToIR(message, args.requestId, args.ir.model, args.providerId);

			// Calculate pricing
			const usageMeters = normalizeTextUsageForPricing(ir.usage);
			if (usageMeters) {
				bill.usage = usageMeters;
			}

                        return {
                                kind: "completed",
                                ir,
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                                rawResponse: message,
                                timing: {
                                        latencyMs: firstFrameMs ?? undefined,
                                        generationMs:
						typeof firstFrameMs === "number" && typeof totalMs === "number"
							? Math.max(0, totalMs - firstFrameMs)
							: totalMs ?? undefined,
                                },
                        };
                }
}

async function bufferAnthropicStreamToMessage(res: Response, upstreamStartMs: number): Promise<{ message: any; firstFrameMs: number | null; totalMs: number | null }> {
	if (!res.body) throw new Error("anthropic_stream_missing_body");
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let buf = "";
	let firstFrameMs: number | null = null;
	let finished = false;

	type AnthropicBlock = {
		type: string;
		text?: string;
		id?: string;
		name?: string;
		input?: any;
		_partialInputJson?: string;
		[key: string]: any;
	};

	const message: any = {
		content: [],
		usage: {},
	};

	const getBlock = (index: number): AnthropicBlock => {
		if (!message.content[index]) {
			message.content[index] = { type: "text", text: "" };
		}
		return message.content[index];
	};

	const applyUsage = (usage: any) => {
		if (!usage || typeof usage !== "object") return;
		message.usage = {
			...(message.usage ?? {}),
			...usage,
		};
	};

	const parsePartialJson = (value: string): any => {
		try {
			return JSON.parse(value);
		} catch {
			return undefined;
		}
	};

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (firstFrameMs === null) {
			firstFrameMs = Date.now() - upstreamStartMs;
		}
		buf += dec.decode(value, { stream: true });
		const frames = buf.split(/\n\n/);
		buf = frames.pop() ?? "";

		for (const raw of frames) {
			const lines = raw.split("\n");
			let data = "";
			for (const line of lines) {
				const l = line.replace(/\r$/, "");
				if (l.startsWith("data:")) data += l.slice(5).trimStart();
			}
			if (!data || data === "[DONE]") continue;

			let payload: any;
			try {
				payload = JSON.parse(data);
			} catch {
				continue;
			}

			const type = payload?.type;
			if (!type) continue;

			if (type === "message_start") {
				const started = payload?.message ?? {};
				message.id = started.id ?? message.id;
				message.type = started.type ?? "message";
				message.role = started.role ?? "assistant";
				message.model = started.model ?? message.model;
				message.stop_reason = started.stop_reason ?? message.stop_reason;
				message.stop_sequence = started.stop_sequence ?? message.stop_sequence;
				message.content = Array.isArray(started.content) ? [...started.content] : [];
				applyUsage(started.usage);
				continue;
			}

			if (type === "content_block_start") {
				const index = Number(payload?.index ?? 0);
				const block = payload?.content_block ?? {};
				message.content[index] = {
					...block,
					...(block?.type === "tool_use" ? { _partialInputJson: "" } : {}),
				};
				continue;
			}

			if (type === "content_block_delta") {
				const index = Number(payload?.index ?? 0);
				const delta = payload?.delta ?? {};
				const block = getBlock(index);

				if (delta?.type === "text_delta" && typeof delta?.text === "string") {
					block.type = block.type ?? "text";
					block.text = `${block.text ?? ""}${delta.text}`;
				} else if (delta?.type === "input_json_delta" && typeof delta?.partial_json === "string") {
					block.type = "tool_use";
					block._partialInputJson = `${block._partialInputJson ?? ""}${delta.partial_json}`;
				} else if (delta?.type === "thinking_delta" && typeof delta?.thinking === "string") {
					// Keep reasoning-like deltas as text in-place for non-stream buffered responses.
					block.type = block.type ?? "text";
					block.text = `${block.text ?? ""}${delta.thinking}`;
				}
				continue;
			}

			if (type === "content_block_stop") {
				const index = Number(payload?.index ?? 0);
				const block = getBlock(index);
				if (block?.type === "tool_use" && typeof block._partialInputJson === "string") {
					const parsed = parsePartialJson(block._partialInputJson);
					if (parsed !== undefined) {
						block.input = parsed;
					} else if (block.input == null) {
						block.input = {};
					}
				}
				continue;
			}

			if (type === "message_delta") {
				const delta = payload?.delta ?? {};
				if (typeof delta?.stop_reason === "string" || delta?.stop_reason === null) {
					message.stop_reason = delta.stop_reason;
				}
				if (typeof delta?.stop_sequence === "string" || delta?.stop_sequence === null) {
					message.stop_sequence = delta.stop_sequence;
				}
				applyUsage(payload?.usage);
				continue;
			}

			if (type === "message_stop") {
				const stopped = payload?.message;
				if (stopped && typeof stopped === "object") {
					Object.assign(message, stopped);
					if (Array.isArray(stopped.content)) {
						message.content = [...stopped.content];
					}
					applyUsage(stopped.usage);
				}
				finished = true;
				continue;
			}

			if (type === "message") {
				// Some variants emit a full message object directly.
				const whole = payload?.message ?? payload;
				Object.assign(message, whole);
				if (!Array.isArray(message.content)) message.content = [];
				applyUsage(whole?.usage);
			}
		}
	}

	if (!finished && !message.id && (!Array.isArray(message.content) || message.content.length === 0)) {
		throw new Error("anthropic_stream_missing_completion");
	}

	for (const block of message.content ?? []) {
		if (block?.type === "tool_use" && block?._partialInputJson && block?.input == null) {
			const parsed = parsePartialJson(block._partialInputJson);
			block.input = parsed ?? {};
		}
		if (block && typeof block === "object" && "_partialInputJson" in block) {
			delete block._partialInputJson;
		}
	}

	const totalMs = Math.max(0, Date.now() - upstreamStartMs);
	return { message, firstFrameMs, totalMs };
}

/**
 * Transform IR request to Anthropic Messages format
 */
function normalizeModelId(model: string | null | undefined): string {
	return typeof model === "string" ? model.trim().toLowerCase() : "";
}

function usesClaudeAdaptiveThinkingControls(model: string | null | undefined): boolean {
	const normalized = normalizeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-sonnet-5") ||
		normalized.includes("claude-fable-5") ||
		normalized.includes("claude-mythos-5") ||
		normalized.includes("claude-opus-4-7") ||
		normalized.includes("claude-opus-4.7") ||
		normalized.includes("claude-opus-4-8") ||
		normalized.includes("claude-opus-4.8")
	);
}

function supportsAnthropicThinkingDisabled(model: string | null | undefined): boolean {
	const normalized = normalizeModelId(model);
	if (!normalized) return false;
	return normalized.includes("claude-sonnet-5");
}

function supportsAnthropicFastMode(model: string | null | undefined): boolean {
	const normalized = normalizeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-opus-4-6") ||
		normalized.includes("claude-opus-4.6") ||
		normalized.includes("claude-opus-4-7") ||
		normalized.includes("claude-opus-4.7")
	);
}

export function irToAnthropicMessages(
	ir: IRChatRequest,
	providerMaxOutputTokens?: number | null,
	modelHint?: string | null,
	options?: {
		inferenceGeo?: "global" | "us" | null;
	},
): any {
	const messages: any[] = [];
	let system: string | any[] | undefined;
	const resolvedModel = modelHint || ir.model;
	const usesAdaptiveThinkingControls = usesClaudeAdaptiveThinkingControls(resolvedModel);

	for (const msg of ir.messages) {
		if (msg.role === "system") {
			// Anthropic has system as a separate field
			system = mapSystemContentToAnthropic(msg.content);
		} else if (msg.role === "user") {
			messages.push({
				role: "user",
				content: msg.content.map(mapIRContentToAnthropic),
			});
		} else if (msg.role === "assistant") {
			const content: any[] = [];

			for (const part of msg.content) {
				if (part.type === "text") {
					content.push(mapIRContentToAnthropic(part));
					continue;
				}
				if (part.type === "provider_block") {
					content.push(part.block);
				}
			}

			// Add tool_use blocks
			if (msg.toolCalls) {
				for (const tc of msg.toolCalls) {
					content.push({
						type: "tool_use",
						id: tc.id,
						name: tc.name,
						input: JSON.parse(tc.arguments),
					});
				}
			}

			messages.push({ role: "assistant", content });
		} else if (msg.role === "tool") {
			// Tool results as user message with tool_result blocks
			messages.push({
				role: "user",
				content: msg.toolResults.map((result) => {
					const cacheControl = normalizeAnthropicCacheControlValue(result.cacheControl);
					return {
						type: "tool_result",
						tool_use_id: result.toolCallId,
						content: result.content,
						...(cacheControl ? { cache_control: cacheControl } : {}),
					};
				}),
			});
		}
	}

	// Use IR maxTokens if provided, otherwise fall back to provider's max_output_tokens, otherwise 4096
	const maxTokens = ir.maxTokens ?? providerMaxOutputTokens ?? 4096;

	const request: any = {
		messages,
		system: system || undefined,
		max_tokens: maxTokens,
	};
	if (options?.inferenceGeo) {
		request.inference_geo = options.inferenceGeo;
	}

	// Adaptive-thinking Claude models reject non-default sampling params, so omit them.
	if (!usesAdaptiveThinkingControls) {
		if (ir.temperature !== undefined) request.temperature = ir.temperature;
		if (ir.topP !== undefined) request.top_p = ir.topP;
		if (ir.topK !== undefined) request.top_k = ir.topK;
	}

	// Add tools
	if (ir.tools && ir.tools.length > 0) {
		request.tools = ir.tools.map((t) => {
			const cacheControl = normalizeAnthropicCacheControlValue(t.cacheControl ?? t.raw?.cache_control);
			if (isIRNativeToolDefinition(t)) {
				return {
					...(t.raw ?? {}),
					type: t.type,
					name: t.name,
				};
			}
			return {
				name: t.name,
				description: t.description,
				input_schema: t.parameters,
				...(cacheControl ? { cache_control: cacheControl } : {}),
			};
		});
	}

	if (ir.toolChoice) {
		if (typeof ir.toolChoice === "string") {
			if (ir.toolChoice === "auto") request.tool_choice = { type: "auto" };
			else if (ir.toolChoice === "required") request.tool_choice = { type: "any" };
			else if (ir.toolChoice === "none") request.tool_choice = { type: "none" };
		} else {
			request.tool_choice = { type: "tool", name: ir.toolChoice.name };
		}
	}

	// Add other parameters
	if (ir.stop) request.stop_sequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	if (ir.metadata) request.metadata = ir.metadata;
	const reasoningDisabled = ir.reasoning?.enabled === false || ir.reasoning?.effort === "none";

	if (usesAdaptiveThinkingControls) {
		if (reasoningDisabled && supportsAnthropicThinkingDisabled(resolvedModel)) {
			request.thinking = { type: "disabled" };
		} else {
			request.thinking = {
				type: "adaptive",
				display: "summarized",
			};
			const anthropicEffort = mapIrEffortToAnthropic(ir.reasoning?.effort, { preferXHigh: true });
			if (anthropicEffort) {
				request.output_config = {
					...(request.output_config ?? {}),
					effort: anthropicEffort,
				};
			}
		}
	} else if (ir.reasoning) {
		const hasThinkingControl =
			reasoningDisabled ||
			ir.reasoning.enabled === true ||
			typeof ir.reasoning.maxTokens === "number";

		if (reasoningDisabled) {
			request.thinking = { type: "disabled" };
		} else if (hasThinkingControl) {
			const reasoningMaxTokens = typeof ir.reasoning.maxTokens === "number"
				? ir.reasoning.maxTokens
				: undefined;
			if (typeof reasoningMaxTokens === "number" && reasoningMaxTokens > 0) {
				request.thinking = { type: "enabled", budget_tokens: reasoningMaxTokens };
			} else if (ir.reasoning.enabled === true) {
				request.thinking = { type: "enabled" };
			}
		}

		const anthropicEffort = mapIrEffortToAnthropic(ir.reasoning.effort);
		if (!reasoningDisabled && anthropicEffort) {
			request.output_config = {
				...(request.output_config ?? {}),
				effort: anthropicEffort,
			};
		}
	}

	const structuredOutputInstruction = buildAnthropicStructuredOutputInstruction(ir);
	if (structuredOutputInstruction) {
		system = appendAnthropicSystemText(system, structuredOutputInstruction);
		request.system = system;
	}
	applyAnthropicCacheControlDefaults(request, ir.anthropicCacheControl);
	applyAnthropicServiceControls(request, {
		serviceTier: ir.serviceTier,
		model: resolvedModel,
	});

	return request;
}

export function resolveAnthropicInferenceGeo(
	providerId: string,
	ir?: IRChatRequest,
): "global" | "us" | null {
	const explicitInferenceGeo = String(ir?.geo?.inferenceGeo ?? "")
		.trim()
		.toLowerCase();
	if (explicitInferenceGeo === "global" || explicitInferenceGeo === "us") {
		return explicitInferenceGeo;
	}

	const requiredExecutionRegion = String(ir?.geo?.requiredExecutionRegion ?? "")
		.trim()
		.toLowerCase();
	if (requiredExecutionRegion === "us") return "us";
	if (requiredExecutionRegion === "global") return "global";

	if (providerId === "anthropic-us") return "us";
	return null;
}

function buildAnthropicStructuredOutputInstruction(ir: IRChatRequest): string | undefined {
	const format = ir.responseFormat;
	if (!format) return undefined;

	if (format.type === "json_object") {
		return [
			"You must respond with a valid JSON object.",
			"Return only JSON, with no markdown fences or additional commentary.",
		].join(" ");
	}

	if (format.type === "json_schema" && format.schema) {
		const schemaText = (() => {
			try {
				return JSON.stringify(format.schema);
			} catch {
				return undefined;
			}
		})();
		if (!schemaText) return undefined;
		return [
			"You must respond with JSON that strictly matches this schema:",
			schemaText,
			"Return only JSON, with no markdown fences or additional commentary.",
		].join(" ");
	}

	return undefined;
}

function mapSystemContentToAnthropic(content: any[]): string | any[] | undefined {
	const textBlocks = content
		.filter((part) => part?.type === "text")
		.map(mapIRContentToAnthropic);
	if (textBlocks.length === 0) return undefined;
	const hasStructuredMetadata = textBlocks.some((block) => block?.cache_control);
	if (hasStructuredMetadata) return textBlocks;
	return textBlocks.map((block) => block.text ?? "").join("");
}

function appendAnthropicSystemText(system: string | any[] | undefined, text: string): string | any[] {
	if (!system) return text;
	if (Array.isArray(system)) {
		return [
			...system,
			{ type: "text", text },
		];
	}
	return `${system}\n\n${text}`;
}


function normalizeAnthropicCacheControlValue(value: unknown): Record<string, any> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const next: Record<string, any> = { ...(value as Record<string, any>) };
	delete next.scope;
	if (typeof next.type === "string") next.type = next.type.trim();
	if (typeof next.ttl === "string") next.ttl = next.ttl.trim();
	for (const key of Object.keys(next)) {
		if (next[key] === undefined || next[key] === null || next[key] === "") delete next[key];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function applyCacheControlToContentBlocks(content: any[] | undefined, cacheControl: Record<string, any>): void {
	if (!Array.isArray(content)) return;
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		if (block.type !== "text" && block.type !== "image") continue;
		if (block.cache_control && typeof block.cache_control === "object") continue;
		block.cache_control = { ...cacheControl };
	}
}

function applyAnthropicCacheControlDefaults(
	request: any,
	control: unknown,
): void {
	const scopeRaw = typeof (control as any)?.scope === "string" ? (control as any).scope.trim().toLowerCase() : "all_text";
	if (scopeRaw === "none") return;

	const cacheControl = normalizeAnthropicCacheControlValue(control);
	if (!cacheControl) return;

	if (scopeRaw === "all_text") {
		if (typeof request.system === "string" && request.system.trim().length > 0) {
			request.system = [{ type: "text", text: request.system, cache_control: { ...cacheControl } }];
		} else if (Array.isArray(request.system)) {
			applyCacheControlToContentBlocks(request.system, cacheControl);
		}
	}

	const messages = Array.isArray(request.messages) ? request.messages : [];
	if (scopeRaw === "last_user_message") {
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			const msg = messages[i];
			if (msg?.role !== "user") continue;
			applyCacheControlToContentBlocks(msg.content, cacheControl);
			break;
		}
		return;
	}

	for (const msg of messages) {
		if (msg?.role !== "user") continue;
		applyCacheControlToContentBlocks(msg.content, cacheControl);
	}
}
function applyAnthropicServiceControls(
	request: any,
	controls: { serviceTier?: string; model?: string | null },
) {
	if (typeof controls.serviceTier !== "string") return;
	const tier = controls.serviceTier.toLowerCase();

	if (tier === "priority") {
		if (supportsAnthropicFastMode(controls.model)) {
			request.speed = "fast";
			return;
		}
		request.service_tier = "auto";
		return;
	}

	if (tier === "standard") {
		request.service_tier = "standard_only";
		return;
	}

	if (tier === "auto" || tier === "default" || tier === "flex") {
		request.service_tier = "auto";
	}
}

/**
 * Map IR content part to Anthropic content block
 */
function mapIRContentToAnthropic(part: any): any {
	const cacheControl = normalizeAnthropicCacheControlValue(part?.cacheControl);
	if (part.type === "text") {
		return {
			type: "text",
			text: part.text,
			...(cacheControl ? { cache_control: cacheControl } : {}),
		};
	}

	if (part.type === "image") {
		if (part.source === "url") {
			return {
				type: "image",
				source: { type: "url", url: part.data },
				...(cacheControl ? { cache_control: cacheControl } : {}),
			};
		} else {
			return {
				type: "image",
				source: {
					type: "base64",
					media_type: part.mimeType || "image/jpeg",
					data: part.data,
				},
				...(cacheControl ? { cache_control: cacheControl } : {}),
			};
		}
	}

	if (part.type === "provider_block") {
		return part.block;
	}

	// Fallback
	return { type: "text", text: String(part) };
}

/**
 * Transform Anthropic Messages response to IR format
 * CRITICAL FIX: Properly extracts tool_use blocks!
 */
export function anthropicMessagesToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const toolCalls: IRToolCall[] = [];
	const contentParts: IRContentPart[] = [];

	// Extract content blocks
	for (const block of json.content || []) {
		if (block.type === "text") {
			if (block.text.length > 0) {
				contentParts.push({ type: "text", text: block.text });
			}
		} else if (block.type === "tool_use") {
			// CRITICAL: Extract tool_use blocks
			toolCalls.push({
				id: block.id,
				name: block.name,
				arguments: JSON.stringify(block.input),
			});
		} else if (block && typeof block === "object") {
			contentParts.push({ type: "provider_block", block });
		}
	}

	// Determine finish reason
	let finishReason: IRChoice["finishReason"] = "stop";
	if (json.stop_reason === "max_tokens") {
		finishReason = "length";
	} else if (json.stop_reason === "tool_use" || toolCalls.length > 0) {
		finishReason = "tool_calls";
	} else if (json.stop_reason === "stop_sequence") {
		finishReason = "stop";
	}

	const choice: IRChoice = {
		index: 0,
		message: {
			role: "assistant",
			content: contentParts,
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
		},
		finishReason,
		// Preserve which stop sequence triggered (Anthropic-specific)
		stopSequence: json.stop_sequence ?? undefined,
	};

	// Validate ID presence
	if (!json.id) {
		console.warn(`[ID-VALIDATION] Provider ${provider} (Anthropic Messages) did not return response ID`);
	}

	return {
		id: requestId,
		nativeId: json.id,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices: [choice],
		usage: json.usage
			? {
				inputTokens: json.usage.input_tokens || 0,
				outputTokens: json.usage.output_tokens || 0,
				totalTokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
				cachedInputTokens:
					typeof json.usage.cache_read_input_tokens === "number"
						? json.usage.cache_read_input_tokens
						: undefined,
				_ext:
					typeof json.usage.cache_creation_input_tokens === "number"
						? {
							cachedWriteTokens: json.usage.cache_creation_input_tokens,
							cachedWriteTokens5m:
								typeof json.usage.cache_creation?.ephemeral_5m_input_tokens === "number"
									? json.usage.cache_creation.ephemeral_5m_input_tokens
									: undefined,
							cachedWriteTokens1h:
								typeof json.usage.cache_creation?.ephemeral_1h_input_tokens === "number"
									? json.usage.cache_creation.ephemeral_1h_input_tokens
									: undefined,
						}
						: undefined,
			}
			: undefined,
		serviceTier: resolveAnthropicServiceTierFromResponse(json),
	};
}

function resolveAnthropicServiceTierFromResponse(json: any): string | undefined {
	const usageTier = typeof json?.usage?.service_tier === "string"
		? json.usage.service_tier.toLowerCase()
		: undefined;
	if (usageTier === "standard_only") return "standard";
	if (usageTier) return usageTier;

	const usageSpeed = typeof json?.usage?.speed === "string"
		? json.usage.speed.toLowerCase()
		: undefined;
	if (usageSpeed === "fast") return "priority";

	const responseTier = typeof json?.service_tier === "string"
		? json.service_tier.toLowerCase()
		: undefined;
	if (responseTier === "standard_only") return "standard";
	if (responseTier) return responseTier;

	const responseSpeed = typeof json?.speed === "string" ? json.speed.toLowerCase() : undefined;
	if (responseSpeed === "fast") return "priority";

	return undefined;
}

/**
 * Create finalizer for streaming responses
 */
function createUsageFinalizer(res: Response, args: ExecutorExecuteArgs): () => Promise<Bill | null> {
	return async () => {
		// For streaming, usage will be in the final chunk
		// This is handled by the existing streaming infrastructure
		return null;
	};
}

export const executor: ProviderExecutor = async (args) => executeAnthropic(args);


// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// MiniMax Provider Quirks
// Handles reasoning_content plus XML-style tool invocation fallbacks (<invoke ...>)

import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";
import {
	createAionThinkStreamState,
	extractAionThinkBlocks,
	processAionThinkStreamDelta,
} from "@/providers/aion/think";

export type MinimaxParsedToolCall = {
	name: string;
	arguments: string;
};

type ParsedMinimaxContent = {
	main: string;
	reasoning: string[];
	toolCalls: MinimaxParsedToolCall[];
};

function extractReasoningDetailsText(details: unknown): string[] {
	if (!Array.isArray(details)) return [];
	const out: string[] = [];
	for (const entry of details) {
		if (typeof entry === "string" && entry.length > 0) {
			out.push(entry);
			continue;
		}
		if (!entry || typeof entry !== "object") continue;
		const text = (entry as any).text;
		if (typeof text === "string" && text.length > 0) {
			out.push(text);
		}
	}
	return out;
}

function extractMessageText(message: any): string {
	if (!message) return "";
	if (typeof message.content === "string") return message.content;
	if (Array.isArray(message.content)) {
		return message.content
			.map((part: any) => (typeof part?.text === "string" ? part.text : ""))
			.join("");
	}
	return "";
}

function setMessageText(message: any, text: string) {
	if (!message || typeof message !== "object") return;
	if (typeof message.content === "string") {
		message.content = text;
		return;
	}
	if (Array.isArray(message.content)) {
		message.content = text
			? [{ type: "output_text", text, annotations: [] }]
			: [];
		return;
	}
	message.content = text;
}

function parseInvokeCall(block: string): MinimaxParsedToolCall | null {
	const openTagMatch = block.match(/<invoke\b([^>]*)>/i);
	const attrs = openTagMatch?.[1] ?? "";
	let name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? "";

	const parameterRegex = /<parameter\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
	const argsObject: Record<string, string> = {};
	let parameterMatch: RegExpExecArray | null;
	while ((parameterMatch = parameterRegex.exec(block)) !== null) {
		const key = parameterMatch[1]?.trim();
		if (!key) continue;
		argsObject[key] = (parameterMatch[2] ?? "").trim();
	}

	const inner = block
		.replace(/^[\s\S]*?<invoke\b[^>]*>/i, "")
		.replace(/<\/invoke>[\s\S]*$/i, "")
		.replace(/<\/minimax:tool_call>[\s\S]*$/i, "")
		.trim();

	let argumentsValue: Record<string, any> = {};
	if (Object.keys(argsObject).length > 0) {
		argumentsValue = argsObject;
	} else if (inner) {
		try {
			const parsed = JSON.parse(inner);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				const parsedObj = parsed as Record<string, any>;
				if (!name && typeof parsedObj.name === "string") {
					name = parsedObj.name.trim();
				}
				if (parsedObj.arguments && typeof parsedObj.arguments === "object" && !Array.isArray(parsedObj.arguments)) {
					argumentsValue = parsedObj.arguments as Record<string, any>;
				} else {
					argumentsValue = parsedObj;
				}
			}
		} catch {
			// ignore JSON parse errors
		}
	}

	if (!name) return null;
	return {
		name,
		arguments: JSON.stringify(argumentsValue),
	};
}

function parseToolCallsEnvelope(text: string): MinimaxParsedToolCall[] {
	const calls: MinimaxParsedToolCall[] = [];
	const regex = /<tool_calls[^>]*>([\s\S]*?)<\/tool_calls>/gi;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const payload = (match[1] ?? "").trim();
		if (!payload) continue;
		try {
			const parsed = JSON.parse(payload);
			const entries = Array.isArray(parsed) ? parsed : [parsed];
			for (const entry of entries) {
				if (!entry || typeof entry !== "object") continue;
				const obj = entry as Record<string, any>;
				if (typeof obj.name !== "string" || !obj.name.trim()) continue;
				const args = obj.arguments && typeof obj.arguments === "object" && !Array.isArray(obj.arguments)
					? obj.arguments
					: {};
				calls.push({
					name: obj.name.trim(),
					arguments: JSON.stringify(args),
				});
			}
		} catch {
			// ignore malformed tool_calls envelopes
		}
	}
	return calls;
}

function dedupeToolCalls(calls: MinimaxParsedToolCall[]): MinimaxParsedToolCall[] {
	const seen = new Set<string>();
	const out: MinimaxParsedToolCall[] = [];
	for (const call of calls) {
		const key = `${call.name}::${call.arguments}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(call);
	}
	return out;
}

export function parseMinimaxInterleavedText(rawText: string): ParsedMinimaxContent {
	const source = typeof rawText === "string" ? rawText : "";
	const parsedThinking = extractAionThinkBlocks(source);

	const toolCalls: MinimaxParsedToolCall[] = [];
	let main = parsedThinking.main ?? "";

	// Extract XML-style invoke blocks from assistant main content.
	main = main.replace(/<invoke\b[\s\S]*?(?:<\/invoke>|<\/minimax:tool_call>|$)/gi, (block) => {
		const call = parseInvokeCall(block);
		if (call) toolCalls.push(call);
		return "";
	});

	// Extract JSON tool envelope blocks, if present.
	const envelopeCalls = parseToolCallsEnvelope(main);
	if (envelopeCalls.length > 0) {
		toolCalls.push(...envelopeCalls);
		main = main.replace(/<tool_calls[^>]*>[\s\S]*?<\/tool_calls>/gi, "");
	}

	// Remove dangling MiniMax tool tags from malformed outputs.
	main = main
		.replace(/<\/?minimax:tool_call>/gi, "")
		.replace(/<\/?invoke\b[^>]*>/gi, "")
		.replace(/<\/?parameter\b[^>]*>/gi, "")
		.trim();

	return {
		main,
		reasoning: parsedThinking.reasoning.filter((text) => typeof text === "string" && text.length > 0),
		toolCalls: dedupeToolCalls(toolCalls),
	};
}

export const minimaxQuirks: ProviderQuirks = {
	/**
	 * MiniMax compatibility layer is inconsistent with OpenAI json_schema envelope.
	 * Use json_object with schema instruction fallback.
	 */
	transformRequest: ({ request, ir }) => {
		applyJsonSchemaFallback(request);
		// Current MiniMax Chat/Responses OpenAPI does not accept structured-output formats.
		// The shared fallback has already injected the JSON schema as an instruction.
		delete request.response_format;
		if (request.text?.format?.type !== "text") delete request.text;
		const isChatRequest = Array.isArray(request.messages);
		const isM3 = String(request.model ?? ir.model ?? "").toLowerCase().includes("minimax-m3");
		const minimaxOptions = (ir.vendor as any)?.minimax;

		if (isChatRequest && isM3 && ir.reasoning) {
			const modelName = String(request.model ?? ir.model ?? "").toLowerCase();
			const isM31Flash = modelName.includes("minimax-m3.1-flash");
			const disabled = ir.reasoning.enabled === false || ir.reasoning.effort === "none";
			const enabled = ir.reasoning.enabled === true || (
				typeof ir.reasoning.effort === "string" && ir.reasoning.effort !== "none"
			);
			// MiniMax-M3.1-Flash always thinks: thinking "disabled" (or effort none) returns 400,
			// and reasoning_effort (low, medium, high, xhigh, max) sets its depth instead.
			// https://platform.minimax.io/docs/api-reference/text-openai-api
			if (isM31Flash) {
				const effort = ir.reasoning.effort === "minimal" ? "low" : ir.reasoning.effort;
				if (typeof effort === "string" && ["low", "medium", "high", "xhigh", "max"].includes(effort)) {
					request.reasoning_effort = effort;
				}
			} else if (disabled || enabled) {
				request.thinking = { type: disabled ? "disabled" : "adaptive" };
			}
		}
		if (isChatRequest && minimaxOptions?.reasoning_split !== undefined) {
			request.reasoning_split = minimaxOptions.reasoning_split;
		}
		if (isChatRequest && request.tool_choice !== undefined && !["none", "auto"].includes(request.tool_choice)) {
			delete request.tool_choice;
		}
		// The Chat Completions API names this content part video_url.
		if (isChatRequest) {
			for (const message of request.messages) {
				if (!Array.isArray(message?.content)) continue;
				message.content = message.content.map((part: any) => part?.type === "input_video"
					? { ...part, type: "video_url" }
					: part);
			}
		}

		// MiniMax compatibility docs do not define a "developer" role.
		// Normalize it to "system" before upstream dispatch.
		if (Array.isArray(request.messages)) {
			request.messages = request.messages.map((msg: any) =>
				msg?.role === "developer"
					? { ...msg, role: "system" }
					: msg,
			);
		}

		// MiniMax only supports n=1.
		if (request.n != null && request.n !== 1) {
			delete request.n;
		}

		// Enable interleaved thinking compatibility format by default when reasoning/tools are used.
		// This yields reasoning_details and improves pass-back continuity for tool loops.
		const reasoningEnabled =
			ir.reasoning?.enabled ??
			(typeof ir.reasoning?.effort === "string" ? ir.reasoning.effort !== "none" : false);
		if (
			(reasoningEnabled || (Array.isArray(request.tools) && request.tools.length > 0)) &&
			request.reasoning_split == null
		) {
			request.reasoning_split = true;
		}
	},

	extractReasoning: ({ choice, rawContent }) => {
		const parsed = parseMinimaxInterleavedText(rawContent);
		const reasoningContent = choice.message?.reasoning_content;
		const reasoningDetails = extractReasoningDetailsText(choice.message?.reasoning_details);
		const reasoning = typeof reasoningContent === "string" && reasoningContent.length > 0
			? [reasoningContent]
			: (reasoningDetails.length > 0 ? reasoningDetails : parsed.reasoning);
		return {
			main: parsed.main,
			reasoning,
		};
	},

	transformStreamChunk: ({ chunk, accumulated }) => {
		if (!chunk || !Array.isArray(chunk.choices)) return;
		const requestId = accumulated.requestId ?? "req";
		const stateMap = (accumulated.choiceStates ??= new Map<number, {
			reasoningChunks: string[];
			contentChunks: string[];
			thinkState: ReturnType<typeof createAionThinkStreamState>;
			reasoningDetailsSoFar: string;
		}>());

		const isFinal =
			chunk.object === "chat.completion" ||
			(Array.isArray(chunk.choices) && chunk.choices.some((c: any) => c?.finish_reason));

		for (const choice of chunk.choices) {
			const idx = Number(choice.index ?? 0);
			const state = stateMap.get(idx) ?? {
				reasoningChunks: [],
				contentChunks: [],
				thinkState: createAionThinkStreamState(),
				reasoningDetailsSoFar: "",
			};
			if (!stateMap.has(idx)) stateMap.set(idx, state);

			const reasoningDeltas: string[] = [];
			const addReasoningDelta = (value: unknown) => {
				if (typeof value !== "string" || value.length === 0) return;
				if (!reasoningDeltas.includes(value)) reasoningDeltas.push(value);
			};

			addReasoningDelta(choice.delta?.reasoning_content);

			if (typeof choice.delta?.content === "string") {
				const { mainDelta, reasoningDelta } = processAionThinkStreamDelta(state.thinkState, choice.delta.content);
				choice.delta.content = mainDelta;
				if (mainDelta.length > 0) {
					state.contentChunks.push(mainDelta);
				}
				if (reasoningDelta.length > 0) {
					addReasoningDelta(reasoningDelta);
				}
			}

			if (Array.isArray(choice.delta?.reasoning_details)) {
				const detailsText = extractReasoningDetailsText(choice.delta.reasoning_details).join("");
				if (detailsText.length > 0) {
					const previous = state.reasoningDetailsSoFar;
					let deltaText = detailsText;
					if (previous && detailsText.startsWith(previous)) {
						deltaText = detailsText.slice(previous.length);
					} else if (detailsText === previous) {
						deltaText = "";
					}
					state.reasoningDetailsSoFar = detailsText;
					if (deltaText.length > 0) {
						addReasoningDelta(deltaText);
					}
				}
			}

			if (reasoningDeltas.length > 0) {
				const reasoningDelta = reasoningDeltas.join("");
				choice.delta ??= {};
				choice.delta.reasoning_content = reasoningDelta;
				state.reasoningChunks.push(reasoningDelta);
			}

			if (isFinal) {
				choice.message ??= {};

				const sourceText = typeof choice.message.content === "string"
					? choice.message.content
					: state.contentChunks.join("");
				const parsed = parseMinimaxInterleavedText(sourceText);
				if (parsed.main || typeof choice.message.content === "string") {
					choice.message.content = parsed.main;
				}

				const reasoning = state.reasoningChunks.length
					? state.reasoningChunks.join("")
					: (typeof choice.message.reasoning_content === "string" && choice.message.reasoning_content.length > 0
						? choice.message.reasoning_content
						: (() => {
							const detailsText = extractReasoningDetailsText(choice.message.reasoning_details).join("");
							return detailsText.length > 0 ? detailsText : parsed.reasoning.join("");
						})());
				if (reasoning) {
					choice.message.reasoning_content ??= reasoning;
					if (!choice.message.reasoning_details) {
						choice.message.reasoning_details = [{
							id: `${requestId}-reasoning-${idx}-1`,
							index: 0,
							type: "text",
							text: reasoning,
						}];
					}
				}

				const existingToolCalls = Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [];
				if (existingToolCalls.length === 0 && parsed.toolCalls.length > 0) {
					choice.message.tool_calls = parsed.toolCalls.map((toolCall, toolIdx) => ({
						id: `${requestId}-tool-${idx}-${toolIdx + 1}`,
						type: "function",
						index: toolIdx,
						function: {
							name: toolCall.name,
							arguments: toolCall.arguments,
						},
					}));
				}

				if ((!choice.finish_reason || choice.finish_reason === "stop") && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
					choice.finish_reason = "tool_calls";
				}

				if (choice.delta && !Array.isArray(choice.delta.tool_calls) && Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0) {
					choice.delta.tool_calls = choice.message.tool_calls.map((toolCall: any, toolIdx: number) => ({
						index: toolIdx,
						id: toolCall.id,
						type: "function",
						function: {
							name: toolCall.function?.name ?? "",
							arguments: toolCall.function?.arguments ?? "{}",
						},
					}));
				}
			}
		}
	},

	normalizeResponse: ({ response }) => {
		// Chat Completions shape
		if (Array.isArray(response?.choices)) {
			for (const choice of response.choices) {
				const message = choice?.message;
				if (!message) continue;
				const parsed = parseMinimaxInterleavedText(extractMessageText(message));
				const reasoningFromDetails = extractReasoningDetailsText(message.reasoning_details);
				if (parsed.main || typeof message.content === "string") {
					setMessageText(message, parsed.main);
				}
				if (!message.reasoning_content) {
					const reasoningText = reasoningFromDetails.length > 0
						? reasoningFromDetails.join("")
						: parsed.reasoning.join("");
					if (reasoningText.length > 0) {
						message.reasoning_content = reasoningText;
					}
				}
				if ((!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) && parsed.toolCalls.length > 0) {
					message.tool_calls = parsed.toolCalls.map((toolCall, idx) => ({
						id: `call_minimax_${idx + 1}`,
						type: "function",
						function: {
							name: toolCall.name,
							arguments: toolCall.arguments,
						},
					}));
				}
				if ((!choice.finish_reason || choice.finish_reason === "stop") && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
					choice.finish_reason = "tool_calls";
				}
			}
		}

		// Responses shape
		const outputKey = Array.isArray(response?.output)
			? "output"
			: (Array.isArray(response?.output_items) ? "output_items" : null);
		if (!outputKey) return;
		const originalItems = response[outputKey];
		if (!Array.isArray(originalItems)) return;

		const normalizedItems: any[] = [];
		let toolCounter = 0;
		for (const item of originalItems) {
			if (item?.type !== "message") {
				normalizedItems.push(item);
				continue;
			}

			const text = extractMessageText(item);
			const parsed = parseMinimaxInterleavedText(text);
			const reasoningFromDetails = extractReasoningDetailsText(item.reasoning_details);
			const reasoningText = reasoningFromDetails.length > 0
				? reasoningFromDetails.join("")
				: parsed.reasoning.join("");
			if (reasoningText.length > 0) {
				normalizedItems.push({
					type: "reasoning",
					id: `${item.id ?? "reasoning"}_minimax_reasoning`,
					status: item.status ?? "completed",
					content: [{
						type: "reasoning_text",
						text: reasoningText,
					}],
				});
			}

			if (parsed.main.length > 0 || parsed.toolCalls.length === 0) {
				const nextMessage = { ...item };
				setMessageText(nextMessage, parsed.main);
				normalizedItems.push(nextMessage);
			}

			for (const toolCall of parsed.toolCalls) {
				toolCounter += 1;
				normalizedItems.push({
					type: "function_call",
					call_id: `call_minimax_${toolCounter}`,
					name: toolCall.name,
					arguments: toolCall.arguments,
				});
			}
		}

		response[outputKey] = normalizedItems;
	},
};

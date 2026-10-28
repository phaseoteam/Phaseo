// Purpose: Upstream wire dialects: detection from the captured URL, and native response synthesis.
// Why: The executor under test must receive a realistic provider response (JSON, SSE or error).
// How: One writer per dialect builds non-streaming JSON and SSE event sequences from a semantic variant.

import { USAGE } from "./sentinels";

export type Dialect =
	| "openai-chat"
	| "openai-responses"
	| "openai-legacy"
	| "anthropic-messages"
	| "gemini"
	| "gemini-interactions"
	| "unknown";

export function detectDialect(url: string): Dialect {
	const lower = url.toLowerCase();
	if (/\/interactions(\?|$)/.test(lower)) return "gemini-interactions";
	if (/:(stream)?generatecontent/.test(lower)) return "gemini";
	if (/:(stream)?rawpredict/.test(lower) || /\/messages(\?|$)/.test(lower)) return "anthropic-messages";
	if (/\/responses(\?|$)/.test(lower)) return "openai-responses";
	if (/\/chat\/completions(\?|$)/.test(lower) || /\/chat(\?|$)/.test(lower)) return "openai-chat";
	if (/\/completions(\?|$)/.test(lower)) return "openai-legacy";
	return "unknown";
}

export type SemanticFinish = "stop" | "length" | "tool_calls" | "content_filter" | "refusal" | "pause_turn" | "stop_sequence";

export type SimToolCall = { id: string; name: string; arguments: Record<string, any> };

export type ResponseVariant = {
	id: string;
	text?: string;
	reasoning?: { text: string; signature?: string; encrypted?: string; redacted?: string };
	toolCalls?: SimToolCall[];
	finish: SemanticFinish;
	annotations?: boolean;
	refusal?: string;
	logprobs?: boolean;
	usage: "basic" | "max";
	/** Extra provider-specific usage leaves (dotted paths) to set, for documented fields beyond the dialect default. */
	extraUsage?: Record<string, number>;
	/** OpenAI-dialect usage fields the provider documents. */
	usageProfile?: UsageProfile;
	error?: { status: number; kind: "bad_request" | "rate_limit" | "overloaded" | "server" | "context_length" | "auth" | "mid_stream" };
};

export const MODEL_ECHO = "sim-upstream-model";
const CREATED = 1_760_000_000;

// ---------------------------------------------------------------------------
// Usage objects. "max" sets every field the dialect documents, each to a distinct sentinel.
// ---------------------------------------------------------------------------

/**
 * Which OpenAI-dialect usage fields a provider documents. Only documented fields are sent, so a
 * missing meter in the result is the gateway's doing, not an artefact of the fixture.
 */
export type UsageProfile = {
	/** prompt_tokens_details.cached_tokens / input_tokens_details.cached_tokens */
	nestedCached?: boolean;
	/** usage.cached_tokens at the top level (Moonshot, StepFun). */
	topLevelCached?: boolean;
	/** usage.prompt_cache_hit_tokens / prompt_cache_miss_tokens (DeepSeek). */
	deepseekCache?: boolean;
	/** prompt_tokens_details.cache_write_tokens, counted inside prompt_tokens (OpenAI GPT-5.6+, Kimi K3, Alibaba). */
	cacheWrite?: boolean;
	/** completion_tokens_details.reasoning_tokens / output_tokens_details.reasoning_tokens */
	reasoning?: boolean;
	audio?: boolean;
	image?: boolean;
	prediction?: boolean;
};

export const COMMON_USAGE: UsageProfile = { nestedCached: true, reasoning: true };
export const OPENAI_USAGE: UsageProfile = { nestedCached: true, cacheWrite: true, reasoning: true, audio: true, image: true, prediction: true };

export function openAIChatUsage(level: ResponseVariant["usage"], profile: UsageProfile = COMMON_USAGE) {
	const base: Record<string, any> = { prompt_tokens: USAGE.input, completion_tokens: USAGE.output, total_tokens: USAGE.input + USAGE.output };
	if (level === "basic") return base;
	const promptDetails: Record<string, number> = {};
	if (profile.nestedCached) promptDetails.cached_tokens = USAGE.cachedRead;
	if (profile.cacheWrite) promptDetails.cache_write_tokens = USAGE.cacheWrite;
	if (profile.audio) promptDetails.audio_tokens = USAGE.inputAudio;
	if (profile.image) promptDetails.image_tokens = USAGE.inputImage;
	if (Object.keys(promptDetails).length) base.prompt_tokens_details = promptDetails;
	const completionDetails: Record<string, number> = {};
	if (profile.reasoning) completionDetails.reasoning_tokens = USAGE.reasoning;
	if (profile.audio) completionDetails.audio_tokens = USAGE.outputAudio;
	if (profile.prediction) {
		completionDetails.accepted_prediction_tokens = USAGE.acceptedPrediction;
		completionDetails.rejected_prediction_tokens = USAGE.rejectedPrediction;
	}
	if (Object.keys(completionDetails).length) base.completion_tokens_details = completionDetails;
	if (profile.topLevelCached) base.cached_tokens = USAGE.cachedRead;
	if (profile.deepseekCache) {
		base.prompt_cache_hit_tokens = USAGE.cachedRead;
		base.prompt_cache_miss_tokens = USAGE.input - USAGE.cachedRead;
	}
	return base;
}

export function openAIResponsesUsage(level: ResponseVariant["usage"], profile: UsageProfile = COMMON_USAGE) {
	const base: Record<string, any> = { input_tokens: USAGE.input, output_tokens: USAGE.output, total_tokens: USAGE.input + USAGE.output };
	if (level === "basic") return base;
	const inputDetails: Record<string, number> = {};
	if (profile.nestedCached || profile.topLevelCached || profile.deepseekCache) inputDetails.cached_tokens = USAGE.cachedRead;
	if (profile.cacheWrite) inputDetails.cache_write_tokens = USAGE.cacheWrite;
	if (Object.keys(inputDetails).length) base.input_tokens_details = inputDetails;
	if (profile.reasoning) base.output_tokens_details = { reasoning_tokens: USAGE.reasoning };
	return base;
}

/** True when a profile reports any cached-read field. */
export function profileReportsCache(profile: UsageProfile): boolean {
	return Boolean(profile.nestedCached || profile.topLevelCached || profile.deepseekCache);
}

export function anthropicUsage(level: ResponseVariant["usage"]) {
	if (level === "basic") return { input_tokens: USAGE.input, output_tokens: USAGE.output };
	return {
		input_tokens: USAGE.input,
		cache_creation_input_tokens: USAGE.cacheWrite5m + USAGE.cacheWrite1h,
		cache_read_input_tokens: USAGE.cachedRead,
		cache_creation: { ephemeral_5m_input_tokens: USAGE.cacheWrite5m, ephemeral_1h_input_tokens: USAGE.cacheWrite1h },
		output_tokens: USAGE.output,
		server_tool_use: { web_search_requests: USAGE.webSearch },
		service_tier: "standard",
	};
}

export function geminiUsage(level: ResponseVariant["usage"]) {
	const outputText = USAGE.output - USAGE.reasoning;
	if (level === "basic") return { promptTokenCount: USAGE.input, candidatesTokenCount: USAGE.output, totalTokenCount: USAGE.input + USAGE.output };
	return {
		promptTokenCount: USAGE.input,
		cachedContentTokenCount: USAGE.cachedRead,
		candidatesTokenCount: outputText,
		thoughtsTokenCount: USAGE.reasoning,
		toolUsePromptTokenCount: USAGE.toolUsePrompt,
		totalTokenCount: USAGE.input + USAGE.output + USAGE.toolUsePrompt,
		promptTokensDetails: [
			{ modality: "TEXT", tokenCount: USAGE.input - USAGE.inputImage - USAGE.inputAudio },
			{ modality: "IMAGE", tokenCount: USAGE.inputImage },
			{ modality: "AUDIO", tokenCount: USAGE.inputAudio },
		],
		cacheTokensDetails: [{ modality: "TEXT", tokenCount: USAGE.cachedRead }],
		candidatesTokensDetails: [{ modality: "TEXT", tokenCount: outputText }],
	};
}

export function interactionsUsage(level: ResponseVariant["usage"]) {
	if (level === "basic") return { total_input_tokens: USAGE.input, total_output_tokens: USAGE.output, total_tokens: USAGE.input + USAGE.output };
	return {
		total_input_tokens: USAGE.input,
		total_cached_tokens: USAGE.cachedRead,
		total_output_tokens: USAGE.output - USAGE.reasoning,
		total_thought_tokens: USAGE.reasoning,
		total_tool_use_tokens: USAGE.toolUsePrompt,
		total_tokens: USAGE.input + USAGE.output,
		input_tokens_by_modality: [{ modality: "text", tokens: USAGE.input - USAGE.inputImage }, { modality: "image", tokens: USAGE.inputImage }],
		cached_tokens_by_modality: [{ modality: "text", tokens: USAGE.cachedRead }],
	};
}

function setPath(target: Record<string, any>, dotted: string, value: unknown) {
	const parts = dotted.split(".");
	let node = target;
	for (const part of parts.slice(0, -1)) {
		if (!node[part] || typeof node[part] !== "object") node[part] = {};
		node = node[part];
	}
	node[parts[parts.length - 1]] = value;
}

function withExtra(usage: Record<string, any>, extra?: Record<string, number>) {
	if (!extra) return usage;
	const copy = JSON.parse(JSON.stringify(usage));
	for (const [dotted, value] of Object.entries(extra)) setPath(copy, dotted, value);
	return copy;
}

// ---------------------------------------------------------------------------
// Finish reason vocabularies per dialect.
// ---------------------------------------------------------------------------

const OPENAI_FINISH: Record<SemanticFinish, string> = {
	stop: "stop", length: "length", tool_calls: "tool_calls", content_filter: "content_filter", refusal: "stop", pause_turn: "stop", stop_sequence: "stop",
};
const ANTHROPIC_STOP: Record<SemanticFinish, string> = {
	stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", content_filter: "refusal", refusal: "refusal", pause_turn: "pause_turn", stop_sequence: "stop_sequence",
};
const GEMINI_FINISH: Record<SemanticFinish, string> = {
	stop: "STOP", length: "MAX_TOKENS", tool_calls: "STOP", content_filter: "SAFETY", refusal: "PROHIBITED_CONTENT", pause_turn: "STOP", stop_sequence: "STOP",
};
const RESPONSES_STATUS: Record<SemanticFinish, { status: string; reason?: string }> = {
	stop: { status: "completed" }, length: { status: "incomplete", reason: "max_output_tokens" }, tool_calls: { status: "completed" },
	content_filter: { status: "incomplete", reason: "content_filter" }, refusal: { status: "completed" }, pause_turn: { status: "completed" }, stop_sequence: { status: "completed" },
};

export function nativeFinishValue(dialect: Dialect, finish: SemanticFinish): string {
	switch (dialect) {
		case "anthropic-messages": return ANTHROPIC_STOP[finish];
		case "gemini": return GEMINI_FINISH[finish];
		case "openai-responses":
		case "gemini-interactions": {
			const status = RESPONSES_STATUS[finish];
			return status.reason ? `${status.status}:${status.reason}` : status.status;
		}
		default: return OPENAI_FINISH[finish];
	}
}

// ---------------------------------------------------------------------------
// SSE helpers.
// ---------------------------------------------------------------------------

function sse(frames: Array<{ event?: string; data: unknown } | "[DONE]">): string {
	return frames.map((frame) => {
		if (frame === "[DONE]") return "data: [DONE]\n\n";
		const prefix = frame.event ? `event: ${frame.event}\n` : "";
		return `${prefix}data: ${typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data)}\n\n`;
	}).join("");
}

function sseResponse(body: string, headers: Record<string, string> = {}): Response {
	const bytes = new TextEncoder().encode(body);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			// Split into small chunks so parsers see frame boundaries mid-chunk.
			for (let offset = 0; offset < bytes.length; offset += 97) controller.enqueue(bytes.slice(offset, offset + 97));
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "sim-upstream-req-0001", ...headers } });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "sim-upstream-req-0001", ...headers } });
}

/** Splits at a space or comma past the middle so no sentinel token is ever cut in two. */
function splitText(text: string): string[] {
	const middle = Math.ceil(text.length / 2);
	let cut = text.indexOf(" ", middle);
	if (cut < 0) cut = text.indexOf(",", middle);
	if (cut <= 0) return [text];
	return [text.slice(0, cut), text.slice(cut)].filter(Boolean);
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions.
// ---------------------------------------------------------------------------

function openAIChatJson(variant: ResponseVariant) {
	const message: Record<string, any> = { role: "assistant", content: variant.text ?? null };
	if (variant.reasoning) message.reasoning_content = variant.reasoning.text;
	if (variant.refusal) message.refusal = variant.refusal;
	if (variant.toolCalls?.length) {
		message.tool_calls = variant.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }));
	}
	if (variant.annotations) {
		message.annotations = [{ type: "url_citation", url_citation: { url: "https://sim.example/cite-0001", title: "SIM-CITATION-TITLE-0001", start_index: 0, end_index: 4 } }];
	}
	return {
		id: "chatcmpl-SIM-UPSTREAM-0001",
		object: "chat.completion",
		created: CREATED,
		model: MODEL_ECHO,
		system_fingerprint: "fp_SIM_0001",
		service_tier: "default",
		choices: [{
			index: 0,
			message,
			logprobs: variant.logprobs ? { content: [{ token: "SIM", logprob: -0.25, bytes: [83, 73, 77], top_logprobs: [{ token: "SIM", logprob: -0.25, bytes: [83, 73, 77] }] }] } : null,
			finish_reason: OPENAI_FINISH[variant.finish],
		}],
		usage: withExtra(openAIChatUsage(variant.usage, variant.usageProfile), variant.extraUsage),
	};
}

function openAIChatStream(variant: ResponseVariant) {
	const json = openAIChatJson(variant);
	const base = { id: json.id, object: "chat.completion.chunk", created: CREATED, model: MODEL_ECHO, system_fingerprint: "fp_SIM_0001", service_tier: "default" };
	const frames: Array<{ data: unknown } | "[DONE]"> = [];
	frames.push({ data: { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] } });
	if (variant.reasoning) {
		for (const piece of splitText(variant.reasoning.text)) frames.push({ data: { ...base, choices: [{ index: 0, delta: { reasoning_content: piece }, finish_reason: null }] } });
	}
	if (variant.text) {
		for (const piece of splitText(variant.text)) {
			frames.push({ data: { ...base, choices: [{ index: 0, delta: { content: piece }, logprobs: json.choices[0].logprobs, finish_reason: null }] } });
		}
	}
	if (variant.refusal) frames.push({ data: { ...base, choices: [{ index: 0, delta: { refusal: variant.refusal }, finish_reason: null }] } });
	if (variant.annotations) frames.push({ data: { ...base, choices: [{ index: 0, delta: { annotations: json.choices[0].message.annotations }, finish_reason: null }] } });
	(variant.toolCalls ?? []).forEach((call, index) => {
		const args = JSON.stringify(call.arguments);
		const [first, second] = splitText(args);
		frames.push({ data: { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index, id: call.id, type: "function", function: { name: call.name, arguments: "" } }] }, finish_reason: null }] } });
		frames.push({ data: { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: first } }] }, finish_reason: null }] } });
		if (second) frames.push({ data: { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: second } }] }, finish_reason: null }] } });
	});
	frames.push({ data: { ...base, choices: [{ index: 0, delta: {}, finish_reason: OPENAI_FINISH[variant.finish] }] } });
	frames.push({ data: { ...base, choices: [], usage: json.usage } });
	frames.push("[DONE]");
	return sse(frames);
}

// ---------------------------------------------------------------------------
// OpenAI Responses.
// ---------------------------------------------------------------------------

function responsesOutput(variant: ResponseVariant) {
	const output: any[] = [];
	if (variant.reasoning) {
		output.push({
			type: "reasoning",
			id: "rs_SIM_UPSTREAM_0001",
			summary: [{ type: "summary_text", text: variant.reasoning.text }],
			...(variant.reasoning.encrypted ? { encrypted_content: variant.reasoning.encrypted } : {}),
		});
	}
	if (variant.text || variant.refusal) {
		const content: any[] = [];
		if (variant.text) {
			content.push({
				type: "output_text",
				text: variant.text,
				annotations: variant.annotations ? [{ type: "url_citation", url: "https://sim.example/cite-0001", title: "SIM-CITATION-TITLE-0001", start_index: 0, end_index: 4 }] : [],
				...(variant.logprobs ? { logprobs: [{ token: "SIM", logprob: -0.25, bytes: [83, 73, 77], top_logprobs: [] }] } : {}),
			});
		}
		if (variant.refusal) content.push({ type: "refusal", refusal: variant.refusal });
		output.push({ type: "message", id: "msg_SIM_UPSTREAM_0001", status: "completed", role: "assistant", content });
	}
	for (const call of variant.toolCalls ?? []) {
		output.push({ type: "function_call", id: `fc_${call.id}`, call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments), status: "completed" });
	}
	return output;
}

function responsesJson(variant: ResponseVariant) {
	const status = RESPONSES_STATUS[variant.finish];
	return {
		id: "resp_SIM_UPSTREAM_0001",
		object: "response",
		created_at: CREATED,
		status: status.status,
		incomplete_details: status.reason ? { reason: status.reason } : null,
		model: MODEL_ECHO,
		output: responsesOutput(variant),
		service_tier: "default",
		usage: withExtra(openAIResponsesUsage(variant.usage, variant.usageProfile), variant.extraUsage),
	};
}

function responsesStream(variant: ResponseVariant) {
	const full = responsesJson(variant);
	const frames: Array<{ event?: string; data: unknown } | "[DONE]"> = [];
	let seq = 0;
	const push = (type: string, data: Record<string, unknown>) => frames.push({ event: type, data: { type, sequence_number: seq++, ...data } });
	push("response.created", { response: { ...full, status: "in_progress", output: [], usage: null } });
	push("response.in_progress", { response: { ...full, status: "in_progress", output: [], usage: null } });
	full.output.forEach((item: any, outputIndex: number) => {
		if (item.type === "reasoning") {
			push("response.output_item.added", { output_index: outputIndex, item: { ...item, summary: [] } });
			push("response.reasoning_summary_part.added", { item_id: item.id, output_index: outputIndex, summary_index: 0, part: { type: "summary_text", text: "" } });
			for (const piece of splitText(item.summary[0].text)) push("response.reasoning_summary_text.delta", { item_id: item.id, output_index: outputIndex, summary_index: 0, delta: piece });
			push("response.reasoning_summary_text.done", { item_id: item.id, output_index: outputIndex, summary_index: 0, text: item.summary[0].text });
			push("response.output_item.done", { output_index: outputIndex, item });
		} else if (item.type === "message") {
			push("response.output_item.added", { output_index: outputIndex, item: { ...item, status: "in_progress", content: [] } });
			item.content.forEach((part: any, contentIndex: number) => {
				push("response.content_part.added", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, part: { ...part, text: part.text === undefined ? undefined : "", annotations: [] } });
				if (part.type === "output_text") {
					for (const piece of splitText(part.text)) push("response.output_text.delta", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, delta: piece, logprobs: [] });
					(part.annotations ?? []).forEach((annotation: any, annotationIndex: number) =>
						push("response.output_text.annotation.added", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, annotation_index: annotationIndex, annotation }));
					push("response.output_text.done", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, text: part.text, logprobs: [] });
				} else if (part.type === "refusal") {
					push("response.refusal.delta", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, delta: part.refusal });
					push("response.refusal.done", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, refusal: part.refusal });
				}
				push("response.content_part.done", { item_id: item.id, output_index: outputIndex, content_index: contentIndex, part });
			});
			push("response.output_item.done", { output_index: outputIndex, item });
		} else if (item.type === "function_call") {
			push("response.output_item.added", { output_index: outputIndex, item: { ...item, arguments: "", status: "in_progress" } });
			for (const piece of splitText(item.arguments)) push("response.function_call_arguments.delta", { item_id: item.id, output_index: outputIndex, delta: piece });
			push("response.function_call_arguments.done", { item_id: item.id, output_index: outputIndex, arguments: item.arguments });
			push("response.output_item.done", { output_index: outputIndex, item });
		}
	});
	const terminal = full.status === "incomplete" ? "response.incomplete" : "response.completed";
	push(terminal, { response: full });
	return sse(frames);
}

// ---------------------------------------------------------------------------
// Anthropic Messages.
// ---------------------------------------------------------------------------

function anthropicContent(variant: ResponseVariant) {
	const content: any[] = [];
	if (variant.reasoning) {
		content.push({ type: "thinking", thinking: variant.reasoning.text, signature: variant.reasoning.signature ?? "SIM-UPSTREAM-SIGNATURE-0001" });
		if (variant.reasoning.redacted) content.push({ type: "redacted_thinking", data: variant.reasoning.redacted });
	}
	if (variant.text) {
		content.push({
			type: "text",
			text: variant.text,
			...(variant.annotations ? { citations: [{ type: "web_search_result_location", url: "https://sim.example/cite-0001", title: "SIM-CITATION-TITLE-0001", cited_text: "SIM-CITED-TEXT-0001", encrypted_index: "SIM-ENC-INDEX" }] } : {}),
		});
	}
	for (const call of variant.toolCalls ?? []) content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
	return content;
}

function anthropicJson(variant: ResponseVariant) {
	return {
		id: "msg_SIM_UPSTREAM_0001",
		type: "message",
		role: "assistant",
		model: MODEL_ECHO,
		content: anthropicContent(variant),
		stop_reason: ANTHROPIC_STOP[variant.finish],
		stop_sequence: variant.finish === "stop_sequence" ? "SIM-STOP-1" : null,
		usage: withExtra(anthropicUsage(variant.usage), variant.extraUsage),
	};
}

function anthropicStream(variant: ResponseVariant) {
	const full = anthropicJson(variant);
	const usage = full.usage as Record<string, any>;
	const frames: Array<{ event?: string; data: unknown }> = [];
	const push = (type: string, data: Record<string, unknown>) => frames.push({ event: type, data: { type, ...data } });
	// message_start carries the input side of usage; message_delta carries the final counts.
	push("message_start", { message: { ...full, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
	full.content.forEach((block: any, index: number) => {
		if (block.type === "thinking") {
			push("content_block_start", { index, content_block: { type: "thinking", thinking: "", signature: "" } });
			for (const piece of splitText(block.thinking)) push("content_block_delta", { index, delta: { type: "thinking_delta", thinking: piece } });
			push("content_block_delta", { index, delta: { type: "signature_delta", signature: block.signature } });
			push("content_block_stop", { index });
		} else if (block.type === "redacted_thinking") {
			push("content_block_start", { index, content_block: block });
			push("content_block_stop", { index });
		} else if (block.type === "text") {
			push("content_block_start", { index, content_block: { type: "text", text: "" } });
			for (const piece of splitText(block.text)) push("content_block_delta", { index, delta: { type: "text_delta", text: piece } });
			for (const citation of block.citations ?? []) push("content_block_delta", { index, delta: { type: "citations_delta", citation } });
			push("content_block_stop", { index });
		} else if (block.type === "tool_use") {
			push("content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
			for (const piece of splitText(JSON.stringify(block.input))) push("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: piece } });
			push("content_block_stop", { index });
		}
	});
	push("message_delta", {
		delta: { stop_reason: full.stop_reason, stop_sequence: full.stop_sequence },
		usage: {
			output_tokens: usage.output_tokens,
			...(variant.usage === "max" ? {
				input_tokens: usage.input_tokens,
				cache_creation_input_tokens: usage.cache_creation_input_tokens,
				cache_read_input_tokens: usage.cache_read_input_tokens,
				server_tool_use: usage.server_tool_use,
			} : {}),
		},
	});
	push("message_stop", {});
	return sse(frames);
}

// ---------------------------------------------------------------------------
// Gemini generateContent and Interactions.
// ---------------------------------------------------------------------------

function geminiParts(variant: ResponseVariant) {
	const parts: any[] = [];
	if (variant.reasoning) parts.push({ text: variant.reasoning.text, thought: true, thoughtSignature: variant.reasoning.signature ?? "SIM-UPSTREAM-THOUGHT-SIGNATURE-0001" });
	if (variant.text) parts.push({ text: variant.text });
	for (const call of variant.toolCalls ?? []) parts.push({ functionCall: { id: call.id, name: call.name, args: call.arguments }, thoughtSignature: "SIM-UPSTREAM-FC-SIGNATURE-0001" });
	return parts;
}

function geminiJson(variant: ResponseVariant) {
	return {
		candidates: [{
			index: 0,
			content: { role: "model", parts: geminiParts(variant) },
			finishReason: GEMINI_FINISH[variant.finish],
			...(variant.annotations ? {
				groundingMetadata: { groundingChunks: [{ web: { uri: "https://sim.example/cite-0001", title: "SIM-CITATION-TITLE-0001" } }], webSearchQueries: ["SIM-SEARCH-QUERY"] },
				citationMetadata: { citations: [{ startIndex: 0, endIndex: 4, uri: "https://sim.example/cite-0001" }] },
			} : {}),
		}],
		usageMetadata: withExtra(geminiUsage(variant.usage), variant.extraUsage),
		modelVersion: MODEL_ECHO,
		responseId: "SIM-UPSTREAM-RESPONSE-ID-0001",
	};
}

function geminiStream(variant: ResponseVariant) {
	const full = geminiJson(variant);
	const parts = full.candidates[0].content.parts;
	const frames: Array<{ data: unknown }> = [];
	parts.forEach((part: any, index: number) => {
		const last = index === parts.length - 1;
		frames.push({
			data: {
				candidates: [{ index: 0, content: { role: "model", parts: [part] }, ...(last ? { finishReason: full.candidates[0].finishReason } : {}), ...(last && variant.annotations ? { groundingMetadata: (full.candidates[0] as any).groundingMetadata } : {}) }],
				...(last ? { usageMetadata: full.usageMetadata } : { usageMetadata: { promptTokenCount: USAGE.input } }),
				modelVersion: MODEL_ECHO,
				responseId: full.responseId,
			},
		});
	});
	if (!parts.length) frames.push({ data: { candidates: [{ index: 0, content: { role: "model", parts: [] }, finishReason: full.candidates[0].finishReason }], usageMetadata: full.usageMetadata, modelVersion: MODEL_ECHO } });
	return sse(frames);
}

function interactionsJson(variant: ResponseVariant) {
	const steps: any[] = [];
	if (variant.reasoning) steps.push({ type: "thought", summary: [{ type: "text", text: variant.reasoning.text }], signature: variant.reasoning.signature ?? "SIM-UPSTREAM-THOUGHT-SIGNATURE-0001" });
	if (variant.text) steps.push({ type: "model_output", content: [{ type: "text", text: variant.text }] });
	for (const call of variant.toolCalls ?? []) steps.push({ type: "function_call", id: call.id, name: call.name, arguments: call.arguments });
	const status = RESPONSES_STATUS[variant.finish];
	return { id: "interactions/SIM-UPSTREAM-0001", object: "interaction", status: status.status, steps, usage: withExtra(interactionsUsage(variant.usage), variant.extraUsage) };
}

// ---------------------------------------------------------------------------
// Errors.
// ---------------------------------------------------------------------------

function errorResponse(dialect: Dialect, error: NonNullable<ResponseVariant["error"]>): Response {
	const retryHeaders: Record<string, string> = error.kind === "rate_limit" ? { "retry-after": "7", "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "7s" } : {};
	const message = {
		bad_request: "SIM-ERROR-BAD-REQUEST: Unrecognized request argument supplied: sim_param",
		rate_limit: "SIM-ERROR-RATE-LIMIT: Rate limit reached",
		overloaded: "SIM-ERROR-OVERLOADED: Overloaded",
		server: "SIM-ERROR-SERVER: Internal error",
		context_length: "SIM-ERROR-CONTEXT: This model's maximum context length is 8192 tokens.",
		auth: "SIM-ERROR-AUTH: Invalid API key",
		mid_stream: "SIM-ERROR-MID-STREAM",
	}[error.kind];
	if (dialect === "anthropic-messages") {
		const type = { bad_request: "invalid_request_error", rate_limit: "rate_limit_error", overloaded: "overloaded_error", server: "api_error", context_length: "invalid_request_error", auth: "authentication_error", mid_stream: "api_error" }[error.kind];
		return jsonResponse({ type: "error", error: { type, message }, request_id: "req_SIM_UPSTREAM_ERR" }, error.status, retryHeaders);
	}
	if (dialect === "gemini" || dialect === "gemini-interactions") {
		const status = { bad_request: "INVALID_ARGUMENT", rate_limit: "RESOURCE_EXHAUSTED", overloaded: "UNAVAILABLE", server: "INTERNAL", context_length: "INVALID_ARGUMENT", auth: "UNAUTHENTICATED", mid_stream: "INTERNAL" }[error.kind];
		return jsonResponse({ error: { code: error.status, message, status } }, error.status, retryHeaders);
	}
	const code = { bad_request: null, rate_limit: "rate_limit_exceeded", overloaded: "server_overloaded", server: null, context_length: "context_length_exceeded", auth: "invalid_api_key", mid_stream: null }[error.kind];
	const type = { bad_request: "invalid_request_error", rate_limit: "requests", overloaded: "server_error", server: "server_error", context_length: "invalid_request_error", auth: "invalid_request_error", mid_stream: "server_error" }[error.kind];
	return jsonResponse({ error: { message, type, param: error.kind === "bad_request" ? "sim_param" : null, code } }, error.status, retryHeaders);
}

function midStreamError(dialect: Dialect, variant: ResponseVariant): Response {
	const partial: ResponseVariant = { ...variant, text: "SIM-PARTIAL-TEXT", toolCalls: undefined, reasoning: undefined };
	if (dialect === "anthropic-messages") {
		const started = anthropicStream(partial).split("event: message_delta")[0];
		return sseResponse(`${started}event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "SIM-ERROR-MID-STREAM" } })}\n\n`);
	}
	if (dialect === "openai-responses") {
		const started = responsesStream(partial).split("event: response.completed")[0];
		return sseResponse(`${started}event: error\ndata: ${JSON.stringify({ type: "error", code: "server_error", message: "SIM-ERROR-MID-STREAM", sequence_number: 99 })}\n\n`);
	}
	if (dialect === "gemini") {
		return sseResponse(`data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "SIM-PARTIAL-TEXT" }] } }] })}\n\ndata: ${JSON.stringify({ error: { code: 500, message: "SIM-ERROR-MID-STREAM", status: "INTERNAL" } })}\n\n`);
	}
	return sseResponse(`data: ${JSON.stringify({ id: "chatcmpl-SIM", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "SIM-PARTIAL-TEXT" } }] })}\n\ndata: ${JSON.stringify({ error: { message: "SIM-ERROR-MID-STREAM", type: "server_error" } })}\n\n`);
}

/** Builds the provider response for a captured request in the given dialect. */
export function synthesiseResponse(dialect: Dialect, variant: ResponseVariant, wantsStream: boolean): Response {
	if (variant.error) {
		if (variant.error.kind === "mid_stream") return midStreamError(dialect, variant);
		return errorResponse(dialect, variant.error);
	}
	switch (dialect) {
		case "anthropic-messages":
			return wantsStream ? sseResponse(anthropicStream(variant)) : jsonResponse(anthropicJson(variant));
		case "openai-responses":
			return wantsStream ? sseResponse(responsesStream(variant)) : jsonResponse(responsesJson(variant));
		case "gemini":
			return wantsStream ? sseResponse(geminiStream(variant)) : jsonResponse(geminiJson(variant));
		case "gemini-interactions":
			return jsonResponse(interactionsJson(variant));
		case "openai-legacy":
			return jsonResponse({ id: "cmpl-SIM-UPSTREAM-0001", object: "text_completion", created: CREATED, model: MODEL_ECHO, choices: [{ index: 0, text: variant.text ?? "", finish_reason: OPENAI_FINISH[variant.finish] }], usage: openAIChatUsage(variant.usage, variant.usageProfile) });
		case "openai-chat":
		default:
			return wantsStream ? sseResponse(openAIChatStream(variant)) : jsonResponse(openAIChatJson(variant));
	}
}

/** The native JSON body (non-streaming form) for a variant, used to validate it against provider response schemas. */
export function nativeJson(dialect: Dialect, variant: ResponseVariant): any {
	switch (dialect) {
		case "anthropic-messages": return anthropicJson(variant);
		case "openai-responses": return responsesJson(variant);
		case "gemini": return geminiJson(variant);
		case "gemini-interactions": return interactionsJson(variant);
		default: return openAIChatJson(variant);
	}
}

export function wantsStreamingResponse(dialect: Dialect, url: string, body: any): boolean {
	if (dialect === "gemini") return /streamGenerateContent/i.test(url);
	if (dialect === "gemini-interactions") return false;
	if (dialect === "anthropic-messages" && /streamRawPredict/i.test(url)) return true;
	return body?.stream === true;
}

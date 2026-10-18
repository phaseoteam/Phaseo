// Purpose: Transform Anthropic streaming SSE to Responses API streaming format
// Why: Responses API expects specific event names and structure
// How: Parse Anthropic events and emit normalized Responses API events

import { toResponsesAnnotations } from "@protocols/shared/citations";
import { SseParser } from "@core/sse-parser";
import { ANTHROPIC_REASONING_FORMAT, sealReasoningState } from "@core/reasoning-state";

/**
 * Transform Anthropic Messages API streaming to OpenAI Responses API streaming format
 *
 * Anthropic events:
 * - message_start: Contains message metadata
 * - content_block_start: Start of content block (text, thinking, tool_use)
 * - content_block_delta: Incremental content updates
 * - content_block_stop: End of content block
 * - message_delta: Usage and stop reason updates
 * - message_stop: End of message
 *
 * Responses API events:
 * - response.created: Initial response metadata
 * - response.output_text.delta: Text content deltas
 * - response.reasoning_text.delta: Thinking/reasoning deltas
 * - response.function_call_arguments.delta: Tool call argument deltas
 * - response.completed: Final response with usage
 */
/**
 * Authoritative usage and stop reason observed on an Anthropic Messages stream.
 * Executors read it from their usage finalizer instead of tee()-ing the
 * upstream body into a second, rarely read branch that would buffer the whole
 * response in Worker memory.
 */
export type AnthropicStreamAccounting = {
	observe(payload: any): void;
	snapshot(): { usage: Record<string, unknown>; stopReason: string | null };
};

export function createAnthropicStreamAccounting(): AnthropicStreamAccounting {
	let usage: Record<string, unknown> = {};
	let stopReason: string | null = null;
	return {
		observe(event: any) {
			const eventUsage = event?.message?.usage ?? event?.usage;
			if (eventUsage && typeof eventUsage === "object") usage = { ...usage, ...eventUsage };
			if (typeof event?.delta?.stop_reason === "string") stopReason = event.delta.stop_reason;
			if (typeof event?.message?.stop_reason === "string") stopReason = event.message.stop_reason;
		},
		snapshot: () => ({ usage: { ...usage }, stopReason }),
	};
}

// Preserve signed thinking blocks on the native Messages surface while observing
// usage on the same stream. No extra reader or buffered accounting branch.
export function createAnthropicPassthroughStreamTransformer(accounting: AnthropicStreamAccounting): TransformStream<Uint8Array, Uint8Array> {
	const parser = new SseParser();
	const observe = (frames: ReturnType<SseParser["pushBytes"]>) => {
		for (const frame of frames) {
			try { accounting.observe(JSON.parse(frame.data)); } catch { /* Ignore non-JSON keepalives. */ }
		}
	};
	return new TransformStream({
		transform(chunk, controller) { observe(parser.pushBytes(chunk)); controller.enqueue(chunk); },
		flush() { observe(parser.flush()); },
	});
}

/**
 * Anthropic Messages usage semantics for normalizeTextUsageForPricing: `input_tokens`
 * excludes cache reads and cache writes, which are billed on top.
 */
export const ANTHROPIC_CACHE_USAGE_SEMANTICS = {
	cachedReadTokensAreSubsetOfInput: false,
	cachedWriteTokensAreSubsetOfInput: false,
} as const;

function finiteCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

/**
 * Convert Anthropic Messages usage to OpenAI Responses usage.
 *
 * Anthropic's `input_tokens` excludes cache reads and writes. OpenAI counts both inside
 * `input_tokens`, with reads under `input_tokens_details.cached_tokens` and writes under
 * `input_tokens_details.cache_write_tokens`. The 5-minute and 1-hour write split is kept
 * so the after-stage bills each TTL at its own rate.
 */
export function anthropicUsageToResponsesUsage(usage: any): Record<string, unknown> | undefined {
	if (!usage || typeof usage !== "object") return undefined;
	const uncachedInput = finiteCount(usage.input_tokens) ?? 0;
	const output = finiteCount(usage.output_tokens) ?? 0;
	const read = finiteCount(usage.cache_read_input_tokens);
	const write5m = finiteCount(usage.cache_creation?.ephemeral_5m_input_tokens);
	const write1h = finiteCount(usage.cache_creation?.ephemeral_1h_input_tokens);
	const write = finiteCount(usage.cache_creation_input_tokens) ??
		(write5m !== undefined || write1h !== undefined ? (write5m ?? 0) + (write1h ?? 0) : undefined);
	const input = uncachedInput + (read ?? 0) + (write ?? 0);
	const inputDetails: Record<string, number> = {};
	if (read !== undefined) inputDetails.cached_tokens = read;
	if (write !== undefined) inputDetails.cache_write_tokens = write;
	return {
		input_tokens: input,
		output_tokens: output,
		total_tokens: input + output,
		...(Object.keys(inputDetails).length ? { input_tokens_details: inputDetails } : {}),
		...(write5m !== undefined ? { cached_write_text_tokens_5m: write5m } : {}),
		...(write1h !== undefined ? { cached_write_text_tokens_1h: write1h } : {}),
	};
}

export function createAnthropicToResponsesStreamTransformer(
	requestId: string,
	model: string,
	options?: { accounting?: AnthropicStreamAccounting; providerId?: string },
): TransformStream<Uint8Array, Uint8Array> {
	const accounting = options?.accounting;
	const providerId = options?.providerId;
	const parser = new SseParser();
	const encoder = new TextEncoder();

	// Track state for building output items
	let messageId: string | null = null;
	let createdAt: number = Math.floor(Date.now() / 1000);
	let usage: any = null;
	let stopReason: string | null = null;

	// Track content blocks by index
	const contentBlocks: Map<number, {
		type: string;
		id?: string;
		outputIndex: number;
		itemId: string;
		text?: string;
		signature?: string;
		data?: string;
		name?: string;
		input?: string;
		citations?: any[];
	}> = new Map();
	// Claude cites a whole text block, so a URL citation spans the block's text.
	const blockAnnotations = (block: { text?: string; citations?: any[] }) =>
		toResponsesAnnotations(block.citations).map((annotation) =>
			annotation.type === "url_citation"
				? { ...annotation, start_index: 0, end_index: (block.text || "").length }
				: annotation);

	// A reasoning item for a thinking or redacted_thinking block. The signature
	// (or redacted data) is sealed with its origin so the client can send it
	// back and the gateway replays it only to Claude.
	const buildReasoningItem = (block: { type: string; itemId: string; text?: string; signature?: string; data?: string }) => {
		const redacted = block.type === "redacted_thinking";
		const value = redacted ? block.data : block.signature;
		return {
			type: "reasoning",
			id: block.itemId,
			status: "completed",
			summary: [],
			content: redacted ? [] : [{
				type: "output_text",
				text: block.text || "",
				annotations: [],
			}],
			...(value
				? {
					encrypted_content: sealReasoningState({
						format: ANTHROPIC_REASONING_FORMAT,
						kind: redacted ? "redacted" : "signature",
						value,
						model,
						...(providerId ? { provider: providerId } : {}),
					}),
				}
				: {}),
		};
	};

	let outputCounter = 0;
	let createdEmitted = false;

	const emitEvent = (
		controller: TransformStreamDefaultController<Uint8Array>,
		eventName: string,
		payload: any,
	) => {
		controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
	};

	return new TransformStream<Uint8Array, Uint8Array>({
		async transform(chunk, controller) {
			for (const frame of parser.pushBytes(chunk)) {
				const data = frame.data;
				if (!data || data === "[DONE]") continue;

				let payload: any;
				try {
					payload = JSON.parse(data);
				} catch {
					continue;
				}
				accounting?.observe(payload);

				// Handle different Anthropic event types
				if (payload.type === "message_start") {
					const msg = payload.message;
					messageId = msg.id;
					createdAt = Math.floor(Date.now() / 1000);
					usage = msg.usage;

					// Emit response.created
					if (!createdEmitted) {
						emitEvent(controller, "response.created", {
							response: {
								id: requestId,
								created_at: createdAt,
								model: model,
							},
						});
						createdEmitted = true;
					}

				} else if (payload.type === "content_block_start") {
					const index = payload.index;
					const block = payload.content_block;

					// Initialize content block tracking
					const itemId = `item_${requestId}_${index}`;
					const outputIndex = outputCounter++;

					contentBlocks.set(index, {
						type: block.type,
						id: block.id,
						outputIndex,
						itemId,
						text: block.type === "thinking" ? (block.thinking || "") : (block.text || ""),
						signature: block.signature,
						data: typeof block.data === "string" ? block.data : undefined,
						name: block.name || "",
						input: "",
						...(Array.isArray(block.citations) && block.citations.length > 0 ? { citations: [...block.citations] } : {}),
					});

					if (block.type === "thinking" || block.type === "redacted_thinking") {
						emitEvent(controller, "response.output_item.added", {
							output_index: outputIndex,
							item: { type: "reasoning", id: itemId, summary: [], content: [] },
						});
					}

					// For tool_use blocks, emit output_item.added for function_call
					if (block.type === "tool_use") {
						emitEvent(controller, "response.output_item.added", {
							output_index: outputIndex,
							item: {
								type: "function_call",
								id: itemId,
								call_id: block.id,
								name: block.name || "",
								arguments: "",
							},
						});
					}

				} else if (payload.type === "content_block_delta") {
					const index = payload.index;
					const delta = payload.delta;
					const block = contentBlocks.get(index);

					if (!block) {
						console.warn(`[anthropic-stream] content_block_delta for unknown index ${index}`);
						continue;
					}

					if (delta.type === "text_delta") {
						// Regular text content
						const chunk = typeof delta.text === "string" ? delta.text : "";
						block.text = (block.text || "") + chunk;
						emitEvent(controller, "response.output_text.delta", {
							delta: chunk,
							output_index: block.outputIndex,
							item_id: block.itemId,
						});

					} else if (delta.type === "thinking_delta") {
						// Thinking/reasoning content
						const chunk = typeof delta.thinking === "string" ? delta.thinking : "";
						block.text = (block.text || "") + chunk;
						emitEvent(controller, "response.reasoning_text.delta", {
							delta: chunk,
							output_index: block.outputIndex,
							item_id: block.itemId,
						});

					} else if (delta.type === "citations_delta" && delta.citation && typeof delta.citation === "object") {
						block.citations = [...(block.citations ?? []), delta.citation];
						const [annotation] = toResponsesAnnotations([delta.citation]);
						if (annotation) {
							emitEvent(controller, "response.output_text.annotation.added", {
								item_id: block.itemId,
								output_index: block.outputIndex,
								content_index: 0,
								annotation_index: block.citations.length - 1,
								annotation,
							});
						}

					} else if (delta.type === "signature_delta") {
						// Thinking signature (store for final snapshot)
						const sig = typeof delta.signature === "string" ? delta.signature : "";
						block.signature = (block.signature || "") + sig;

					} else if (delta.type === "input_json_delta") {
						// Tool call arguments (partial JSON)
						const chunk = typeof delta.partial_json === "string" ? delta.partial_json : "";
						block.input = (block.input || "") + chunk;
						emitEvent(controller, "response.function_call_arguments.delta", {
							delta: chunk,
							output_index: block.outputIndex,
							item_id: block.itemId,
							call_id: block.id,
						});
					}

				} else if (payload.type === "content_block_stop") {
					const index = payload.index;
					const block = contentBlocks.get(index);
					if (!block) continue;

					if (block.type === "thinking" || block.type === "redacted_thinking") {
						emitEvent(controller, "response.output_item.done", {
							output_index: block.outputIndex,
							item: buildReasoningItem(block),
						});
					} else if (block.type === "tool_use") {
						emitEvent(controller, "response.function_call_arguments.done", {
							item_id: block.itemId,
							call_id: block.id,
							output_index: block.outputIndex,
							name: block.name || "",
							arguments: block.input || "",
						});
						emitEvent(controller, "response.output_item.done", {
							output_index: block.outputIndex,
							item: {
								type: "function_call",
								id: block.itemId,
								call_id: block.id,
								name: block.name || "",
								arguments: block.input || "",
							},
						});
					}

				} else if (payload.type === "message_delta") {
					// Update usage and stop reason
					if (payload.delta?.stop_reason) stopReason = payload.delta.stop_reason;
					if (payload.usage) {
						usage = { ...usage, ...payload.usage };
					}

				} else if (payload.type === "message_stop") {
					// Build final response object
					const outputItems: any[] = [];

					// Convert content blocks to output items
					for (const [index, block] of Array.from(contentBlocks.entries()).sort((a, b) => a[0] - b[0])) {
						if (block.type === "text") {
							outputItems.push({
								type: "message",
								id: block.itemId,
								status: "completed",
								role: "assistant",
								content: [{
									type: "output_text",
									text: block.text || "",
									annotations: blockAnnotations(block),
								}],
							});
						} else if (block.type === "thinking" || block.type === "redacted_thinking") {
							outputItems.push(buildReasoningItem(block));
						} else if (block.type === "tool_use") {
							// Parse accumulated JSON input
							let parsedInput: any = block.input;
							if (typeof block.input === "string") {
								try {
									parsedInput = JSON.parse(block.input);
								} catch {
									parsedInput = block.input;
								}
							}
							outputItems.push({
								type: "function_call",
								id: block.itemId,
								call_id: block.id,
								name: block.name,
								arguments: typeof parsedInput === "string" ? parsedInput : JSON.stringify(parsedInput),
							});
						}
					}

					// Map Anthropic stop_reason to Responses API status
					let status: "completed" | "incomplete" | "failed" = "completed";
					if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") {
						status = "incomplete";
					}

					const responseUsage = anthropicUsageToResponsesUsage(usage);

					// Emit response.completed
					emitEvent(controller, "response.completed", {
						response: {
							id: requestId,
							object: "response",
							created_at: createdAt,
							model: model,
							status,
							...(status === "incomplete"
								? {
									incomplete_details: {
										reason: "max_output_tokens",
									},
								}
								: {}),
							output: outputItems,
							usage: responseUsage,
							nativeResponseId: messageId,
						},
					});
				}
			}
		},

		flush() {
			// A trailing frame without its blank line is not emitted downstream
			// (all complete events have been processed), but it still counts for
			// usage accounting, matching the former tee()-based collector.
			if (!accounting) return;
			for (const frame of parser.flush()) {
				const data = frame.data.trim();
				if (!data || data === "[DONE]") continue;
				try {
					accounting.observe(JSON.parse(data));
				} catch {
					// ignore malformed trailing data
				}
			}
		},
	});
}

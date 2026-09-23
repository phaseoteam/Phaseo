// Purpose: Transform Anthropic streaming SSE to Responses API streaming format
// Why: Responses API expects specific event names and structure
// How: Parse Anthropic events and emit normalized Responses API events

import { readSseEvents, sseReadable, SseProtocolError } from "@/core/sse";
import { classifyStreamProviderError } from "@/core/stream-error";

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
export function createAnthropicToResponsesStreamTransformer(
	requestId: string,
	model: string,
	credentialSource?: "gateway" | "byok",
): ReadableWritablePair<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const input = new TransformStream<Uint8Array, Uint8Array>();
	let admittedChars = 0, sequence = 0;
	let terminal = false;

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
		name?: string;
		input?: string;
	}> = new Map();

	let outputCounter = 0;
	let createdEmitted = false;

	const emitEvent = (
		controller: { enqueue(chunk: Uint8Array): void },
		eventName: string,
		payload: any,
	) => {
		controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify({ ...payload, type: eventName, sequence_number: sequence++ })}\n\n`));
	};

	return { writable: input.writable, readable: sseReadable(async function* (signal) {
			for await (const event of readSseEvents(input.readable, { signal })) {
				const data = event.data;
				admittedChars += data.length;
				// Compatibility snapshots require output accumulation, but it is bounded.
				if (admittedChars > 4 * 1024 * 1024) throw new SseProtocolError("sse_state_too_large");
				const frames: Uint8Array[] = [];
				const controller = { enqueue(chunk: Uint8Array) { frames.push(chunk); } };

				let payload: any;
				try {
					payload = JSON.parse(data);
				} catch {
					throw new SseProtocolError("sse_invalid_json");
				}
				if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SseProtocolError("sse_invalid_json");
				if (payload?.type === "error") throw classifyStreamProviderError(payload, credentialSource);

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
								object: "response", status: "in_progress", output: [],
								created_at: createdAt,
								model: model,
							},
						});
						createdEmitted = true;
					}

				} else if (payload.type === "content_block_start") {
					const index = payload.index;
					const block = payload.content_block;
					if (!Number.isInteger(index) || index < 0 || index >= 128 || contentBlocks.has(index) || !block) {
						throw new SseProtocolError("sse_invalid_tool_delta");
					}

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
						name: block.name || "",
						input: block.input && Object.keys(block.input).length ? JSON.stringify(block.input) : "",
					});

					// For tool_use blocks, emit output_item.added for function_call
					if (block.type === "tool_use") {
						emitEvent(controller, "response.output_item.added", {
							output_index: outputIndex,
							item: {
								type: "function_call",
								id: itemId,
								call_id: block.id,
								name: block.name || "",
								arguments: contentBlocks.get(index)?.input ?? "",
							},
						});
					}

				} else if (payload.type === "content_block_delta") {
					const index = payload.index;
					const delta = payload.delta;
					const block = contentBlocks.get(index);

					if (!block) {
						throw new SseProtocolError("sse_invalid_tool_delta");
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

					if (block.type === "tool_use") {
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
									annotations: [],
								}],
							});
						} else if (block.type === "thinking") {
							outputItems.push({
								type: "reasoning",
								id: block.itemId,
								status: "completed",
								content: [{
									type: "output_text",
									text: block.text || "",
									annotations: [],
								}],
							});
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

					// Build usage object
					const responseUsage = usage ? {
						...usage,
						cached_read_tokens_are_subset_of_input: false,
						input_tokens: usage.input_tokens || 0,
						output_tokens: usage.output_tokens || 0,
						total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
						...(typeof usage.cache_read_input_tokens === "number" ? {
							input_tokens_details: {
								cached_tokens: usage.cache_read_input_tokens,
							},
						} : {}),
					} : undefined;

					// Emit response.completed
					emitEvent(controller, status === "incomplete" ? "response.incomplete" : "response.completed", {
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
					terminal = true;
				}
				for (const frame of frames) yield frame;
				if (terminal) return;
			}
			throw new SseProtocolError("sse_missing_terminal");
		}) };
}

// Purpose: Transform Anthropic streaming SSE to Responses API streaming format
// Why: Responses API expects specific event names and structure
// How: Parse Anthropic events and emit normalized Responses API events

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
): TransformStream<Uint8Array, Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

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
		controller: TransformStreamDefaultController<Uint8Array>,
		eventName: string,
		payload: any,
	) => {
		controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
	};

	return new TransformStream<Uint8Array, Uint8Array>({
		async transform(chunk, controller) {
			buf += decoder.decode(chunk, { stream: true });
			const frames = buf.split(/\n\n/);
			buf = frames.pop() ?? "";

			for (const raw of frames) {
				// Parse SSE frame
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
						name: block.name || "",
						input: "",
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
						});
					}

				} else if (payload.type === "content_block_stop") {
					// Content block finished - no action needed
					// The final structure will be built in message_stop

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
								call_id: block.id,
								name: block.name,
								arguments: typeof parsedInput === "string" ? parsedInput : JSON.stringify(parsedInput),
							});
						}
					}

					// Map Anthropic stop_reason to Responses API status
					let status: "completed" | "incomplete" | "failed" = "completed";
					if (stopReason === "max_tokens") {
						status = "incomplete";
					}

					// Build usage object
					const responseUsage = usage ? {
						input_tokens: usage.input_tokens || 0,
						output_tokens: usage.output_tokens || 0,
						total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
						...(usage.cache_read_input_tokens ? {
							input_tokens_details: {
								cached_tokens: usage.cache_read_input_tokens,
							},
						} : {}),
					} : undefined;

					// Emit response.completed
					emitEvent(controller, "response.completed", {
						response: {
							id: requestId,
							object: "response",
							created_at: createdAt,
							model: model,
							status,
							output: outputItems,
							usage: responseUsage,
							nativeResponseId: messageId,
						},
					});
				}
			}
		},

		flush(controller) {
			// If there's any remaining buffer, ignore it
			// All complete events should have been processed
		},
	});
}

function mapAnthropicStopReason(reason: string | null | undefined): string | null {
	if (!reason) return null;
	switch (reason) {
		case "end_turn":
		case "stop_sequence":
		case "pause_turn":
			return "stop";
		case "tool_use":
			return "tool_calls";
		case "max_tokens":
			return "length";
		case "refusal":
			return "content_filter";
		default:
			return "stop";
	}
}

/**
 * Transform Anthropic Messages API streaming to OpenAI Chat Completions streaming format
 *
 * OpenAI Chat SSE:
 * - data: { id, object:"chat.completion.chunk", created, model, choices:[{delta, finish_reason}] }
 * - final frame includes usage (if available) and finish_reason
 * - data: [DONE]
 */
export function createAnthropicToChatStreamTransformer(
	requestId: string,
	model: string,
): TransformStream<Uint8Array, Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	let createdAt: number = Math.floor(Date.now() / 1000);
	let messageId: string | null = null;
	let usage: any = null;
	let stopReason: string | null = null;
	let roleEmitted = false;

	const toolBlocks = new Map<number, { id: string; name: string; args: string }>();

	const emitChunk = (
		controller: TransformStreamDefaultController<Uint8Array>,
		delta: Record<string, any>,
		finishReason?: string | null,
		usagePayload?: any,
	) => {
		const chunk: any = {
			id: requestId,
			object: "chat.completion.chunk",
			created: createdAt,
			model,
			choices: [
				{
					index: 0,
					delta,
					finish_reason: finishReason ?? null,
				},
			],
		};
		if (usagePayload) {
			chunk.usage = usagePayload;
		}
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
	};

	return new TransformStream<Uint8Array, Uint8Array>({
		async transform(chunk, controller) {
			buf += decoder.decode(chunk, { stream: true });
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

				if (payload.type === "message_start") {
					const msg = payload.message;
					messageId = msg.id;
					createdAt = Math.floor(Date.now() / 1000);
					usage = msg.usage ?? usage;
					if (!roleEmitted) {
						emitChunk(controller, { role: "assistant" });
						roleEmitted = true;
					}
					continue;
				}

				if (payload.type === "content_block_start") {
					const index = payload.index ?? 0;
					const block = payload.content_block;
					if (block?.type === "tool_use") {
						const toolId = block.id || `tool_${requestId}_${index}`;
						const name = block.name || "";
						toolBlocks.set(index, { id: toolId, name, args: "" });
						emitChunk(controller, {
							tool_calls: [
								{
									index,
									id: toolId,
									type: "function",
									function: { name, arguments: "" },
								},
							],
						});
					}
					continue;
				}

				if (payload.type === "content_block_delta") {
					const index = payload.index ?? 0;
					const delta = payload.delta;
					if (delta?.type === "text_delta") {
						const text = typeof delta.text === "string" ? delta.text : "";
						if (text) {
							emitChunk(controller, { content: text });
						}
					} else if (delta?.type === "thinking_delta") {
						const thinking = typeof delta.thinking === "string" ? delta.thinking : "";
						if (thinking) {
							emitChunk(controller, { reasoning_content: thinking });
						}
					} else if (delta?.type === "input_json_delta") {
						const partial = typeof delta.partial_json === "string" ? delta.partial_json : "";
						if (partial) {
							const tool = toolBlocks.get(index);
							if (tool) {
								tool.args += partial;
								emitChunk(controller, {
									tool_calls: [
										{
											index,
											id: tool.id,
											type: "function",
											function: { name: tool.name, arguments: partial },
										},
									],
								});
							}
						}
					}
					continue;
				}

				if (payload.type === "message_delta") {
					if (payload.delta?.stop_reason) stopReason = payload.delta.stop_reason;
					if (payload.usage) {
						usage = { ...usage, ...payload.usage };
					}
					continue;
				}

				if (payload.type === "message_stop") {
					const finishReason = mapAnthropicStopReason(stopReason);
					const usagePayload = usage
						? {
								prompt_tokens: usage.input_tokens || 0,
								completion_tokens: usage.output_tokens || 0,
								total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
						  }
						: undefined;
					emitChunk(controller, {}, finishReason, usagePayload);
					controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				}
			}
		},
	});
}

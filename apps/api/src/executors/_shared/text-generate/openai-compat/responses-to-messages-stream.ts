import type { ExecutorExecuteArgs } from "@executors/types";
import { readSseEvents, sseReadable, SseProtocolError } from "@core/sse";
import { normalizeResponsesEvent } from "./stream-shared";

export function transformResponsesStreamToAnthropic(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let beforeBlocks: Uint8Array[] = [];
	let afterBlocks: Uint8Array[] = [];
	let queuedBytes = 0;
	let queuedFrames = 0;
	let nextBlockToDrain = 0;
	const emit = (eventName: string, payload: unknown) => {
		const bytes = encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
		queuedBytes += bytes.byteLength;
		if (++queuedFrames > 4096 || queuedBytes > 8 * 1024 * 1024) throw new SseProtocolError("sse_state_too_large");
		if (eventName.startsWith("content_block_")) {
			const block = blocks[(payload as { index: number }).index];
			if (eventName === "content_block_delta" && !block.open) throw new SseProtocolError("sse_invalid_tool_delta");
			block.queue.push(bytes);
		} else if (eventName === "message_start") beforeBlocks.push(bytes);
		else afterBlocks.push(bytes);
	};
	let messageStarted = false;
	let nextBlockIndex = 0;
	let terminalEmitted = false;
	type AnthropicBlock = {
		index: number;
		type: "text" | "thinking" | "tool_use";
		open: boolean;
		emittedContent: boolean;
		queue: Uint8Array[];
		toolId?: string;
		toolName?: string;
	};
	const blocksByAlias = new Map<string, AnthropicBlock>();
	const blocks: AnthropicBlock[] = [];

	const aliasesFor = (value: {
		id?: unknown;
		itemId?: unknown;
		callId?: unknown;
		outputIndex?: unknown;
	}) => {
		const aliases: string[] = [];
		const add = (prefix: string, candidate: unknown) => {
			if (candidate !== undefined && candidate !== null && candidate !== "") {
				if ((typeof candidate !== "string" && typeof candidate !== "number") || String(candidate).length > 1024) throw new SseProtocolError("sse_state_too_large");
				aliases.push(`${prefix}:${String(candidate)}`);
			}
		};
		add("id", value.id);
		add("id", value.itemId);
		add("call", value.callId);
		add("output", value.outputIndex);
		return aliases;
	};

	const ensureMessageStart = (response?: any) => {
		if (messageStarted) return;
		messageStarted = true;
		emit("message_start", {
			type: "message_start",
			message: {
				id: response?.nativeResponseId ?? response?.id ?? args.requestId,
				type: "message",
				role: "assistant",
				model: response?.model ?? args.providerModelSlug ?? args.ir.model,
				content: [],
				stop_reason: null,
				stop_sequence: null,
				usage: normalizeUsageToAnthropic(response?.usage),
			},
		});
	};

	const ensureBlock = (
		aliases: string[],
		type: "text" | "thinking" | "tool_use",
		tool?: { id?: string; name?: string },
	) => {
		const existing = aliases.map((alias) => blocksByAlias.get(alias)).find(Boolean);
		if (aliases.some(alias => blocksByAlias.has(alias) && blocksByAlias.get(alias) !== existing)) throw new SseProtocolError("sse_invalid_tool_delta");
		if (blocksByAlias.size + aliases.filter(alias => !blocksByAlias.has(alias)).length > 512) throw new SseProtocolError("sse_state_too_large");
		if (existing) {
			if (existing.type !== type) throw new SseProtocolError("sse_invalid_tool_delta");
			for (const alias of aliases) blocksByAlias.set(alias, existing);
			if (tool?.id) existing.toolId = tool.id;
			if (tool?.name) existing.toolName = tool.name;
			return existing;
		}
		if (blocks.length >= 128 || (tool?.id?.length ?? 0) > 1024 || (tool?.name?.length ?? 0) > 1024) throw new SseProtocolError("sse_state_too_large");
		ensureMessageStart();
		const block = {
			index: nextBlockIndex++,
			type,
			open: true,
			emittedContent: false,
			queue: [] as Uint8Array[],
			toolId: tool?.id,
			toolName: tool?.name,
		};
		blocks.push(block);
		for (const alias of aliases) blocksByAlias.set(alias, block);
		emit("content_block_start", {
			type: "content_block_start",
			index: block.index,
			content_block: type === "tool_use"
				? {
					type: "tool_use",
					id: block.toolId ?? `tool_${args.requestId}_${block.index}`,
					name: block.toolName ?? "tool",
					input: {},
				}
				: type === "thinking"
					? { type: "thinking", thinking: "" }
					: { type: "text", text: "" },
		});
		return block;
	};

	function stopBlock(block: { index: number; open: boolean }) {
		if (!block.open) return;
		block.open = false;
		emit("content_block_stop", {
			type: "content_block_stop",
			index: block.index,
		});
	}
	const failMessage = (payload: any) => {
		if (terminalEmitted) return;
		terminalEmitted = true;
		const error = payload?.response?.error ?? payload?.error ?? payload;
		const code = typeof error?.code === "string" ? error.code : undefined;
		const kinds: Record<string, string> = {
			rate_limit_exceeded: "rate_limit_error", rate_limit_error: "rate_limit_error",
			invalid_api_key: "authentication_error", authentication_error: "authentication_error",
			permission_denied: "permission_error", overloaded_error: "overloaded_error",
		};
		emit("error", { type: "error", error: {
			type: code && Object.hasOwn(kinds, code) ? kinds[code] : "api_error",
			message: typeof error?.message === "string" ? error.message : "Upstream generation failed",
			...(code ? { code } : {}),
			...(typeof error?.status === "number" ? { status: error.status } : {}),
		} });
	};

	const finishMessage = (response: any) => {
		if (terminalEmitted) return;
		terminalEmitted = true;
		ensureMessageStart(response);

		const outputItems = Array.isArray(response?.output)
			? response.output
			: (Array.isArray(response?.output_items) ? response.output_items : []);
		let hasToolUse = false;
		for (let outputIndex = 0; outputIndex < outputItems.length; outputIndex += 1) {
			const item = outputItems[outputIndex];
			const itemType = String(item?.type ?? "").toLowerCase();
			if (itemType === "reasoning" || itemType === "message") {
				const blockType = itemType === "reasoning" ? "thinking" : "text";
				const block = ensureBlock(aliasesFor({ id: item?.id, outputIndex }), blockType);
				if (!block.emittedContent) {
					const text = extractOutputText(item?.content);
					if (text) {
						emit("content_block_delta", {
							type: "content_block_delta",
							index: block.index,
							delta: blockType === "thinking"
								? { type: "thinking_delta", thinking: text }
								: { type: "text_delta", text },
						});
						block.emittedContent = true;
					}
				}
				stopBlock(block);
				continue;
			}

			if (itemType === "function_call" || itemType === "tool_call") {
				hasToolUse = true;
				const toolId = item?.call_id ?? item?.id ?? `tool_${outputIndex}`;
				const block = ensureBlock(aliasesFor({
					id: item?.id,
					callId: item?.call_id,
					outputIndex,
				}), "tool_use", {
					id: toolId,
					name: item?.name ?? "tool",
				});
				if (!block.emittedContent && typeof item?.arguments === "string" && item.arguments.length > 0) {
					emit("content_block_delta", {
						type: "content_block_delta",
						index: block.index,
						delta: { type: "input_json_delta", partial_json: item.arguments },
					});
					block.emittedContent = true;
				}
				stopBlock(block);
			}
		}

		for (const block of blocks) stopBlock(block);
		hasToolUse ||= blocks.some((block) => block.type === "tool_use");
		const usage = normalizeUsageToAnthropic(response?.usage);
		emit("message_delta", {
			type: "message_delta",
			delta: {
				stop_reason: mapResponsesStatusToAnthropicStopReason(response, hasToolUse),
				stop_sequence: null,
			},
			usage,
		});
		emit("message_stop", { type: "message_stop" });
	};

	const processFrame = (event: string | undefined, payload: any) => {
		const normalizedEvent = normalizeResponsesEvent(event ?? payload?.type ?? null);
		if (normalizedEvent === "response.created") {
			ensureMessageStart(payload?.response ?? payload);
			return;
		}
		if (normalizedEvent === "response.output_text.delta" && typeof payload?.delta === "string") {
			const block = ensureBlock(aliasesFor({
				itemId: payload?.item_id,
				outputIndex: payload?.output_index ?? 0,
			}), "text");
			emit("content_block_delta", {
				type: "content_block_delta",
				index: block.index,
				delta: { type: "text_delta", text: payload.delta },
			});
			block.emittedContent = true;
			return;
		}
		if (normalizedEvent === "response.reasoning_text.delta" && typeof payload?.delta === "string") {
			const block = ensureBlock(aliasesFor({
				itemId: payload?.item_id,
				outputIndex: payload?.output_index ?? 0,
			}), "thinking");
			emit("content_block_delta", {
				type: "content_block_delta",
				index: block.index,
				delta: { type: "thinking_delta", thinking: payload.delta },
			});
			block.emittedContent = true;
			return;
		}
		if (normalizedEvent === "response.output_item.added") {
			const item = payload?.item;
			const itemType = String(item?.type ?? "").toLowerCase();
			if (itemType === "function_call" || itemType === "tool_call") {
				const toolId = item?.call_id ?? item?.id ?? payload?.item_id;
				const block = ensureBlock(aliasesFor({
					id: item?.id,
					itemId: payload?.item_id,
					callId: item?.call_id,
					outputIndex: payload?.output_index,
				}), "tool_use", { id: toolId, name: item?.name ?? item?.function?.name });
				if (typeof item?.arguments === "string" && item.arguments) {
					emit("content_block_delta", { type: "content_block_delta", index: block.index, delta: { type: "input_json_delta", partial_json: item.arguments } });
					block.emittedContent = true;
				}
			}
			return;
		}
		if (normalizedEvent === "response.function_call_arguments.delta" && typeof payload?.delta === "string") {
			const toolId = payload?.call_id ?? payload?.item_id ?? payload?.output_index ?? 0;
			const block = ensureBlock(aliasesFor({
				itemId: payload?.item_id,
				callId: payload?.call_id,
				outputIndex: payload?.output_index,
			}), "tool_use", { id: payload?.call_id ?? toolId });
			emit("content_block_delta", {
				type: "content_block_delta",
				index: block.index,
				delta: { type: "input_json_delta", partial_json: payload.delta },
			});
			block.emittedContent = true;
			return;
		}
		if (
			normalizedEvent === "response.output_text.done" ||
			normalizedEvent === "response.reasoning_text.done" ||
			normalizedEvent === "response.output_item.done"
		) {
			const item = payload?.item;
			const block = aliasesFor({
				id: item?.id,
				itemId: payload?.item_id,
				callId: item?.call_id ?? payload?.call_id,
				outputIndex: payload?.output_index,
			}).map((alias) => blocksByAlias.get(alias)).find(Boolean);
			if (block) {
				if (!block.emittedContent && block.open) {
					const text = block.type === "tool_use" ? item?.arguments : payload?.text ?? extractOutputText(item?.content);
					if (typeof text === "string" && text) {
						emit("content_block_delta", { type: "content_block_delta", index: block.index,
							delta: block.type === "tool_use" ? { type: "input_json_delta", partial_json: text }
								: block.type === "thinking" ? { type: "thinking_delta", thinking: text } : { type: "text_delta", text },
						});
						block.emittedContent = true;
					}
				}
				stopBlock(block);
			}
			return;
		}
		if (normalizedEvent === "response.failed" || normalizedEvent === "error") {
			failMessage(payload);
			return;
		}
		if (normalizedEvent === "response.completed" || normalizedEvent === "response.incomplete") {
			finishMessage(payload?.response ?? payload);
			return;
		}
		if (!normalizedEvent && payload?.object === "response") {
			if (payload.status === "failed") failMessage(payload);
			else if (["completed", "incomplete"].includes(payload.status)) finishMessage(payload);
		}
	};
	return sseReadable(async function* (signal) {
		for await (const { event, data } of readSseEvents(stream, { signal })) {
			if (!data) continue;
			if (data === "[DONE]") throw new SseProtocolError("sse_missing_terminal");
			let payload: any;
			try { payload = JSON.parse(data); } catch { throw new SseProtocolError("sse_invalid_json"); }
			processFrame(event, payload);
			for (const bytes of beforeBlocks) { queuedBytes -= bytes.byteLength; queuedFrames--; yield bytes; }
			beforeBlocks = [];
			// Messages SDKs expect serial content blocks. Responses may interleave
			// parallel calls: relay the first block immediately, retaining only the
			// bounded pending frames of later blocks until their predecessor ends.
			while (nextBlockToDrain < blocks.length) {
				const block = blocks[nextBlockToDrain];
				for (const bytes of block.queue) { queuedBytes -= bytes.byteLength; queuedFrames--; yield bytes; }
				block.queue = [];
				if (block.open) break;
				nextBlockToDrain++;
			}
			for (const bytes of afterBlocks) { queuedBytes -= bytes.byteLength; queuedFrames--; yield bytes; }
			afterBlocks = [];
			if (terminalEmitted) return;
		}
		throw new SseProtocolError("sse_missing_terminal");
	});
}

function normalizeUsageToAnthropic(usage: any): { input_tokens: number; output_tokens: number } {
	const inputTokens = Number(
		usage?.input_tokens ??
		usage?.prompt_tokens ??
		usage?.inputTokens ??
		0,
	);
	const outputTokens = Number(
		usage?.output_tokens ??
		usage?.completion_tokens ??
		usage?.outputTokens ??
		0,
	);
	return {
		input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
		output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
	};
}

function extractOutputText(content: any): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => extractTextPart(part))
		.filter((part) => part.length > 0)
		.join("");
}

function extractTextPart(part: any): string {
	if (!part || typeof part !== "object") return "";
	if (typeof part.text === "string") return part.text;
	if (part.type === "output_text" && typeof part.text === "string") return part.text;
	return "";
}

function mapResponsesStatusToAnthropicStopReason(
	response: any,
	hasToolUse: boolean,
): "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "refusal" | null {
	const status = String(response?.status ?? "").toLowerCase();
	if (status === "failed") return null;
	if (hasToolUse) return "tool_use";
	if (status === "incomplete") {
		const reason = String(response?.incomplete_details?.reason ?? "").toLowerCase();
		if (reason.includes("stop_sequence")) return "stop_sequence";
		if (reason.includes("content")) return "refusal";
		return "max_tokens";
	}
	return "end_turn";
}

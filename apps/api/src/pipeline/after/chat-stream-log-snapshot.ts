// Purpose: Give the audit a whole chat.completion for streamed Chat requests.
// Why: The I/O log, request classifiers and trace exports read the stream's final
//      snapshot. Executors that end a Chat stream with a full `chat.completion`
//      snapshot are covered already, but a stream that only ever sends chunks leaves
//      the terminal chunk as the "snapshot", so the stored response loses its text,
//      reasoning and tool calls.
// How: Fold the chunks the client received into a chat.completion as they pass, and
//      use it only when the final snapshot is missing or is itself a chunk. Text and
//      images kept are capped by UTF-8 size so a long stream cannot grow Worker
//      memory without bound.

const MAX_ACCUMULATED_BYTES = 5 * 1024 * 1024;

/** UTF-8 length without encoding the string. */
function utf8Length(value: string): number {
	let bytes = 0;
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code < 0x80) bytes += 1;
		else if (code < 0x800) bytes += 2;
		else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
			bytes += 4;
			i++;
		} else bytes += 3;
	}
	return bytes;
}

/** The longest prefix that fits in `maxBytes`, never splitting a surrogate pair. */
function utf8Prefix(value: string, maxBytes: number): string {
	let bytes = 0;
	let end = 0;
	while (end < value.length) {
		const code = value.charCodeAt(end);
		const pair = code >= 0xd800 && code <= 0xdbff && end + 1 < value.length;
		const size = code < 0x80 ? 1 : code < 0x800 ? 2 : pair ? 4 : 3;
		if (bytes + size > maxBytes) break;
		bytes += size;
		end += pair ? 2 : 1;
	}
	return value.slice(0, end);
}

type ToolCallState = {
	index: number;
	id?: string;
	type?: string;
	function: { name?: string; arguments: string };
};

type ChoiceState = {
	index: number;
	content: string;
	refusal: string;
	reasoning: string;
	toolCalls: Map<number, ToolCallState>;
	images: unknown[];
	finishReason: string | null;
};

export type ChatChunkAccumulator = {
	add: (frame: unknown) => void;
	toCompletion: () => Record<string, unknown> | null;
};

export function createChatChunkAccumulator(): ChatChunkAccumulator {
	const choices = new Map<number, ChoiceState>();
	let header: { id?: unknown; created?: unknown; model?: unknown; system_fingerprint?: unknown; service_tier?: unknown } = {};
	let usage: unknown = null;
	let sawChunk = false;
	let bytes = 0;
	let truncated = false;

	const append = (current: string, next: unknown): string => {
		if (typeof next !== "string" || next.length === 0) return current;
		const size = utf8Length(next);
		if (bytes + size <= MAX_ACCUMULATED_BYTES) {
			bytes += size;
			return current + next;
		}
		truncated = true;
		const piece = utf8Prefix(next, MAX_ACCUMULATED_BYTES - bytes);
		bytes = MAX_ACCUMULATED_BYTES;
		return current + piece;
	};

	/** Images are kept whole or dropped; inline data URLs count against the cap. */
	const keepImage = (image: unknown): boolean => {
		let size: number;
		try {
			size = utf8Length(JSON.stringify(image) ?? "");
		} catch {
			return false;
		}
		if (bytes + size > MAX_ACCUMULATED_BYTES) {
			truncated = true;
			return false;
		}
		bytes += size;
		return true;
	};

	const choiceFor = (index: number): ChoiceState => {
		let choice = choices.get(index);
		if (!choice) {
			choice = {
				index,
				content: "",
				refusal: "",
				reasoning: "",
				toolCalls: new Map(),
				images: [],
				finishReason: null,
			};
			choices.set(index, choice);
		}
		return choice;
	};

	return {
		add(frame) {
			const chunk = frame as Record<string, any> | null;
			if (!chunk || typeof chunk !== "object" || chunk.object !== "chat.completion.chunk") return;
			sawChunk = true;
			for (const field of ["id", "created", "model", "system_fingerprint", "service_tier"] as const) {
				if (chunk[field] != null && header[field] == null) header = { ...header, [field]: chunk[field] };
			}
			if (chunk.usage) usage = chunk.usage;
			for (const raw of Array.isArray(chunk.choices) ? chunk.choices : []) {
				const index = typeof raw?.index === "number" ? raw.index : 0;
				const choice = choiceFor(index);
				const delta = raw?.delta ?? {};
				choice.content = append(choice.content, delta.content);
				choice.refusal = append(choice.refusal, delta.refusal);
				choice.reasoning = append(choice.reasoning, delta.reasoning_content ?? delta.reasoning);
				if (Array.isArray(delta.images)) choice.images.push(...delta.images.filter(keepImage));
				for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
					const callIndex = typeof call?.index === "number" ? call.index : choice.toolCalls.size;
					let state = choice.toolCalls.get(callIndex);
					if (!state) {
						state = { index: callIndex, function: { arguments: "" } };
						choice.toolCalls.set(callIndex, state);
					}
					if (typeof call?.id === "string" && call.id) state.id = call.id;
					if (typeof call?.type === "string" && call.type) state.type = call.type;
					// Providers may split a name across chunks, as with arguments.
					if (typeof call?.function?.name === "string" && call.function.name) {
						state.function.name = append(state.function.name ?? "", call.function.name);
					}
					state.function.arguments = append(state.function.arguments, call?.function?.arguments);
				}
				if (raw?.finish_reason != null) choice.finishReason = String(raw.finish_reason);
			}
		},
		toCompletion() {
			if (!sawChunk) return null;
			const ordered = Array.from(choices.values()).sort((a, b) => a.index - b.index);
			return {
				...header,
				object: "chat.completion",
				choices: ordered.map((choice) => {
					const toolCalls = Array.from(choice.toolCalls.values())
						.sort((a, b) => a.index - b.index)
						.map(({ id, type, function: fn }) => ({
							...(id ? { id } : {}),
							type: type ?? "function",
							function: { ...(fn.name ? { name: fn.name } : {}), arguments: fn.arguments },
						}));
					return {
						index: choice.index,
						message: {
							role: "assistant",
							content: choice.content.length > 0 || toolCalls.length === 0 ? choice.content : null,
							...(choice.refusal ? { refusal: choice.refusal } : {}),
							...(choice.reasoning ? { reasoning_content: choice.reasoning } : {}),
							...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
							...(choice.images.length > 0 ? { images: choice.images } : {}),
						},
						finish_reason: choice.finishReason,
					};
				}),
				...(usage ? { usage } : {}),
				...(truncated ? { gateway_log_truncated: true } : {}),
			};
		},
	};
}

/**
 * The response the audit should record: the stream's own final snapshot when it
 * is a whole object, otherwise the completion assembled from the chunks.
 */
export function resolveChatStreamAuditResponse(
	snapshot: unknown,
	accumulator: ChatChunkAccumulator,
): unknown {
	const object = (snapshot as Record<string, unknown> | null)?.object;
	if (snapshot && object !== "chat.completion.chunk") return snapshot;
	return accumulator.toCompletion() ?? snapshot;
}

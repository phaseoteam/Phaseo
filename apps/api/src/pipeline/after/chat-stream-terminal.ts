// Purpose: Keep client Chat streams to chat.completion.chunk frames.
// Why: Executors end Chat streams with a full `object: "chat.completion"` snapshot. The
//      gateway reads it internally (finish reason, usage, response plugins, the buffered
//      materialiser and its reasoning_details), but it is not a chunk, and strict OpenAI
//      SDK consumers mis-handle it.
// How: At the client boundary only, replace the snapshot with the chunks a Chat stream
//      documents: any content the stream never delivered, one finish_reason per choice,
//      and the usage-only chunk (empty choices), followed by [DONE] as before.

type ChoiceState = { sawDelta: boolean; sawFinish: boolean };

const DELTA_FIELDS = [
	"content",
	"refusal",
	"reasoning_content",
	"reasoning",
	"reasoning_details",
	"tool_calls",
	"images",
	"audios",
	"annotations",
] as const;

// Chunk-level fields copied from the snapshot onto every chunk built from it.
const CHUNK_FIELDS = new Set(["id", "created", "model", "nativeResponseId", "system_fingerprint", "service_tier"]);
// Fields of the snapshot object itself, not of a chunk.
const SNAPSHOT_ONLY_FIELDS = new Set(["object", "choices", "usage"]);

function hasValue(value: unknown): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

/** The delta a choice would have streamed, built from its snapshot message. */
function messageToDelta(message: any): Record<string, unknown> | null {
	if (!message || typeof message !== "object") return null;
	const delta: Record<string, unknown> = {};
	for (const field of DELTA_FIELDS) {
		if (!hasValue(message[field])) continue;
		if (field === "tool_calls") {
			delta.tool_calls = (message.tool_calls as any[]).map((call, index) => ({
				index: typeof call?.index === "number" ? call.index : index,
				...call,
			}));
			continue;
		}
		delta[field] = message[field];
	}
	if (Object.keys(delta).length === 0) return null;
	return { role: "assistant", ...delta };
}

export type ChatStreamTerminal = {
	/**
	 * The frames a client receives for one client-bound frame: the frame itself, or,
	 * for a `chat.completion` snapshot, the chunks that complete the stream.
	 */
	expand(frame: any): any[];
};

export function createChatStreamTerminal(): ChatStreamTerminal {
	const choices = new Map<number, ChoiceState>();
	let sawUsage = false;
	const stateFor = (index: number): ChoiceState => {
		let state = choices.get(index);
		if (!state) {
			state = { sawDelta: false, sawFinish: false };
			choices.set(index, state);
		}
		return state;
	};

	const observe = (frame: any) => {
		if (frame?.object !== "chat.completion.chunk") return;
		for (const choice of Array.isArray(frame.choices) ? frame.choices : []) {
			const state = stateFor(typeof choice?.index === "number" ? choice.index : 0);
			const delta = choice?.delta;
			if (delta && DELTA_FIELDS.some((field) => hasValue(delta[field]))) state.sawDelta = true;
			if (choice?.finish_reason != null) state.sawFinish = true;
		}
		if (frame.usage) sawUsage = true;
	};

	const expand = (frame: any): any[] => {
		if (frame?.object !== "chat.completion") {
			observe(frame);
			return [frame];
		}
		const base: Record<string, unknown> = { object: "chat.completion.chunk" };
		const extras: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(frame)) {
			if (SNAPSHOT_ONLY_FIELDS.has(key)) continue;
			if (CHUNK_FIELDS.has(key)) base[key] = value;
			else extras[key] = value;
		}
		const snapshotChoices: any[] = Array.isArray(frame.choices) ? frame.choices : [];
		const indexOf = (choice: any) => (typeof choice?.index === "number" ? choice.index : 0);
		const out: any[] = [];
		for (const choice of snapshotChoices) {
			const index = indexOf(choice);
			if (stateFor(index).sawDelta) continue;
			const delta = messageToDelta(choice?.message);
			if (delta) out.push({ ...base, choices: [{ index, delta, finish_reason: null }] });
		}
		const finishes = snapshotChoices
			.filter((choice) => !stateFor(indexOf(choice)).sawFinish)
			.map((choice) => ({
				index: indexOf(choice),
				delta: {},
				finish_reason: choice?.finish_reason ?? "stop",
				...(choice?.logprobs ? { logprobs: choice.logprobs } : {}),
			}));
		if (finishes.length > 0) out.push({ ...base, choices: finishes });
		if (frame.usage && !sawUsage) out.push({ ...base, choices: [], usage: frame.usage });
		// Gateway fields (meta, routing_diagnostics, upstream_request, citations, ...) ride
		// on the last chunk.
		if (Object.keys(extras).length > 0) {
			if (out.length > 0) out[out.length - 1] = { ...out[out.length - 1], ...extras };
			else out.push({ ...base, choices: [], ...extras });
		}
		for (const chunk of out) observe(chunk);
		return out;
	};

	return { expand };
}

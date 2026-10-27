// Purpose: Make every Responses stream event a client receives match the documented shape.
// Why: Responses events reach a client from several sources: a Responses upstream passed
//      through, the Claude and Chat transformers, the synthetic stream and the re-encoder.
//      OpenAI's SDKs and the AI SDK dispatch on `data.type` and expect `sequence_number`,
//      `response.in_progress` and a done event for every part that streamed deltas; not
//      every source sends all of that, and some name an event differently in the SSE
//      `event:` line and in `data.type`.
// How: At the client boundary only (internal readers have already read the source
//      frames), each event gets one name used for both the `event:` line and `data.type`,
//      a sequence number counted from 0, and the events its source left out:
//      `response.in_progress` after `response.created`, `content_part.added` before a
//      part's first delta, and the part's text done and `content_part.done` before its
//      item finishes. Claude citations, which travel internally in Claude's own shape
//      so the Messages surface can return them, become Responses annotations here.
//      https://platform.openai.com/docs/api-reference/responses-streaming

import { toResponsesAnnotations } from "@protocols/shared/citations";

export type ResponsesStreamFrame = { eventName: string | null; frame: any };

export type ResponsesStreamNormaliser = {
	/** The client frames for one outbound frame, in order. */
	normalise(eventName: string | null | undefined, frame: any): ResponsesStreamFrame[];
};

// Older or provider-specific names for documented events.
const LEGACY_EVENT_NAMES: Record<string, string> = {
	"response.reasoning.delta": "response.reasoning_text.delta",
	"response.reasoning.done": "response.reasoning_text.done",
	"response.reasoning_summary.delta": "response.reasoning_summary_text.delta",
	"response.reasoning_summary.done": "response.reasoning_summary_text.done",
	"response.output.delta": "response.output_text.delta",
	"response.text.delta": "response.output_text.delta",
};

const CLAUDE_CITATION_TYPES = new Set([
	"char_location",
	"page_location",
	"content_block_location",
	"web_search_result_location",
	"search_result_location",
]);

type TextKind = "output_text" | "reasoning_text";

type PartState = {
	itemId: string;
	outputIndex: number | undefined;
	contentIndex: number;
	kind: TextKind;
	text: string;
	added: boolean;
	streamed: boolean;
	textDone: boolean;
	partDone: boolean;
};

function isEventType(value: unknown): value is string {
	return typeof value === "string" && (value.startsWith("response.") || value === "error");
}

/**
 * The event's documented name. `data.type` wins over the SSE event name when they
 * differ: internal transforms rename some events (summary deltas become reasoning
 * deltas for Chat and Messages readers) without touching the data.
 */
function resolveEventName(eventName: string | null | undefined, frame: any): string | null {
	const raw = isEventType(frame?.type) ? frame.type : (eventName || null);
	return raw ? (LEGACY_EVENT_NAMES[raw] ?? raw) : null;
}

function textKindFor(name: string): TextKind | null {
	if (name.startsWith("response.output_text.")) return "output_text";
	if (name.startsWith("response.reasoning_text.")) return "reasoning_text";
	return null;
}

function emptyPart(kind: TextKind, text = ""): Record<string, any> {
	return kind === "output_text" ? { type: "output_text", text, annotations: [] } : { type: "reasoning_text", text };
}

export function createResponsesStreamNormaliser(): ResponsesStreamNormaliser {
	let sequence = 0;
	let sentInProgress = false;
	const parts = new Map<string, PartState>();
	const annotationCounts = new Map<string, number>();

	const keyOf = (itemId: string, contentIndex: number) => `${itemId}:${contentIndex}`;
	const stamp = (name: string, frame: Record<string, any>): ResponsesStreamFrame => {
		const { type: _type, sequence_number: _sequence, ...rest } = frame ?? {};
		return { eventName: name, frame: { type: name, ...rest, sequence_number: sequence++ } };
	};
	const partFor = (frame: any, kind: TextKind): PartState | null => {
		const itemId = typeof frame?.item_id === "string" && frame.item_id ? frame.item_id : null;
		if (!itemId) return null;
		const contentIndex = typeof frame?.content_index === "number" ? frame.content_index : 0;
		const key = keyOf(itemId, contentIndex);
		let state = parts.get(key);
		if (!state) {
			state = {
				itemId,
				outputIndex: typeof frame?.output_index === "number" ? frame.output_index : undefined,
				contentIndex,
				kind,
				text: "",
				added: false,
				streamed: false,
				textDone: false,
				partDone: false,
			};
			parts.set(key, state);
		}
		if (state.outputIndex === undefined && typeof frame?.output_index === "number") state.outputIndex = frame.output_index;
		return state;
	};
	const location = (state: PartState) => ({
		item_id: state.itemId,
		...(state.outputIndex !== undefined ? { output_index: state.outputIndex } : {}),
		content_index: state.contentIndex,
	});
	/** The done events a streamed part never received. */
	const closeParts = (out: ResponsesStreamFrame[], itemId?: string) => {
		for (const state of parts.values()) {
			if (!state.streamed || (itemId !== undefined && state.itemId !== itemId)) continue;
			if (!state.textDone) {
				state.textDone = true;
				out.push(stamp(`response.${state.kind}.done`, { ...location(state), text: state.text }));
			}
			if (!state.partDone) {
				state.partDone = true;
				out.push(stamp("response.content_part.done", { ...location(state), part: emptyPart(state.kind, state.text) }));
			}
		}
	};

	return {
		normalise(eventName, frame) {
			const name = resolveEventName(eventName, frame);
			if (!name || !frame || typeof frame !== "object" || Array.isArray(frame)) {
				return [{ eventName: eventName ?? null, frame }];
			}
			const out: ResponsesStreamFrame[] = [];

			if (name === "response.in_progress") {
				// Sent once, right after response.created.
				if (sentInProgress) return out;
				sentInProgress = true;
				out.push(stamp(name, frame));
				return out;
			}

			if (name === "response.content_part.added") {
				const kind = frame?.part?.type === "reasoning_text" ? "reasoning_text" : frame?.part?.type === "output_text" ? "output_text" : null;
				const state = kind ? partFor(frame, kind) : null;
				if (state) state.added = true;
			} else if (name === "response.content_part.done") {
				const kind = frame?.part?.type === "reasoning_text" ? "reasoning_text" : frame?.part?.type === "output_text" ? "output_text" : null;
				const state = kind ? partFor(frame, kind) : null;
				if (state) state.partDone = true;
			} else if (name === "response.output_text.annotation.added" && CLAUDE_CITATION_TYPES.has(String(frame?.annotation?.type))) {
				// Claude's own citation: the Responses form, or nothing for a document
				// citation, which has no Responses annotation.
				const [annotation] = toResponsesAnnotations([frame.annotation]);
				if (!annotation) return out;
				const key = keyOf(String(frame.item_id ?? ""), typeof frame.content_index === "number" ? frame.content_index : 0);
				const index = annotationCounts.get(key) ?? 0;
				annotationCounts.set(key, index + 1);
				out.push(stamp(name, { ...frame, annotation, annotation_index: index }));
				return out;
			}

			const kind = textKindFor(name);
			if (kind && (name.endsWith(".delta") || name.endsWith(".done"))) {
				const state = partFor(frame, kind);
				if (state) {
					const located = { ...frame, content_index: state.contentIndex };
					if (name.endsWith(".delta")) {
						if (!state.added) {
							state.added = true;
							out.push(stamp("response.content_part.added", { ...location(state), part: emptyPart(kind) }));
						}
						state.streamed = true;
						if (typeof frame.delta === "string") state.text += frame.delta;
					} else {
						state.textDone = true;
					}
					out.push(stamp(name, located));
					return out;
				}
			}

			if (name === "response.output_item.done" && typeof frame?.item?.id === "string") {
				closeParts(out, frame.item.id);
			} else if (name === "response.completed" || name === "response.incomplete") {
				closeParts(out);
			}

			out.push(stamp(name, frame));
			if (name === "response.created" && !sentInProgress) {
				sentInProgress = true;
				const response = frame.response && typeof frame.response === "object" ? frame.response : {};
				out.push(stamp("response.in_progress", { response: { ...response, status: "in_progress" } }));
			}
			return out;
		},
	};
}

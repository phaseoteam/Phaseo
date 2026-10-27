// Purpose: Carry citations and refusal text from a client-protocol stream into the IR that
//          buffered clients receive.
// Why: Buffered responses are materialised from the same stream streaming clients get; the
//      unified stream events carry text, tools and usage but not citations or refusals.
// How: Reads Chat annotation/refusal deltas, Responses annotation/refusal events and Claude
//      citations_delta frames per choice. Streamed values win over the final snapshot, which
//      only fills in when the stream never sent them, so nothing is counted twice.

import type { IRChatResponse, IRContentPart } from "@core/ir";
import { toIRAnnotations } from "@protocols/shared/citations";

type ChoiceCitations = {
	streamedAnnotations: unknown[];
	snapshotAnnotations: unknown[];
	streamedRefusal: string;
	snapshotRefusal: string;
};

export type StreamCitationCollector = {
	observe: (eventName: string | null, payload: any) => void;
	/** Adds what the stream carried to the IR's choices, and returns the IR. */
	apply: (ir: IRChatResponse) => IRChatResponse;
};

function responsesSnapshot(eventName: string | null, payload: any): any | null {
	const type = eventName || (typeof payload?.type === "string" ? payload.type : "");
	if (type === "response.completed" || type === "response.incomplete") return payload?.response ?? payload;
	if (payload?.object === "response" && ["completed", "incomplete"].includes(String(payload?.status))) return payload;
	return null;
}

export function createStreamCitationCollector(): StreamCitationCollector {
	const choices = new Map<number, ChoiceCitations>();
	const choice = (index: unknown): ChoiceCitations => {
		const key = typeof index === "number" && Number.isFinite(index) ? index : 0;
		let entry = choices.get(key);
		if (!entry) {
			entry = { streamedAnnotations: [], snapshotAnnotations: [], streamedRefusal: "", snapshotRefusal: "" };
			choices.set(key, entry);
		}
		return entry;
	};

	const observe = (eventName: string | null, payload: any) => {
		if (!payload || typeof payload !== "object") return;
		const type = eventName || (typeof payload.type === "string" ? payload.type : "");

		// Chat Completions chunks and the gateway's final chat.completion frame.
		if (payload.object === "chat.completion.chunk" || payload.object === "chat.completion") {
			const isSnapshot = payload.object === "chat.completion";
			for (const entry of Array.isArray(payload.choices) ? payload.choices : []) {
				const source = isSnapshot ? entry?.message : entry?.delta;
				const state = choice(entry?.index);
				if (Array.isArray(source?.annotations)) {
					(isSnapshot ? state.snapshotAnnotations : state.streamedAnnotations).push(...source.annotations);
				}
				if (typeof source?.refusal === "string" && source.refusal) {
					if (isSnapshot) state.snapshotRefusal = source.refusal;
					else state.streamedRefusal += source.refusal;
				}
			}
			return;
		}

		// Responses events.
		if (type === "response.output_text.annotation.added" && payload.annotation) {
			choice(0).streamedAnnotations.push(payload.annotation);
			return;
		}
		if (type === "response.refusal.delta" && typeof payload.delta === "string") {
			choice(0).streamedRefusal += payload.delta;
			return;
		}
		const snapshot = responsesSnapshot(eventName, payload);
		if (snapshot) {
			const state = choice(0);
			for (const item of Array.isArray(snapshot.output) ? snapshot.output : []) {
				if (item?.type !== "message") continue;
				for (const part of Array.isArray(item.content) ? item.content : []) {
					if (part?.type === "output_text" && Array.isArray(part.annotations)) state.snapshotAnnotations.push(...part.annotations);
					if (part?.type === "refusal" && typeof part.refusal === "string") state.snapshotRefusal += part.refusal;
				}
			}
			return;
		}

		// Messages: citations on a text block, at its start or in citations_delta frames.
		if (type === "content_block_start" && payload.content_block?.type === "text" && Array.isArray(payload.content_block.citations)) {
			choice(0).streamedAnnotations.push(...payload.content_block.citations);
			return;
		}
		if (type === "content_block_delta" && payload.delta?.type === "citations_delta" && payload.delta.citation) {
			choice(0).streamedAnnotations.push(payload.delta.citation);
		}
	};

	const apply = (ir: IRChatResponse) => {
		for (const irChoice of ir.choices) {
			const state = choices.get(irChoice.index);
			if (!state) continue;
			const annotations = toIRAnnotations(
				state.streamedAnnotations.length > 0 ? state.streamedAnnotations : state.snapshotAnnotations,
			);
			const text = (irChoice.message.content as IRContentPart[]).find(
				(part): part is Extract<IRContentPart, { type: "text" }> => part.type === "text",
			);
			if (text && annotations.length > 0) {
				text.annotations = [...(text.annotations ?? []), ...annotations];
			}
			const refusal = state.streamedRefusal || state.snapshotRefusal;
			if (refusal && !irChoice.message.refusal) {
				irChoice.message.refusal = refusal;
			}
		}
		return ir;
	};

	return { observe, apply };
}

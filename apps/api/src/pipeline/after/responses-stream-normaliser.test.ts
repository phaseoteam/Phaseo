import { describe, expect, it } from "vitest";
import { createResponsesStreamNormaliser } from "./responses-stream-normaliser";

type Source = [string | null, Record<string, any>];

function normaliseAll(frames: Source[]) {
	const normaliser = createResponsesStreamNormaliser();
	return frames.flatMap(([eventName, frame]) => normaliser.normalise(eventName, frame));
}

describe("createResponsesStreamNormaliser", () => {
	it("gives every event a type equal to its SSE name and a sequence number, and adds the events a source left out", () => {
		// The shape the Claude transformer sends: no data.type, no in_progress, and a
		// reasoning item with deltas but no content part or done events.
		const out = normaliseAll([
			["response.created", { response: { id: "req_1", object: "response", status: "in_progress", output: [] } }],
			["response.output_item.added", { output_index: 0, item: { type: "reasoning", id: "rs_1", summary: [], content: [] } }],
			["response.reasoning_text.delta", { delta: "Think ", output_index: 0, item_id: "rs_1" }],
			["response.reasoning_text.delta", { delta: "more.", output_index: 0, item_id: "rs_1" }],
			["response.output_item.done", { output_index: 0, item: { type: "reasoning", id: "rs_1", summary: [], content: [{ type: "reasoning_text", text: "Think more." }] } }],
			["response.completed", { response: { id: "req_1", object: "response", status: "completed", output: [] } }],
		]);

		expect(out.map((event) => event.eventName)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
			"response.reasoning_text.delta",
			"response.reasoning_text.delta",
			"response.reasoning_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		]);
		for (const [index, event] of out.entries()) {
			expect(event.frame.type).toBe(event.eventName);
			expect(event.frame.sequence_number).toBe(index);
		}
		expect(out[1].frame.response).toMatchObject({ id: "req_1", status: "in_progress" });
		expect(out[3].frame).toMatchObject({ item_id: "rs_1", output_index: 0, content_index: 0, part: { type: "reasoning_text", text: "" } });
		expect(out[4].frame).toMatchObject({ item_id: "rs_1", content_index: 0, delta: "Think " });
		expect(out[6].frame).toMatchObject({ item_id: "rs_1", output_index: 0, content_index: 0, text: "Think more." });
		expect(out[7].frame).toMatchObject({ part: { type: "reasoning_text", text: "Think more." } });
	});

	it("does not repeat lifecycle events a source already sent, and renumbers sequence numbers", () => {
		const out = normaliseAll([
			["response.created", { type: "response.created", sequence_number: 0, response: { id: "r", status: "in_progress" } }],
			["response.in_progress", { type: "response.in_progress", sequence_number: 1, response: { id: "r", status: "in_progress" } }],
			["response.content_part.added", { type: "response.content_part.added", sequence_number: 2, item_id: "msg_1", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }],
			["response.output_text.delta", { type: "response.output_text.delta", sequence_number: 3, item_id: "msg_1", output_index: 0, content_index: 0, delta: "Hi" }],
			["response.output_text.done", { type: "response.output_text.done", sequence_number: 4, item_id: "msg_1", output_index: 0, content_index: 0, text: "Hi" }],
			["response.content_part.done", { type: "response.content_part.done", sequence_number: 5, item_id: "msg_1", output_index: 0, content_index: 0, part: { type: "output_text", text: "Hi", annotations: [] } }],
			["response.output_item.done", { type: "response.output_item.done", sequence_number: 6, output_index: 0, item: { type: "message", id: "msg_1" } }],
		]);
		expect(out.map((event) => event.eventName)).toEqual([
			"response.created",
			"response.in_progress",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
		]);
		expect(out.map((event) => event.frame.sequence_number)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it("names an event by its data.type when the SSE name differs, and renames legacy events", () => {
		const out = normaliseAll([
			["response.reasoning_text.delta", { type: "response.reasoning_summary_text.delta", item_id: "rs_1", output_index: 0, summary_index: 0, delta: "Summary" }],
			["response.reasoning.delta", { type: "response.reasoning.delta", item_id: "rs_2", delta: "Legacy" }],
		]);
		expect(out[0]).toMatchObject({ eventName: "response.reasoning_summary_text.delta", frame: { type: "response.reasoning_summary_text.delta", delta: "Summary" } });
		expect(out.map((event) => event.eventName)).toEqual([
			"response.reasoning_summary_text.delta",
			"response.content_part.added",
			"response.reasoning_text.delta",
		]);
		expect(out[2].frame).toMatchObject({ type: "response.reasoning_text.delta", item_id: "rs_2", content_index: 0, delta: "Legacy" });
	});

	it("turns Claude citations into Responses annotations and drops document citations", () => {
		const out = normaliseAll([
			["response.output_text.annotation.added", { item_id: "msg_1", output_index: 0, content_index: 0, annotation_index: 0, annotation: { type: "char_location", cited_text: "q", document_index: 0, start_char_index: 0, end_char_index: 1 } }],
			["response.output_text.annotation.added", { item_id: "msg_1", output_index: 0, content_index: 0, annotation_index: 1, annotation: { type: "web_search_result_location", url: "https://example.com", title: "Example", cited_text: "q", encrypted_index: "enc" } }],
			["response.output_text.annotation.added", { item_id: "msg_2", output_index: 1, content_index: 0, annotation_index: 0, annotation: { type: "url_citation", url: "https://example.org", start_index: 0, end_index: 2 } }],
		]);
		expect(out).toHaveLength(2);
		expect(out[0].frame).toMatchObject({ annotation_index: 0, annotation: { type: "url_citation", url: "https://example.com", title: "Example" } });
		expect(out[0].frame.annotation).not.toHaveProperty("encrypted_index");
		expect(out[1].frame.annotation).toEqual({ type: "url_citation", url: "https://example.org", start_index: 0, end_index: 2 });
	});

	it("passes through frames that name no event", () => {
		const frame = { object: "response", status: "completed" };
		expect(normaliseAll([[null, frame]])).toEqual([{ eventName: null, frame }]);
	});
});

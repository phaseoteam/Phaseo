import { describe, expect, it } from "vitest";
import type { IRChatResponse } from "@core/ir";
import { createSyntheticResponsesStreamFromIR } from "./synthetic-responses-stream";

describe("createSyntheticResponsesStreamFromIR", () => {
	it("emits visible output events for Responses consumers", async () => {
		const response: IRChatResponse = {
			id: "req_synthetic",
			created: 1,
			model: "gemini-3.5-flash-lite",
			provider: "google-ai-studio",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: [{ type: "text", text: "GEMINI_SYNTHETIC_OK" }],
				},
				finishReason: "stop",
			}],
		};
		const reader = createSyntheticResponsesStreamFromIR(response).getReader();
		const decoder = new TextDecoder();
		let output = "";
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			output += decoder.decode(next.value, { stream: true });
		}

		expect(output).toContain("response.output_text.delta");
		expect(output).toContain("GEMINI_SYNTHETIC_OK");
		expect(output).toContain("response.completed");
	});

	it("labels text and annotation events with the content part they belong to", async () => {
		// Vertex Claude returns several cited text blocks; each becomes its own output_text part.
		const response: IRChatResponse = {
			id: "req_synthetic_cited",
			created: 1,
			model: "claude",
			provider: "google-vertex",
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "First.", annotations: [{ type: "url_citation", url: "https://example.com/1", start_index: 0, end_index: 6 }] },
						{ type: "text", text: "Second.", annotations: [{ type: "url_citation", url: "https://example.com/2", start_index: 0, end_index: 7 }] },
					],
				},
				finishReason: "stop",
			}],
		};
		const output = await new Response(createSyntheticResponsesStreamFromIR(response)).text();
		const events = output.split(/\n\n/).flatMap((block) => {
			const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
			return data ? [JSON.parse(data)] : [];
		});
		const completed = events.find((event) => event.type === "response.completed").response;
		const parts = completed.output.find((item: any) => item.type === "message").content;
		expect(parts.map((part: any) => part.text)).toEqual(["First.", "Second."]);

		const annotations = events.filter((event) => event.type === "response.output_text.annotation.added");
		expect(annotations.map((event) => [event.content_index, event.annotation.url])).toEqual([
			[0, "https://example.com/1"],
			[1, "https://example.com/2"],
		]);
		for (const event of annotations) {
			expect(parts[event.content_index].annotations[event.annotation_index]).toEqual(event.annotation);
		}
		const texts = events.filter((event) => event.type === "response.output_text.done");
		expect(texts.map((event) => [event.content_index, event.text])).toEqual([[0, "First."], [1, "Second."]]);
	});
});

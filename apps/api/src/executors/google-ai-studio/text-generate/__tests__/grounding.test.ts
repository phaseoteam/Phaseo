import { describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { transformStream } from "../index";

function args(protocol: "openai.chat.completions" | "openai.responses" | "anthropic.messages"): ExecutorExecuteArgs {
	return {
		ir: {
			model: "google/gemini-2.5-flash",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "weather in Lyon?" }] }],
		},
		requestId: "req_google_grounding",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: protocol === "anthropic.messages" ? "messages" : protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol,
		capability: "text.generate",
		providerModelSlug: "gemini-2.5-flash",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

function frames(text: string): any[] {
	return text.split(/\n\n/).flatMap((block) => {
		const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
		return data && data !== "[DONE]" ? [JSON.parse(data)] : [];
	});
}

// Gemini sends grounding metadata on the last frame, after the text.
function groundedStream(): ReadableStream<Uint8Array> {
	const payloads = [
		{ candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Lyon is sunny." }] } }], usageMetadata: { promptTokenCount: 5 } },
		{
			candidates: [{
				index: 0,
				content: { role: "model", parts: [{ text: "" }] },
				finishReason: "STOP",
				groundingMetadata: {
					groundingChunks: [{ web: { uri: "https://example.com/lyon", title: "Lyon weather" } }],
					groundingSupports: [{ segment: { startIndex: 0, endIndex: 14 }, groundingChunkIndices: [0] }],
				},
			}],
			usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4, totalTokenCount: 9 },
		},
	];
	return new Response(payloads.map((payload) => `data: ${JSON.stringify(payload)}\n\n`).join("")).body!;
}

describe("google-ai-studio grounding citations", () => {
	it("streams grounding as Chat url_citation annotations", async () => {
		const output = await new Response(transformStream(groundedStream(), args("openai.chat.completions"))).text();
		const annotations = frames(output).flatMap((chunk) => chunk.choices ?? []).flatMap((choice: any) => choice.delta?.annotations ?? []);
		expect(annotations).toEqual([
			{ type: "url_citation", url_citation: { url: "https://example.com/lyon", title: "Lyon weather", start_index: 0, end_index: 14 } },
		]);
	});

	it("streams grounding as Responses annotations and keeps it in the completed response", async () => {
		const output = await new Response(transformStream(groundedStream(), args("openai.responses"))).text();
		expect(output).toContain("event: response.output_text.annotation.added");
		const completed = frames(output).find((event) => event.response?.status === "completed")?.response;
		expect(completed.output.find((item: any) => item.type === "message").content[0].annotations).toEqual([
			{ type: "url_citation", url: "https://example.com/lyon", title: "Lyon weather", start_index: 0, end_index: 14 },
		]);
	});

	it("does not stream grounding as Messages citations it cannot fill truthfully", async () => {
		// Messages web citations require Claude's encrypted_index; grounding has none.
		const output = await new Response(transformStream(groundedStream(), args("anthropic.messages"))).text();
		const events = frames(output);
		expect(events.some((event) => event.delta?.type === "citations_delta")).toBe(false);
		expect(events.filter((event) => event.type === "content_block_start").map((event) => event.content_block.type)).toEqual(["text"]);
		expect(events.flatMap((event) => event.delta?.type === "text_delta" ? [event.delta.text] : []).join("")).toBe("Lyon is sunny.");
	});
});

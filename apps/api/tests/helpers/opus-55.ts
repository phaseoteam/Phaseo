import type { Protocol } from "@protocols/detect";
import { computeBillSummary } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";

export const protocols: Protocol[] = ["openai.chat.completions", "openai.responses", "anthropic.messages"];

// Fixture prices exercise real pricing math; they are not provider price claims.
export function priceOpusUsage(usage: unknown, provider: string) {
	const card: PriceCard = { provider, model: "anthropic/claude-opus-5.5", endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null,
		rules: ["input_text_tokens", "output_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens"].map((meter, index) => ({ meter, unit: "token", unit_size: 1_000_000, price_per_unit: String(index + 1), pricing_plan: "standard", currency: "USD", match: [], priority: 100 })) };
	return computeBillSummary(usage, card, {}, "standard");
}
export function requestForProtocol(protocol: Protocol, stream = false): any {
	const common = { model: "anthropic/claude-opus-5.5", stream };
	if (protocol === "openai.responses") return { ...common, input: "Hello", max_output_tokens: 128 };
	return { ...common, messages: [{ role: "user", content: "Hello" }], max_tokens: 128 };
}

export const opusMessage = {
	id: "msg_opus", type: "message", role: "assistant", model: "claude-opus-5-5",
	content: [
		{ type: "thinking", thinking: "", signature: "opaque-signature" },
		{ type: "text", text: "Answer" },
		{ type: "tool_use", id: "call_lookup", name: "lookup", input: { city: "London" } },
	],
	stop_reason: "tool_use",
	usage: { input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
};

export function toolRoundTrip(protocol: Protocol): any {
	const common = { model: "anthropic/claude-opus-5.5", stream: false, max_tokens: 128 };
	if (protocol === "anthropic.messages") return {
		...common,
		messages: [{ role: "user", content: "Look up London" }, { role: "assistant", content: opusMessage.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: "call_lookup", content: "Sunny" }] }],
	};
	if (protocol === "openai.responses") return {
		...common,
		input: [{ role: "user", content: "Look up London" }, { type: "function_call", call_id: "call_lookup", name: "lookup", arguments: '{"city":"London"}' }, { type: "function_call_output", call_id: "call_lookup", output: "Sunny" }],
	};
	return {
		...common,
		messages: [{ role: "user", content: "Look up London" }, { role: "assistant", content: null, tool_calls: [{ id: "call_lookup", type: "function", function: { name: "lookup", arguments: '{"city":"London"}' } }] }, { role: "tool", tool_call_id: "call_lookup", content: "Sunny" }],
	};
}

// Documented Anthropic SSE grammar, deliberately fragmented at byte boundaries.
export function opusStream(thinking = ""): Response {
	const events: any[] = [{ type: "message_start", message: { ...opusMessage, content: [], stop_reason: null, usage: { ...opusMessage.usage, output_tokens: 0 } } }];
	opusMessage.content.forEach((block, index) => {
		events.push({ type: "content_block_start", index, content_block: block.type === "tool_use" ? { ...block, input: {} } : block.type === "text" ? { ...block, text: "" } : { type: "thinking", thinking: "", signature: "" } });
		if (block.type === "text") events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
		if (block.type === "thinking") {
			events.push({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking } });
			events.push({ type: "content_block_delta", index, delta: { type: "signature_delta", signature: block.signature } });
		}
		if (block.type === "tool_use") events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
		events.push({ type: "content_block_stop", index });
	});
	events.push({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } }, { type: "message_stop" });
	const bytes = new TextEncoder().encode(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""));
	return new Response(new ReadableStream<Uint8Array>({ start(controller) {
		for (let i = 0; i < bytes.length; i += 31) controller.enqueue(bytes.slice(i, i + 31));
		controller.close();
	} }), { headers: { "Content-Type": "text/event-stream" } });
}

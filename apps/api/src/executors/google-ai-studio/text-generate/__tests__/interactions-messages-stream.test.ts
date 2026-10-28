// Gemini Interactions responses replayed to /v1/messages clients: the executor's synthetic
// stream must be Messages events (message_start ... message_stop), not Responses events.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { consumeTextProtocolStreamToIR } from "@pipeline/surfaces/server-tools.stream";
import { executor } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

const interaction = {
	id: "interactions/messages-stream",
	object: "interaction",
	status: "completed",
	steps: [
		{ type: "thought", summary: [{ type: "text", text: "Check the weather first." }], signature: "THOUGHT-SIGNATURE-1" },
		{ type: "model_output", content: [{ type: "text", text: "Looking it up." }] },
		{ type: "function_call", id: "call_weather_1", name: "get_weather", arguments: { city: "Lyon" } },
	],
	usage: { total_input_tokens: 100_003, total_cached_tokens: 20_011, total_output_tokens: 850, total_tokens: 100_853 },
};

function messagesArgs(): ExecutorExecuteArgs {
	return {
		ir: {
			model: "google/gemini-3.1-flash-lite",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "Weather in Lyon?" }] }],
			tools: [{ name: "get_weather", description: "Weather", parameters: { type: "object", properties: { city: { type: "string" } } } }],
		},
		requestId: "req_interactions_messages",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "messages",
		protocol: "anthropic.messages",
		capability: "text.generate",
		providerModelSlug: "gemini-3.1-flash-lite",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as unknown as ExecutorExecuteArgs;
}

async function runExecutor(): Promise<ReadableStream<Uint8Array>> {
	const mock = installFetchMock([{
		match: (url) => url.endsWith("/v1beta/interactions"),
		response: new Response(JSON.stringify(interaction), { headers: { "Content-Type": "application/json" } }),
	}]);
	try {
		const result = await executor(messagesArgs());
		if (result.kind !== "stream" || !result.stream) throw new Error("Expected a synthetic Interactions stream");
		return result.stream;
	} finally {
		mock.restore();
	}
}

function eventNames(sse: string): string[] {
	return sse.split("\n").filter((line) => line.startsWith("event: ")).map((line) => line.slice("event: ".length));
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Gemini Interactions on /v1/messages", () => {
	it("streams Messages events with the thinking block, tool call and a final message_stop", async () => {
		const output = await new Response(await runExecutor()).text();
		const events = eventNames(output);
		expect(events[0]).toBe("message_start");
		expect(events.at(-1)).toBe("message_stop");
		expect(events.some((name) => name.startsWith("response."))).toBe(false);
		expect(output).not.toContain('"object":"response"');
		expect(output).toContain('"content_block":{"type":"thinking"');
		expect(output).toContain('"thinking":"Check the weather first."');
		expect(output).toContain('"type":"signature_delta"');
		expect(output).toContain('"content_block":{"type":"tool_use","id":"call_weather_1","name":"get_weather"');
		expect(output).toContain('"stop_reason":"tool_use"');
		// Anthropic usage: input excludes the 20,011 cache reads.
		expect(output).toContain('"cache_read_input_tokens":20011');
		expect(output).toContain('"input_tokens":79992');
	});

	// The buffered signature is #2982's (buffered reasoning state); this covers the rest.
	it("materialises a buffered Messages response with the reasoning text and tool call", async () => {
		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "anthropic.messages",
			stream: await runExecutor(),
			requestId: "req_interactions_messages",
			model: "google/gemini-3.1-flash-lite",
			provider: "google-ai-studio",
		});
		const choice = consumed.ir.choices[0];
		const reasoning = choice.message.content.find((part: any) => part.type === "reasoning_text") as any;
		expect(reasoning?.text).toBe("Check the weather first.");
		expect(choice.message.content).toContainEqual(expect.objectContaining({ type: "text", text: "Looking it up." }));
		expect(choice.message.toolCalls).toEqual([expect.objectContaining({ id: "call_weather_1", name: "get_weather", arguments: '{"city":"Lyon"}' })]);
		expect(choice.finishReason).toBe("tool_calls");
		expect(consumed.ir.usage).toMatchObject({ inputTokens: 79_992, cachedInputTokens: 20_011, cachedReadTokensAreSubsetOfInput: false });
	});
});

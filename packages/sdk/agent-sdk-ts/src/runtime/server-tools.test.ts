import { describe, expect, it, vi } from "vitest";
import { createGatewayAgentClient } from "../adapters/gateway-client";
import { createAgent } from "../agent";

// A phaseo:web_search call the gateway already ran, in the shape it sends it back: the function
// call carries its result inline (apps/api/src/protocols/stream/encode.ts, server_tool_result).
const webSearchCall = {
	type: "function_call",
	id: "call_ws_1",
	call_id: "call_ws_1",
	name: "phaseo_web_search",
	arguments: '{"query":"phaseo gateway"}',
	status: "completed",
	output: JSON.stringify({ provider: "exa", query: "phaseo gateway", results: [{ title: "Phaseo", url: "https://phaseo.app" }] }),
};
const message = (text: string) => ({ type: "message", content: [{ type: "output_text", text }] });

describe("gateway server tools", () => {
	it("completes when the response carries phaseo:web_search call and output items alongside a message", async () => {
		const create = vi.fn(async () => ({ id: "resp_ws_1", model: "openai/gpt-5.4-nano", output: [webSearchCall, message("Phaseo is an AI gateway.")] }));
		const agent = createAgent({ id: "search-agent" });

		const result = await agent.run({
			input: "What is Phaseo?",
			client: createGatewayAgentClient({ client: { responses: { create } } as any, gatewayTools: [{ type: "phaseo:web_search" }] as any }),
		});

		expect(result.run.status).toBe("completed");
		expect(result.output).toBe("Phaseo is an AI gateway.");
		expect(create).toHaveBeenCalledTimes(1);
		expect(result.stepResults?.[0]?.toolCalls).toEqual([]);
		expect(result.items).toEqual([
			expect.objectContaining({ type: "tool_call", toolCallId: "call_ws_1", name: "phaseo_web_search", input: { query: "phaseo gateway" }, rawProviderItem: webSearchCall }),
			expect.objectContaining({ type: "tool_result", toolCallId: "call_ws_1", name: "phaseo_web_search", output: webSearchCall.output }),
			expect.objectContaining({ type: "message", content: "Phaseo is an AI gateway." }),
			{ type: "output", value: "Phaseo is an AI gateway." },
		]);
	});

	it("streams a gateway-run server tool as a call and a result without running it locally", async () => {
		const create = vi.fn(async () => (async function* () {
			yield { response: { id: "req_ws_2", object: "response", status: "in_progress" } };
			yield { item_id: "call_ws_1", output_index: 0, item: webSearchCall };
			yield { delta: "Phaseo is an AI gateway.", output_index: 0 };
			yield { response: { id: "req_ws_2", object: "response", status: "completed", usage: { input_tokens: 9, output_tokens: 5, total_tokens: 14 } } };
		})());
		const toolEvents: string[] = [];
		const stream = createAgent({ id: "search-stream" }).stream({
			input: "What is Phaseo?",
			client: createGatewayAgentClient({ client: { responses: { create } } as any }),
			onEvent: (event) => { if (event.type.startsWith("tool.")) toolEvents.push(event.type); },
		});

		const streamed = [];
		for await (const item of stream.getItemsStream()) streamed.push(item);
		const result = await stream;

		expect(result.output).toBe("Phaseo is an AI gateway.");
		expect(streamed.map((item) => item.type)).toEqual(["tool_call", "tool_result", "message", "output"]);
		expect(streamed[1]).toEqual(expect.objectContaining({ type: "tool_result", toolCallId: "call_ws_1", output: webSearchCall.output }));
		expect(toolEvents).toEqual([]);
	});

	it("reports a failed gateway server tool as an error item", async () => {
		const failed = { ...webSearchCall, status: "failed", output: '{"error":"web_search_max_uses_exceeded"}', error: { message: "Server tool returned an error." } };
		const create = vi.fn(async () => ({ id: "resp_ws_3", output: [failed, message("I could not search the web.")] }));

		const result = await createAgent({ id: "search-failure" }).run({ input: "Search", client: createGatewayAgentClient({ client: { responses: { create } } as any }) });

		expect(result.run.status).toBe("completed");
		expect(result.items).toEqual(expect.arrayContaining([
			expect.objectContaining({ type: "error", message: "Server tool returned an error.", toolCallId: "call_ws_1", toolName: "phaseo_web_search", rawProviderItem: failed }),
		]));
	});

	it("leaves a deferred server-tool call to the gateway when the same turn calls a local tool", async () => {
		// The gateway skips its own tools in a turn that also calls a client tool, and returns both calls unrun.
		const create = vi.fn()
			.mockResolvedValueOnce({ id: "resp_mixed_1", output: [
				{ type: "function_call", call_id: "call_ws_2", name: "phaseo_web_search", arguments: '{"query":"presets"}', status: "completed" },
				{ type: "function_call", call_id: "call_docs_1", name: "lookup-docs", arguments: '{"slug":"presets"}', status: "completed" },
			] })
			.mockResolvedValueOnce({ id: "resp_mixed_2", output: [message("Presets are saved routing configs.")] });
		const lookups: unknown[] = [];
		const agent = createAgent({ id: "mixed-agent", tools: [{ id: "lookup-docs", execute: async (input: unknown) => { lookups.push(input); return { title: "Presets" }; } }] });

		const result = await agent.run({ input: "Explain presets", client: createGatewayAgentClient({ client: { responses: { create } } as any, gatewayTools: [{ type: "phaseo:web_search" }] as any }) });

		expect(result.output).toBe("Presets are saved routing configs.");
		expect(lookups).toEqual([{ slug: "presets" }]);
		expect(result.stepResults?.[0]?.toolCalls.map((call) => call.name)).toEqual(["lookup-docs"]);
		expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool_call", toolCallId: "call_ws_2", name: "phaseo_web_search" })]));
		const followUp = (create.mock.calls[1]?.[0] as { input: unknown }).input;
		expect(JSON.stringify(followUp)).not.toContain("call_ws_2");
		expect(followUp).toEqual(expect.arrayContaining([{ type: "function_call_output", call_id: "call_docs_1", output: JSON.stringify({ title: "Presets" }, null, 2) }]));
	});

	it("treats a call as done when a custom client returns its result in the same response", async () => {
		const client = { generate: vi.fn(async () => ({
			message: { role: "assistant" as const, content: "Found it.", toolCalls: [{ id: "call_ws_1", name: "phaseo_web_search", input: { query: "phaseo" } }] },
			items: [
				{ type: "tool_call" as const, toolCallId: "call_ws_1", name: "phaseo_web_search", input: { query: "phaseo" } },
				{ type: "tool_result" as const, toolCallId: "call_ws_1", name: "phaseo_web_search", output: "results" },
				{ type: "message" as const, role: "assistant" as const, content: "Found it." },
			],
		})) };

		const result = await createAgent({ id: "custom-client" }).run({ input: "Search", client });

		expect(result.output).toBe("Found it.");
		expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "Found it." });
	});

	it("still fails on calls nothing has run", async () => {
		const unknown = vi.fn(async () => ({ id: "resp_unknown", output: [{ type: "function_call", call_id: "call_x", name: "lookup-weather", arguments: "{}" }] }));
		await expect(createAgent({ id: "unknown-tool" }).run({ input: "Weather?", client: createGatewayAgentClient({ client: { responses: { create: unknown } } as any }) }))
			.rejects.toThrow("Tool not found: lookup-weather");

		// A server-tool call on its own means the gateway did not offer that tool, so nothing will run it.
		const unrun = vi.fn(async () => ({ id: "resp_unrun", output: [{ type: "function_call", call_id: "call_ws_3", name: "phaseo_web_search", arguments: "{}" }] }));
		await expect(createAgent({ id: "unrun-server-tool" }).run({ input: "Search", client: createGatewayAgentClient({ client: { responses: { create: unrun } } as any }) }))
			.rejects.toThrow("Tool not found: phaseo_web_search");
	});
});

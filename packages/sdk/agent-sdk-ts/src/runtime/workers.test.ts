import { afterEach, describe, expect, it, vi } from "vitest";
import { createGatewayAgentClient } from "../adapters/gateway-client";
import { createAgent } from "../agent";

// Devtools are off by default, so a run must never call a Node built-in. @phaseo/sdk imports fs and
// path at load time (they resolve to these mocks too), so the check records calls rather than imports.
const nodeCalls = vi.hoisted(() => ({
	calls: [] as string[],
	record(name: string, module: Record<string, unknown>) {
		return Object.fromEntries(Object.entries(module).map(([key, value]) => [key, typeof value === "function" && key !== "default"
			? (...args: unknown[]) => { this.calls.push(`${name}.${key}`); return (value as (...args: unknown[]) => unknown)(...args); }
			: value]));
	},
}));
vi.mock("node:fs", async (importOriginal) => nodeCalls.record("node:fs", await importOriginal()));
vi.mock("node:path", async (importOriginal) => nodeCalls.record("node:path", await importOriginal()));
vi.mock("node:crypto", async (importOriginal) => nodeCalls.record("node:crypto", await importOriginal()));

const savedProcess = Object.getOwnPropertyDescriptor(globalThis, "process")!;

// Workers have no process global to rely on, so remove it while the agent runs.
async function withoutProcess<T>(run: () => Promise<T>): Promise<T> {
	Reflect.deleteProperty(globalThis, "process");
	try { return await run(); } finally { Object.defineProperty(globalThis, "process", savedProcess); }
}

function gatewayFetch(response: () => Response): typeof fetch {
	return async (input) => String(input instanceof Request ? input.url : input).endsWith("/responses") ? response() : Response.json({ data: [] });
}

function gatewayClient(response: () => Response) {
	return createGatewayAgentClient({
		clientOptions: { apiKey: "test-key", baseUrl: "https://gateway.test/v1", fetchImpl: gatewayFetch(response) },
		gatewayTools: [{ type: "phaseo:web_search" }] as any,
	});
}

describe("Agent SDK in a Workers-style runtime", () => {
	afterEach(() => { vi.restoreAllMocks(); });

	it("runs through the gateway client with no process global and no Node modules", async () => {
		const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID");
		const result = await withoutProcess(async () => createAgent({ id: "workers-agent" }).run({
			input: "What is Phaseo?",
			client: gatewayClient(() => Response.json({
				id: "resp_workers_1",
				model: "openai/gpt-5.4-nano",
				output: [{ type: "message", content: [{ type: "output_text", text: "Phaseo is an AI gateway." }] }],
			})),
		}));

		expect(globalThis.process).toBeDefined();
		expect(result.run.status).toBe("completed");
		expect(result.output).toBe("Phaseo is an AI gateway.");
		expect(result.run.id).toBe(randomUUID.mock.results[0]?.value);
		expect(nodeCalls.calls).toEqual([]);
	});

	it("streams through the gateway client with no process global", async () => {
		// The frames the gateway sends after running a server tool (event lines, data lines, [DONE]).
		const sse = [
			"event: response.created",
			`data: ${JSON.stringify({ response: { id: "req_workers_2", object: "response", status: "in_progress" } })}`,
			"event: response.output_item.done",
			`data: ${JSON.stringify({ item_id: "call_ws_1", output_index: 0, item: { type: "function_call", id: "call_ws_1", call_id: "call_ws_1", name: "phaseo_web_search", arguments: '{"query":"phaseo"}', status: "completed", output: '{"results":[]}' } })}`,
			"event: response.output_text.delta",
			`data: ${JSON.stringify({ delta: "Phaseo is an AI gateway.", output_index: 0 })}`,
			"event: response.completed",
			`data: ${JSON.stringify({ response: { id: "req_workers_2", object: "response", status: "completed", usage: { input_tokens: 9, output_tokens: 5, total_tokens: 14 } } })}`,
			"data: [DONE]",
		].join("\n\n");
		const chunks: string[] = [];
		const result = await withoutProcess(async () => {
			const stream = createAgent({ id: "workers-stream" }).stream({
				input: "What is Phaseo?",
				client: gatewayClient(() => new Response(sse, { headers: { "Content-Type": "text/event-stream" } })),
			});
			for await (const chunk of stream.getTextStream()) chunks.push(chunk);
			return await stream;
		});

		expect(chunks.join("")).toBe("Phaseo is an AI gateway.");
		expect(result.run.status).toBe("completed");
		expect(result.items.map((item) => item.type)).toEqual(["tool_call", "tool_result", "message", "output"]);
		expect(nodeCalls.calls).toEqual([]);
	});
});

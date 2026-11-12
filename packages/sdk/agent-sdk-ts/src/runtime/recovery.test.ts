import { describe, expect, it } from "vitest";
import { createAgent, defineTool } from "../agent";
import { AgentGatewayError, AgentStreamError, agentErrorIsContextOverflow, agentErrorIsRetryable } from "../errors";
import { createGatewayAgentClient } from "../adapters/gateway-client";
import { repairToolHistory, truncateToolOutput } from "./loop";
import type { AgentMessage, AgentModelRequest, AgentModelResponse } from "../types";

type Reply = AgentModelResponse | Error | ((request: AgentModelRequest) => AgentModelResponse);
/** A model that answers from a script and records what it was sent. */
function scripted(replies: Reply[]) {
	const requests: AgentModelRequest[] = [];
	return { requests, client: { generate: async (request: AgentModelRequest) => {
		requests.push(structuredClone({ ...request, signal: undefined }));
		const reply = replies.shift();
		if (!reply) throw new Error("No scripted reply left");
		if (reply instanceof Error) throw reply;
		return typeof reply === "function" ? reply(request) : reply;
	} } };
}
const say = (content: string): AgentModelResponse => ({ message: { role: "assistant", content } });
const call = (name: string, input: unknown, id = "c1", inputError?: string): AgentModelResponse => ({ message: { role: "assistant", content: "", toolCalls: [{ id, name, input, ...inputError ? { inputError } : {} }] } });
const toolMessages = (messages: AgentMessage[]) => messages.filter((message): message is Extract<AgentMessage, { role: "tool" }> => message.role === "tool");
const gatewayError = (status: number, headers: Record<string, string> = {}) => new AgentGatewayError({ status, statusText: "", headers, body: { message: `status ${status}` } });

describe("run recovery", () => {
	it("returns tool errors, unknown tools and unreadable arguments to the model", async () => {
		const read = defineTool({ id: "read", execute: async () => { throw new Error("No file at src/old.ts."); } });
		const model = scripted([call("read", {}), call("missing_tool", {}, "c2"), call("read", { raw: "{" }, "c3", "Unexpected end of JSON input"), say("Recovered")]);
		const agent = createAgent({ id: "recover", tools: [read], toolExecution: { onError: "return-to-model" } });
		const result = await agent.run({ input: "Go", client: model.client });
		expect(result.output).toBe("Recovered");
		expect(toolMessages(result.messages).map(message => [message.toolCallId, message.isError, JSON.parse(message.content).error])).toEqual([
			["c1", true, "No file at src/old.ts."],
			["c2", true, expect.stringContaining("There is no tool called missing_tool")],
			["c3", true, expect.stringContaining("not valid JSON")],
		]);
	});

	it("keeps the old behaviour for agents that fail the run on tool errors", async () => {
		const agent = createAgent({ id: "strict", tools: [] });
		await expect(agent.run({ input: "Go", client: scripted([call("missing_tool", {})]).client })).rejects.toThrow("Tool not found: missing_tool");
	});

	it("answers calls left unanswered by a failed run before continuing it", async () => {
		const broken = defineTool({ id: "read", execute: async () => { throw new Error("ENOENT"); } });
		const agent = createAgent({ id: "repair", tools: [broken] });
		const model = scripted([call("read", { path: "a" }), say("Continued")]);
		const failed = await agent.run({ input: "Go", client: model.client }).catch(() => undefined);
		expect(failed).toBeUndefined();
		let saved: any;
		const state = { load: async () => saved, save: async (result: any) => { saved = structuredClone(result); } };
		await agent.run({ input: "Go", client: scripted([call("read", { path: "a" })]).client, state }).catch(() => undefined);
		expect(saved.run.status).toBe("failed");
		const repairedIds: string[][] = [];
		const result = await agent.continueRun({ run: saved, client: model.client, humanInput: "It moved to lib/", onEvent: event => { if (event.type === "history.repaired") repairedIds.push(event.toolCallIds); } });
		expect(result.output).toBe("Continued");
		expect(repairedIds).toEqual([["c1"]]);
		const sent = model.requests.at(-1)!.messages;
		expect(sent.map(message => message.role)).toEqual(["user", "assistant", "tool", "user"]);
		expect(JSON.parse((sent[2] as any).content).error).toMatch(/not run/);
	});

	it("drops results that answer no call and leaves complete histories untouched", () => {
		const complete: AgentMessage[] = [{ role: "user", content: "Hi" }, call("read", {}).message, { role: "tool", name: "read", toolCallId: "c1", content: "ok" }];
		expect(repairToolHistory(complete).messages).toBe(complete);
		const stray: AgentMessage[] = [{ role: "user", content: "Hi" }, { role: "tool", name: "read", toolCallId: "gone", content: "late" }];
		expect(repairToolHistory(stray)).toEqual({ messages: [{ role: "user", content: "Hi" }], repaired: [] });
	});

	it("gives each continue call its own step budget", async () => {
		const noop = defineTool({ id: "noop", execute: async () => "done" });
		const agent = createAgent({ id: "budget", tools: [noop], maxSteps: 2 });
		let saved: any;
		const state = { load: async () => saved, save: async (result: any) => { saved = structuredClone(result); } };
		await expect(agent.run({ input: "Loop", client: scripted([call("noop", {}), call("noop", {}, "c2")]).client, state })).rejects.toThrow("Max steps exceeded (2)");
		const model = scripted([say("Finished")]);
		const result = await agent.continueRun({ run: saved, client: model.client, humanInput: "Carry on" });
		expect(result.output).toBe("Finished");
		expect(model.requests).toHaveLength(1);
	});

	it("retries retryable failures with Retry-After and gives up on others", async () => {
		const retries: number[] = [];
		const model = scripted([gatewayError(429, { "retry-after": "0" }), gatewayError(503), say("Third time")]);
		const agent = createAgent({ id: "retry", modelRetry: { maxRetries: 3, backoffMs: 0 } });
		const result = await agent.run({ input: "Go", client: model.client, onEvent: event => { if (event.type === "model.retrying") retries.push(event.delayMs!); } });
		expect(result.output).toBe("Third time");
		expect(retries).toEqual([0, 0]);
		const refused = scripted([gatewayError(401), say("never")]);
		await expect(agent.run({ input: "Go", client: refused.client })).rejects.toThrow("status 401");
		expect(refused.requests).toHaveLength(1);
		expect(agentErrorIsRetryable(new AgentStreamError("stalled", { code: "stream_idle", retryable: true }))).toBe(true);
		expect(agentErrorIsRetryable(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
	});

	it("never repeats an attempt that already streamed output", async () => {
		let attempts = 0;
		const client = { generate: async () => say("unused"), async *stream() { attempts++; yield { type: "response.output_text.delta" as const, delta: "Half an ans" }; throw new AgentStreamError("cut", { code: "stream_truncated", retryable: true }); } };
		const agent = createAgent({ id: "streamed", modelRetry: { maxRetries: 3, backoffMs: 0 } });
		await expect(agent.stream({ input: "Go", client })).rejects.toThrow("cut");
		expect(attempts).toBe(1);
	});

	it("truncates long tool output around a notice", async () => {
		const big = defineTool({ id: "big", execute: async () => "a".repeat(5000) + "END" });
		const model = scripted([call("big", {}), say("ok")]);
		await createAgent({ id: "cap", tools: [big], toolExecution: { maxOutputChars: 1000 } }).run({ input: "Go", client: model.client });
		const sent = toolMessages(model.requests[1].messages)[0].content;
		expect(sent.length).toBeLessThan(1200);
		expect(sent).toMatch(/characters omitted/);
		expect(sent.endsWith("END")).toBe(true);
		expect(truncateToolOutput("short", 1000)).toBe("short");
	});

	it("offers only active tools but still runs calls to the others", async () => {
		const tools = ["core", "extra"].map(id => defineTool({ id, execute: async () => id }));
		const model = scripted([call("extra", {}), say("ok")]);
		const result = await createAgent({ id: "active", tools, activeTools: ["core"] }).run({ input: "Go", client: model.client });
		expect(model.requests[0].tools.map(tool => tool.id)).toEqual(["core"]);
		expect(toolMessages(result.messages)[0].content).toBe("extra");
	});

	it("lets prepareMessages compact the history, and retries once after a context overflow", async () => {
		const reasons: string[] = [];
		const model = scripted([new AgentGatewayError({ status: 400, statusText: "", body: { message: "prompt is too long: 250000 tokens > 200000 maximum" } }), say("Fits now")]);
		const agent = createAgent({ id: "compact", prepareMessages: (messages, info) => { reasons.push(info.reason); return info.reason === "overflow" ? [{ role: "user", content: "Summary of earlier work" }, messages.at(-1)!] : undefined; } });
		const result = await agent.run({ input: "Go", client: model.client });
		expect(result.output).toBe("Fits now");
		expect(reasons).toEqual(["step", "overflow"]);
		expect(model.requests[1].messages[0]).toEqual({ role: "user", content: "Summary of earlier work" });
		expect(agentErrorIsContextOverflow(new AgentGatewayError({ status: 429, statusText: "", body: { message: "context length" } }))).toBe(false);
	});

	it("adds steering messages at the next step", async () => {
		const noop = defineTool({ id: "noop", execute: async () => "done" });
		const queue: AgentMessage[] = [{ role: "user", content: "Use tabs, not spaces" }];
		const model = scripted([call("noop", {}), say("ok")]);
		await createAgent({ id: "steer", tools: [noop] }).run({ input: "Go", client: model.client, takeMessages: () => queue.splice(0) });
		expect(model.requests[0].messages.at(-1)).toEqual({ role: "user", content: "Use tabs, not spaces" });
		expect(model.requests[1].messages.filter(message => message.role === "user")).toHaveLength(2);
	});
});

describe("gateway stream failures", () => {
	const streamOf = (chunks: Record<string, unknown>[], hang = false) => createGatewayAgentClient({ streamIdleTimeoutMs: 50, client: { responses: { create: async (_payload: unknown, options?: { signal?: AbortSignal }) => (async function* () {
		for (const chunk of chunks) yield chunk;
		if (hang) await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true }));
	})() } } as any });
	const drain = async (client: ReturnType<typeof createGatewayAgentClient>) => { for await (const _ of client.stream!({ agentId: "a", messages: [], tools: [], context: undefined })) { /* drain */ } };

	it("fails on error frames, failed responses, cut-off streams and stalls", async () => {
		await expect(drain(streamOf([{ type: "response.output_text.delta", delta: "Here is" }, { type: "error", error: { message: "upstream reset" } }]))).rejects.toMatchObject({ name: "AgentStreamError", message: "upstream reset", retryable: true });
		await expect(drain(streamOf([{ type: "response.completed", response: { status: "failed", error: { message: "provider failed" } } }]))).rejects.toMatchObject({ message: "provider failed" });
		await expect(drain(streamOf([{ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }]))).rejects.toMatchObject({ code: "max_output_tokens", retryable: false });
		await expect(drain(streamOf([{ type: "response.output_text.delta", delta: "Cut off mid-sent" }]))).rejects.toMatchObject({ code: "stream_truncated" });
		await expect(drain(streamOf([{ type: "response.output_text.delta", delta: "Thinking" }], true))).rejects.toMatchObject({ code: "stream_idle", retryable: true });
	});
});

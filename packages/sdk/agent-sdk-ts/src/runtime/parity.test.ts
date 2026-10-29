import { describe, expect, it, vi } from "vitest";
import { createAgent, tool } from "../agent";
import { maxCost, stepCountIs } from "../stop-conditions";

describe("Agent SDK parity contract", () => {
	it("validates tools, streams progress, and returns tool failures to the model", async () => {
		const events: unknown[] = [];
		const client = {
			generate: vi.fn()
				.mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [
					{ id: "one", name: "progress", input: { value: 2 } },
					{ id: "two", name: "failure", input: {} },
				] } })
				.mockResolvedValueOnce({ message: { role: "assistant", content: "finished" }, usage: { input_tokens: 3, output_tokens: 2 }, cost: 0.25 }),
		};
		const agent = createAgent({
			id: "parity",
			tools: [
				tool({ id: "progress", inputSchema: (value) => {
					if ((value as { value?: number }).value !== 2) throw new Error("invalid input");
					return value as { value: number };
				}, outputSchema: (value) => ({ result: Number((value as { result: number }).result) }), async *execute(input) {
					yield { percent: 50 };
					return { result: input.value * 2 };
				} }),
				tool({ id: "failure", onError: "return-to-model", execute: () => { throw new Error("expected failure"); } }),
			],
		});
		const result = await agent.run({ input: "run", client, onEvent: (event) => events.push(event) });
		expect(result.output).toBe("finished");
		expect(result.usage).toEqual(expect.objectContaining({ inputTokens: 3, outputTokens: 2, totalTokens: 5, cost: 0.25 }));
		expect(result.stepResults[0]?.toolResults).toEqual(expect.arrayContaining([
			expect.objectContaining({ toolCallId: "one", result: { result: 4 }, preliminaryResults: [{ percent: 50 }] }),
			expect.objectContaining({ toolCallId: "two", error: "expected failure" }),
		]));
		expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool.preliminary_result", result: { percent: 50 } })]));
		expect(client.generate.mock.calls[1]?.[0].messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: "tool", toolCallId: "two", isError: true })]));
	});

	it("reads each step's cost from the gateway's pricing in usage", async () => {
		const client = {
			generate: vi.fn()
				// Responses streams price in pricing_breakdown, Chat Completions in pricing.
				.mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [{ id: "one", name: "noop", input: {} }] }, usage: { input_tokens: 10, output_tokens: 2, pricing_breakdown: { total_nanos: 1_250_000, currency: "USD" } } })
				.mockResolvedValueOnce({ message: { role: "assistant", content: "done" }, usage: { prompt_tokens: 12, completion_tokens: 3, pricing: { total_nanos: 500_000, currency: "USD" } } }),
		};
		const agent = createAgent({ id: "priced", tools: [tool({ id: "noop", execute: () => "ok" })] });
		const result = await agent.run({ input: "run", client });
		expect(result.stepResults.map((step) => step.usage.cost)).toEqual([0.00125, 0.0005]);
		expect(result.usage.cost).toBeCloseTo(0.00175, 10);
	});

	it("pauses only gated calls and resumes exact approval, rejection, HITL, and manual outputs", async () => {
		const executed: string[] = [];
		const client = { generate: vi.fn()
			.mockResolvedValueOnce({ message: { role: "assistant", content: "", toolCalls: [
				{ id: "auto", name: "auto", input: {} }, { id: "gate", name: "gate", input: {} },
				{ id: "hitl", name: "hitl", input: {} }, { id: "manual", name: "manual", input: {} },
			] } })
			.mockResolvedValueOnce({ message: { role: "assistant", content: "done" } }) };
		const agent = createAgent({ id: "approvals", tools: [
			tool({ id: "auto", execute: () => { executed.push("auto"); return "auto-output"; } }),
			tool({ id: "gate", requireApproval: true, execute: () => { executed.push("gate"); return "approved"; } }),
			tool({ id: "hitl", onToolCalled: () => null, onResponseReceived: (value) => `reviewed:${value}` }),
			tool({ id: "manual", execute: false }),
		] });
		const paused = await agent.run({ input: "run", client });
		expect(executed).toEqual(["auto"]);
		expect(paused.run.pause?.pendingToolCalls?.map((item) => item.call.id)).toEqual(["gate", "hitl", "manual"]);
		const result = await agent.continueRun({ run: paused, client, approvals: [{ toolCallId: "gate" }],
			rejections: [{ toolCallId: "hitl", reason: "operator rejected" }], toolOutputs: [{ toolCallId: "manual", output: "external" }] });
		expect(executed).toEqual(["auto", "gate"]);
		expect(result.output).toBe("done");
		expect(client.generate.mock.calls[1]?.[0].messages).toEqual(expect.arrayContaining([
			expect.objectContaining({ toolCallId: "gate", content: expect.stringContaining("approved") }),
			expect.objectContaining({ toolCallId: "hitl", content: expect.stringContaining("operator rejected"), isError: true }),
			expect.objectContaining({ toolCallId: "manual", content: expect.stringContaining("external") }),
		]));
	});

	it("supports dynamic turn values, context mutation, state accessors, stop conditions, and replayable streams", async () => {
		const saved = new Map<string, any>();
		const requests: any[] = [];
		const client = { generate: async (request: any) => {
			requests.push(request);
			return requests.length === 1
				? { message: { role: "assistant", content: "", toolCalls: [{ id: "set", name: "set", input: {} }] }, cost: 1 }
				: { message: { role: "assistant", content: "should stop" }, cost: 1 };
		} };
		const agent = createAgent({ id: "dynamic", model: ({ context }) => context?.model ?? "first", instructions: ({ numberOfTurns }) => `turn:${numberOfTurns}`,
			stopWhen: [maxCost(2), stepCountIs(5)], tools: [tool({ id: "set", execute: (_input, runtime) => { runtime.setContext({ model: "second" }); return "ok"; }, nextTurnParams: { temperature: 0.2 } })] });
		const result = await agent.run({ input: "run", client, context: { model: "first" }, state: {
			load: async (id) => saved.get(id) ?? null, save: async (value) => { saved.set(value.run.id, value); },
		} });
		expect(result.run.status).toBe("stopped");
		expect(result.run.stopReason).toContain("cost");
		expect(saved.get(result.run.id)).toBeTruthy();
		expect(requests[0]).toEqual(expect.objectContaining({ model: "first", instructions: "turn:1" }));
		expect(requests[1]).toEqual(expect.objectContaining({ model: "second", instructions: "turn:2", temperature: 0.2, context: { model: "second" } }));

		const streamAgent = createAgent({ id: "stream" });
		const stream = streamAgent.stream({ input: "run", client: { generate: async () => ({ message: { role: "assistant", content: "fallback" } }),
			async *stream() { yield { type: "response.output_text.delta" as const, delta: "hel" }; yield { type: "response.output_text.delta" as const, delta: "lo" }; yield { type: "response.completed" as const, response: { message: { role: "assistant" as const, content: "hello" } } }; } } });
		const [textA, textB, completed] = await Promise.all([stream.getText(), stream.getText(), stream]);
		expect([textA, textB, completed.output]).toEqual(["hello", "hello", "hello"]);
	});

	it("uses one typed item contract for streaming and completed results", async () => {
		const messageItem = { type: "message" as const, role: "assistant" as const, content: "hello", rawProviderItem: { type: "message" } };
		const agent = createAgent({ id: "typed-stream" });
		const stream = agent.stream({
			input: "run",
			client: {
				generate: async () => ({ message: { role: "assistant", content: "unused" } }),
				async *stream() {
					yield { type: "response.item" as const, item: messageItem };
					yield { type: "response.completed" as const, response: { message: { role: "assistant" as const, content: "hello" }, items: [messageItem] } };
				},
			},
		});

		const streamedItems = [];
		for await (const item of stream.getItemsStream()) streamedItems.push(item);
		const result = await stream;

		expect(streamedItems).toEqual([
			messageItem,
			{ type: "output", value: "hello" },
		]);
		expect(result.items).toEqual(streamedItems);
		expect(streamedItems.map((item) => item.type)).toEqual(["message", "output"]);
	});
});

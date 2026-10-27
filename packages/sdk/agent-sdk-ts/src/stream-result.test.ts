import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "./agent";

// A failed run must reach whatever the caller awaits or iterates, and nothing else may reject unhandled.
const unhandled = vi.fn();
beforeEach(() => { process.on("unhandledRejection", unhandled); });
afterEach(() => { process.off("unhandledRejection", unhandled); unhandled.mockReset(); });

// Node reports an unhandled rejection once the microtask queue drains, so give it a few macrotasks.
async function settle() { for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0)); }

function failingStreamClient(error: Error) {
	return {
		generate: vi.fn(async () => { throw error; }),
		async *stream() {
			yield { type: "response.output_text.delta" as const, delta: "Partial" };
			throw error;
		},
	};
}

describe("failed agent streams", () => {
	it("fail the text stream and leave no unhandled rejection when only the text is read", async () => {
		const failure = new Error("upstream failed");
		const stream = createAgent({ id: "text-only" }).stream({ input: "Hi", client: failingStreamClient(failure) });

		const deltas: string[] = [];
		await expect((async () => { for await (const delta of stream.getTextStream()) deltas.push(delta); })()).rejects.toBe(failure);
		await settle();

		expect(deltas).toEqual(["Partial"]);
		expect(unhandled).not.toHaveBeenCalled();
	});

	it("fail the full stream and leave no unhandled rejection when only events are read", async () => {
		const failure = new Error("upstream failed");
		const stream = createAgent({ id: "events-only" }).stream({ input: "Hi", client: failingStreamClient(failure) });

		const types: string[] = [];
		await expect((async () => { for await (const event of stream.getFullStream()) types.push(event.type); })()).rejects.toBe(failure);
		await settle();

		expect(types).toEqual(expect.arrayContaining(["run.started", "response.output_text.delta", "run.failed"]));
		expect(unhandled).not.toHaveBeenCalled();
	});

	it("reject the result and leave no unhandled rejection when only the result is awaited", async () => {
		const failure = new Error("upstream failed");
		const stream = createAgent({ id: "result-only" }).stream({ input: "Hi", client: failingStreamClient(failure) });

		await expect(stream.getResult()).rejects.toBe(failure);
		await expect(stream).rejects.toBe(failure);
		await expect(stream.getText()).rejects.toBe(failure);
		await settle();

		expect(unhandled).not.toHaveBeenCalled();
	});

	it("leave no unhandled rejection when nothing reads a failed stream", async () => {
		createAgent({ id: "unread" }).stream({ input: "Hi", client: failingStreamClient(new Error("upstream failed")) });
		await settle();

		expect(unhandled).not.toHaveBeenCalled();
	});
});

describe("failed resumes", () => {
	it("check every pending call before running any, so a refused resume leaves no tool running unhandled", async () => {
		const execute = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); throw new Error("tool failed"); });
		const agent = createAgent({ id: "resume-check", tools: [{ id: "send", requireApproval: true, execute }] });
		const client = {
			generate: vi.fn(async () => ({
				message: { role: "assistant" as const, content: "", toolCalls: [{ id: "call_1", name: "send", input: {} }, { id: "call_2", name: "send", input: {} }] },
			})),
		};
		const paused = await agent.run({ input: "Send both", client });
		expect(paused.run.status).toBe("waiting_for_human");

		await expect(agent.continueRun({ run: paused, client, approveToolCalls: ["call_1"] })).rejects.toThrow("Missing approval decision for tool call call_2");
		await settle();

		expect(execute).not.toHaveBeenCalled();
		expect(unhandled).not.toHaveBeenCalled();
	});
});

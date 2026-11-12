import type { AgentEvent, AgentItem, AgentRunResult, AgentStreamEvent, AgentStreamResult } from "./types.js";

class ReplayChannel<T> {
	private readonly history: T[] = [];
	private readonly waiters = new Set<() => void>();
	private done = false;
	private failure: unknown;

	push(value: T) { this.history.push(value); this.wake(); }
	close() { this.done = true; this.wake(); }
	fail(error: unknown) { this.failure = error; this.done = true; this.wake(); }
	private wake() { for (const waiter of this.waiters) waiter(); this.waiters.clear(); }

	async *iterate(filter: (value: T) => boolean = () => true): AsyncGenerator<T> {
		let index = 0;
		while (true) {
			while (index < this.history.length) {
				const value = this.history[index++];
				if (filter(value)) yield value;
			}
			if (this.done) {
				if (this.failure) throw this.failure;
				return;
			}
			await new Promise<void>((resolve) => this.waiters.add(resolve));
		}
	}
}

export function createAgentStreamResult<TOutput, TInput, TContext>(args: {
	execute: (signal: AbortSignal, emit: (event: AgentEvent) => Promise<void>) => Promise<AgentRunResult<TOutput, TInput, TContext>>;
	parentSignal?: AbortSignal;
}): AgentStreamResult<TOutput, TInput, TContext> {
	const channel = new ReplayChannel<AgentStreamEvent>();
	const controller = new AbortController();
	const onParentAbort = () => controller.abort(args.parentSignal?.reason);
	if (args.parentSignal?.aborted) controller.abort(args.parentSignal.reason);
	else args.parentSignal?.addEventListener("abort", onParentAbort, { once: true });

	const resultPromise = args.execute(controller.signal, async (event) => channel.push(event))
		.then((result) => { channel.push({ type: "result", result }); channel.close(); return result; })
		.catch((error) => { channel.fail(error); throw error; })
		.finally(() => args.parentSignal?.removeEventListener("abort", onParentAbort));
	// A failure also fails the channel, so callers that only iterate a stream still see it. Mark the
	// promise handled: it rejects for callers that await it, and never as an unhandled rejection.
	resultPromise.catch(() => undefined);

	const result: AgentStreamResult<TOutput, TInput, TContext> = {
		then(onfulfilled, onrejected) { return resultPromise.then(onfulfilled, onrejected); },
		getResult: () => resultPromise,
		async getText() { return String((await resultPromise).output ?? ""); },
		getTextStream: async function* () {
			for await (const event of channel.iterate((entry) => entry.type === "response.output_text.delta"))
				yield (event as any).delta as string;
		},
		getReasoningStream: async function* () {
			for await (const event of channel.iterate((entry) => entry.type === "response.reasoning.delta"))
				yield (event as any).delta as string;
		},
		getItemsStream: async function* () {
			for await (const event of channel.iterate((entry) => entry.type === "response.item"))
				yield (event as Extract<AgentEvent, { type: "response.item" }>).item as AgentItem<TOutput>;
		},
		getToolStream: () => channel.iterate((entry) => entry.type.startsWith("tool.")) as AsyncIterable<AgentEvent>,
		getFullStream: () => channel.iterate(),
		async cancel(reason) { controller.abort(reason ?? new Error("Agent stream cancelled")); try { await resultPromise; } catch {} },
	};
	return result;
}

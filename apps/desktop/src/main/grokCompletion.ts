import type { PromptResponse } from "@agentclientprotocol/sdk";

export const grokCompletionMethods = ["x.ai/session/prompt_complete", "_x.ai/session/prompt_complete", "x.ai/session_notification", "_x.ai/session_notification", "_x.ai/session/update"] as const;

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 && value.length <= 1000 ? value : undefined;

/** Match the foreground prompt, never a child session or a background wake turn. */
export class GrokCompletion {
	private pending?: { sessionId: string; promptId: string; finish: (reason: string) => void; fail: (error: Error) => void };
	notify(value: unknown) {
		const payload = record(value); const pending = this.pending;
		if (!payload || !pending || payload.sessionId !== pending.sessionId) return;
		const update = record(payload.update);
		if (update && update.sessionUpdate !== "turn_completed") return;
		const source = update ?? payload;
		const promptId = text(source.prompt_id) ?? text(source.promptId);
		if (!promptId || promptId.startsWith("task-completed-") || promptId !== pending.promptId) return;
		const reason = text(source.stop_reason) ?? text(source.stopReason);
		if (reason === "error") pending.fail(new Error("Grok ended the turn with an error."));
		else if (reason === "rate_limit") pending.fail(new Error("Grok usage limit reached. Try again later."));
		else if (["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"].includes(reason ?? "")) pending.finish(reason!);
		else pending.fail(new Error("Grok returned an unrecognized turn completion."));
	}
	async run(sessionId: string, promptId: string, request: () => Promise<PromptResponse>, signal: AbortSignal): Promise<{ stopReason: string }> {
		if (this.pending) throw new Error("A Grok prompt is already active.");
		if (signal.aborted) throw new Error("Task stopped.");
		let abort!: () => void;
		try {
			return await new Promise<{ stopReason: string }>((resolve, reject) => {
				let settled = false;
				const finish = (reason: string) => { if (settled) return; settled = true; this.pending = undefined; resolve({ stopReason: reason }); };
				const fail = (error: Error) => { if (settled) return; settled = true; this.pending = undefined; reject(error); };
				this.pending = { sessionId, promptId, finish, fail };
				abort = () => fail(new Error("Task stopped."));
				signal.addEventListener("abort", abort, { once: true });
				// Attach both outcomes even when a notification settles first: a late RPC error must not escape.
				void Promise.resolve().then(() => { if (signal.aborted) throw new Error("Task stopped."); return request(); }).then(result => {
					if (["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"].includes(result.stopReason)) finish(result.stopReason);
					else fail(new Error("ACP returned an unrecognized turn completion."));
				}, error => fail(error instanceof Error ? error : new Error("ACP prompt failed.")));
			});
		} finally { signal.removeEventListener("abort", abort); this.pending = undefined; }
	}
}

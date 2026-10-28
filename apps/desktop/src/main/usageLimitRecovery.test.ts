import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { limitResetAt, usageLimitError } from "../shared/usageLimitRecovery";
import { WorkspaceRuntime } from "./workspaceRuntime";

describe("usage-limit errors", () => {
	const now = Date.parse("2026-10-27T12:00:00Z");
	it("recognises Claude and Codex limit messages and reads their reset times", () => {
		expect(usageLimitError("Claude AI usage limit reached|1761580800", now)).toEqual({ resetsAt: 1761580800000 });
		expect(usageLimitError("You've hit your usage limit. Upgrade to Pro or try again in 2 hours 13 minutes.", now)).toEqual({ resetsAt: now + (2 * 60 + 13) * 60_000 });
		expect(usageLimitError("5-hour limit reached ∙ resets 3pm", now)).toEqual({});
		expect(usageLimitError("Claude stopped before completing the turn.", now)).toBeUndefined();
	});

	it("takes the latest reset among exhausted limit windows", () => {
		const window = (usedPercent: number, resetsAt: number) => ({ usedPercent, windowDurationMins: 300, resetsAt });
		const status = { usage: [{ id: "a", name: "Plan", primary: window(100, now / 1000 + 3600), secondary: window(100, now / 1000 + 7200), spendControlReached: null }, { id: "b", name: "Other", primary: window(40, now / 1000 + 60), secondary: null, spendControlReached: null }] };
		expect(limitResetAt(status, now)).toBe(now + 7_200_000);
		expect(limitResetAt({ usage: [{ id: "b", name: "Other", primary: window(40, now / 1000 + 60), secondary: null, spendControlReached: null }] }, now)).toBeUndefined();
	});
});

describe("usage-limit recovery in the runtime", () => {
	it("pauses a limited chat, schedules its resume from the limits data, and offers chats a quit interrupted", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-usage-limit-"));
		let fail = true;
		let release: (() => void) | undefined;
		const adapter = () => ({ run: async () => { if (fail) throw new Error("Claude AI usage limit reached|1900000000"); await new Promise<void>(resolve => { release = resolve; }); }, cancel: async () => { release?.(); } });
		let runtime = new WorkspaceRuntime(directory, adapter);
		try {
			const resetsAt = Date.now() + 3_600_000;
			runtime.usageLimitReset = async () => resetsAt;
			const id = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "code" })).tasks[0].id;
			await runtime.command({ type: "send", id, text: "Fix the build" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("limited"));
			// The unanswered message waits in the queue, and the limits data replaces the error's reset time.
			expect(runtime.store.getTask(id).queue.map(message => message.text)).toEqual(["Fix the build"]);
			await vi.waitFor(() => expect(runtime.store.getTask(id).usageLimit?.resetsAt).toBe(new Date(resetsAt).toISOString()));
			await runtime.command({ type: "resume-at-reset", id });
			expect(runtime.store.getTask(id).usageLimit?.resumeAt).toBe(new Date(resetsAt + 60_000).toISOString());
			await runtime.command({ type: "resume-at-reset", id, cancel: true });
			expect(runtime.store.getTask(id).usageLimit?.resumeAt).toBeUndefined();
			// Continue now sends the queued message; quitting mid-turn marks the chat for the offer.
			fail = false;
			await runtime.command({ type: "resume", id });
			await vi.waitFor(() => expect(release).toBeDefined());
			expect(runtime.store.getTask(id).usageLimit).toBeUndefined();
			await runtime.close();
			runtime = new WorkspaceRuntime(directory, adapter);
			expect(runtime.quitInterrupted()).toEqual([id]);
			expect(runtime.store.getTask(id).error).toBe("Phaseo quit during this turn. Resume to continue.");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);
});

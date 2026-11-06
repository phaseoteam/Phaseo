import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { limitRecoveryPlan, limitResetAt, usageLimitError } from "../shared/usageLimitRecovery";
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

describe("usage limit settings", () => {
	const now = Date.parse("2026-10-27T12:00:00Z"), at = new Date(now - 60_000).toISOString(), reset = now + 3_600_000;
	const limited = (usageLimit: object = {}, extra: object = {}) => ({ status: "limited", usageLimit: { at, resetsAt: new Date(reset).toISOString(), ...usageLimit }, ...extra });
	const both = { autoResumeLimited: true, snoozeLimited: true };
	it("resumes a minute after the reset and snoozes until it, only when each switch is on", () => {
		expect(limitRecoveryPlan(limited(), both, now)).toEqual({ resumeAt: new Date(reset + 60_000).toISOString(), snoozeUntil: new Date(reset).toISOString() });
		expect(limitRecoveryPlan(limited(), { autoResumeLimited: true, snoozeLimited: false }, now)).toEqual({ resumeAt: new Date(reset + 60_000).toISOString() });
		expect(limitRecoveryPlan(limited(), { autoResumeLimited: false, snoozeLimited: true }, now)).toEqual({ snoozeUntil: new Date(reset).toISOString() });
		expect(limitRecoveryPlan(limited(), { autoResumeLimited: false, snoozeLimited: false }, now)).toEqual({});
	});

	it("leaves chats alone that are not limited, have no known or a stale reset, or were already handled", () => {
		expect(limitRecoveryPlan({ ...limited(), status: "failed" }, both, now)).toEqual({});
		expect(limitRecoveryPlan(limited({ resetsAt: undefined }), both, now)).toEqual({});
		expect(limitRecoveryPlan(limited({}, { archived: true }), both, now)).toEqual({});
		// A reset before the stop is an old window, and one over a day ago is left for the person.
		expect(limitRecoveryPlan(limited({ resetsAt: new Date(now - 120_000).toISOString() }), both, now)).toEqual({});
		expect(limitRecoveryPlan(limited({ at: new Date(now - 3 * 86_400_000).toISOString(), resetsAt: new Date(now - 2 * 86_400_000).toISOString() }), both, now)).toEqual({});
		// Already resuming, cancelled by the person, or already snoozed by the setting.
		expect(limitRecoveryPlan(limited({ resumeAt: new Date(reset).toISOString(), snoozed: true }), both, now)).toEqual({});
		expect(limitRecoveryPlan(limited({ resumeCancelled: true }), { autoResumeLimited: true, snoozeLimited: false }, now)).toEqual({});
	});

	it("resumes a reset that has passed right away, but does not snooze it, and waits for the person's own longer snooze", () => {
		const passed = limited({ resetsAt: new Date(now - 30_000).toISOString() });
		expect(limitRecoveryPlan(passed, both, now)).toEqual({ resumeAt: new Date(now + 60_000).toISOString() });
		const later = new Date(reset + 7_200_000).toISOString();
		expect(limitRecoveryPlan(limited({}, { snoozedUntil: later }), both, now)).toEqual({ resumeAt: new Date(reset + 7_200_000 + 60_000).toISOString() });
		expect(limitRecoveryPlan(limited({}, { settledOverride: "settled" }), { autoResumeLimited: false, snoozeLimited: true }, now)).toEqual({});
	});
});

describe("usage-limit recovery in the runtime", () => {
	it("arms the resume and the snooze on its own when the settings are on, and drops the resume when turned off", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-usage-limit-auto-"));
		const adapter = () => ({ run: async () => { throw new Error("Claude AI usage limit reached|1900000000"); }, cancel: async () => {} });
		const runtime = new WorkspaceRuntime(directory, adapter);
		try {
			const resetsAt = Date.now() + 3_600_000;
			runtime.usageLimitReset = async () => resetsAt;
			const preferences = runtime.store.getPreferences();
			runtime.store.savePreferences({ ...preferences, threads: { ...preferences.threads, autoResumeLimited: true, snoozeLimited: true } });
			const id = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "code" })).tasks[0].id;
			// The runtime announces every change; this resolves on the one that arms the resume.
			const armed = new Promise<void>(resolve => { runtime.onChange = () => { if (runtime.store.getTask(id).usageLimit?.resumeAt) resolve(); }; });
			await runtime.command({ type: "send", id, text: "Fix the build" });
			await armed;
			expect(runtime.store.getTask(id).usageLimit?.resumeAt).toBe(new Date(resetsAt + 60_000).toISOString());
			const task = runtime.store.getTask(id);
			expect(task.usageLimit).toMatchObject({ autoResume: true, snoozed: true });
			expect(task.snoozedUntil).toBe(new Date(resetsAt).toISOString());
			expect(Date.parse(task.snoozedAt!)).toBeGreaterThanOrEqual(Date.parse(task.updatedAt));
			runtime.store.savePreferences({ ...preferences, threads: { ...preferences.threads, autoResumeLimited: false, snoozeLimited: true } });
			runtime.limitPreferencesChanged();
			expect(runtime.store.getTask(id).usageLimit?.resumeAt).toBeUndefined();
			// A resume the person asked for in the chat is theirs, and the setting being off does not drop it.
			await runtime.command({ type: "resume-at-reset", id });
			runtime.limitPreferencesChanged();
			expect(runtime.store.getTask(id).usageLimit?.resumeAt).toBe(new Date(resetsAt + 60_000).toISOString());
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

	it("continues a limited chat on another login that has not hit its limit, once, when Switch logins is on", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-usage-limit-switch-"));
		const runs: { accountId?: string; text: string }[] = [];
		const adapter = () => ({ run: async (task: { accountId?: string }, _cwd: string, text: string) => { runs.push({ accountId: task.accountId, text }); if (!task.accountId) throw new Error("Claude AI usage limit reached|1900000000"); }, cancel: async () => {} });
		const runtime = new WorkspaceRuntime(directory, adapter as never);
		try {
			runtime.usageLimitReset = async () => Date.now() + 3_600_000;
			const preferences = runtime.store.getPreferences();
			runtime.store.savePreferences({ ...preferences, threads: { ...preferences.threads, switchLoginOnLimit: true } });
			runtime.store.saveAccount({ id: "work", name: "Work login", harness: "claude", kind: "native", configDirectory: path.join(directory, "accounts", "work"), configured: true });
			const id = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "code" })).tasks[0].id;
			await runtime.command({ type: "update-task", id, title: "Fix the build" });
			const moved = new Promise<string>(resolve => { runtime.onChange = () => { const target = runtime.store.getTask(id).usageLimit?.movedTo; if (target && runtime.store.getTask(target).status === "completed") resolve(target); }; });
			await runtime.command({ type: "send", id, text: "Fix the build" });
			const target = await moved;
			const limited = runtime.store.getTask(id), continued = runtime.store.getTask(target);
			expect(limited).toMatchObject({ status: "limited", queue: [], usageLimit: { movedTo: target, movedToLogin: "Work login" } });
			expect(continued).toMatchObject({ accountId: "work", harness: "claude", title: "Fix the build", parentId: id });
			expect(runs).toEqual([{ accountId: undefined, text: "Fix the build" }, { accountId: "work", text: "Fix the build" }]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	}, 30000);

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

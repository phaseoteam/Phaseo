import { describe, expect, it } from "vitest";
import type { Task, WorkspaceCommand } from "../../shared/workspace";
import { otherLogins, outOfUsage, perMillionPrice, phaseoContinuation } from "../../shared/usageLimitRecovery";
import { continueElsewhere, continuePrompt } from "./continueElsewhere";

const now = Date.parse("2026-11-01T12:00:00Z");
const window = (usedPercent: number, resetsAt: number | null = now / 1000 + 3600) => ({ usedPercent, windowDurationMins: 300, resetsAt });
const status = (usedPercent: number, extra: object = {}) => ({ authenticated: true, usage: [{ id: "plan", name: "Plan", primary: window(usedPercent), secondary: null, spendControlReached: null }], ...extra });

describe("out of usage", () => {
	it("counts a full window that has not reset, a reached spend control, or ordinary use turned off", () => {
		expect(outOfUsage(status(100), now)).toBe(true);
		expect(outOfUsage(status(99), now)).toBe(false);
		expect(outOfUsage({ usage: [{ id: "plan", name: "Plan", primary: window(100, now / 1000 - 60), secondary: null, spendControlReached: null }] }, now)).toBe(false);
		expect(outOfUsage({ usage: [{ id: "plan", name: "Plan", primary: window(100, null), secondary: null, spendControlReached: null }] }, now)).toBe(true);
		expect(outOfUsage({ usage: [{ id: "plan", name: "Plan", primary: null, secondary: null, spendControlReached: true }] }, now)).toBe(true);
		expect(outOfUsage({ ordinaryUsageAllowed: false }, now)).toBe(true);
	});

	it("offers only the agent's other signed-in logins that have usage left and have been read", () => {
		const logins = [
			{ key: "claude", harness: "claude", title: "Claude Code login" },
			{ key: "work", harness: "claude", accountId: "work", title: "Work" },
			{ key: "spent", harness: "claude", accountId: "spent", title: "Spent" },
			{ key: "unread", harness: "claude", accountId: "unread", title: "Unread" },
			{ key: "signed-out", harness: "claude", accountId: "signed-out", title: "Signed out" },
			{ key: "codex", harness: "codex", title: "Codex login" },
		];
		const statuses = { claude: status(100), work: status(20), spent: status(100), "signed-out": { ...status(0), authenticated: false }, codex: status(0) };
		expect(otherLogins({ harness: "claude" }, logins, statuses, now).map(login => login.key)).toEqual(["work"]);
		expect(otherLogins({ harness: "claude", accountId: "work" }, logins, statuses, now)).toEqual([]);
		expect(otherLogins({ harness: "claude", accountId: "spent" }, logins, statuses, now).map(login => login.key)).toEqual(["work"]);
	});
});

describe("the Phaseo offer", () => {
	const catalog = [
		{ id: "openai/gpt-6", name: "GPT-6", default: true, facts: { inputPrice: 2.5, outputPrice: 10 } },
		{ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", facts: { inputPrice: 3, outputPrice: 15 } },
		{ id: "google/gemini-4", name: "Gemini 4" },
	];
	it("keeps the same model when the catalogue lists it, else the person's Phaseo choice, else the default", () => {
		expect(phaseoContinuation("claude-sonnet-4-5", catalog)?.id).toBe("anthropic/claude-sonnet-4.5");
		expect(phaseoContinuation("opus", catalog, "google/gemini-4")?.id).toBe("google/gemini-4");
		expect(phaseoContinuation("opus", catalog)?.id).toBe("openai/gpt-6");
		expect(phaseoContinuation("opus", [])).toBeUndefined();
	});
	it("shows the catalogue's input and output price per million tokens, and no price it does not have", () => {
		const usd = (value: number) => `$${value % 1 ? value.toFixed(2) : value}`;
		expect(perMillionPrice(catalog[1].facts, usd)).toBe("$3/$15 per million tokens");
		expect(perMillionPrice(catalog[0].facts, usd)).toBe("$2.50/$10 per million tokens");
		expect(perMillionPrice({ inputPrice: 0, outputPrice: 0 }, usd)).toBe("free");
		expect(perMillionPrice(undefined, usd)).toBeUndefined();
		expect(perMillionPrice({ inputPrice: 3 }, usd)).toBeUndefined();
	});
});

describe("continuing a limited chat elsewhere", () => {
	const task = (queue: Task["queue"], resumeAt?: string) => ({ id: "limited", mode: "code" as const, projectId: "project", permissionMode: "accept-edits" as const, queue, usageLimit: { at: "2026-11-01T11:00:00Z", ...resumeAt ? { resumeAt } : {} } });
	const runner = () => {
		const sent: WorkspaceCommand[] = [];
		const command = async (value: WorkspaceCommand) => { sent.push(value); return value.type === "handoff" ? { tasks: [{ id: "limited" }, { id: "moved" }] } as never : {} as never; };
		return { sent, command };
	};

	it("hands off, sends the waiting message, and takes it and the scheduled resume off the original", async () => {
		const { sent, command } = runner();
		const moved = await continueElsewhere(command, task([{ id: "q1", text: "Fix the build", createdAt: "" }], "2026-11-01T15:00:00Z"), { harness: "phaseo", accountId: "phaseo-account", model: "anthropic/claude-sonnet-4.5" }, new Set(["limited"]));
		expect(moved).toEqual({ id: "moved", filesLeft: false });
		expect(sent).toEqual([
			{ type: "handoff", id: "limited", harness: "phaseo", model: "anthropic/claude-sonnet-4.5", mode: "code", projectId: "project", accountId: "phaseo-account", permissionMode: "accept-edits" },
			{ type: "send", id: "moved", text: "Fix the build" },
			{ type: "queue-remove", id: "limited", messageId: "q1" },
			{ type: "resume-at-reset", id: "limited", cancel: true },
		]);
	});

	it("asks the new chat to continue when nothing was waiting, and leaves queued files with the original", async () => {
		const { sent, command } = runner();
		expect(await continueElsewhere(command, task([]), { harness: "claude", accountId: "work", model: "opus" }, new Set(["limited"]))).toEqual({ id: "moved", filesLeft: false });
		expect(sent[1]).toEqual({ type: "send", id: "moved", text: continuePrompt });
		const files = runner();
		const attachment = { id: "a", taskId: "limited", name: "log.txt", kind: "text" as const, mimeType: "text/plain", size: 1 };
		expect(await continueElsewhere(files.command, task([{ id: "q1", text: "Read this", attachments: [attachment], createdAt: "" }]), { harness: "claude", accountId: "work", model: "opus" }, new Set(["limited"]))).toEqual({ id: "moved", filesLeft: true });
		expect(files.sent.map(value => value.type)).toEqual(["handoff", "send"]);
	});
});

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultPlaybooks } from "../../shared/factory/intake";
import { emptyStages } from "../../shared/factory/stages";
import type { AgentProfile, Run } from "../../shared/factory/types";
import { agentFor } from "./agents";
import { importLegacyOnce, importLegacyState } from "./persistence";

const agents: AgentProfile[] = [
	agentFor("claude", undefined, { id: "claude-opus-5-5", name: "Claude Opus 5.5" }),
	agentFor("codex", undefined, { id: "gpt-6.1", name: "GPT-6.1", default: true }),
];
const run = (id: string, status: Run["status"], extra: Partial<Run> = {}): Run => ({ id, itemId: "acme/app#3", stage: "fix", agentId: "claude-opus", status, startedAt: 1, log: [], sessionId: "old-session", ...extra });

/** What the old Factory app saved: one repository the old way, hub settings, chats and agent ids of its own. */
const legacy = {
	settings: {
		repo: "acme/app", repoPath: "E:/acme", showRepo: "", hubUrl: "http://127.0.0.1:8317", hubKey: "", hubKeySealed: "sealed", theme: "dark", pollMinutes: 5, independentReview: true,
		agentEfforts: { "claude-opus": "max", "hub-gone": "low" },
		playbooks: { ...defaultPlaybooks(), issue: { ...defaultPlaybooks().issue, agentId: "claude-opus", stageAgents: { review: "codex-default", verify: "claude-haiku" }, rules: [{ id: "r", name: "Docs", match: { labels: ["docs"], priorities: [], authors: [] }, agentId: "codex-gpt-6.1", stageAgents: {}, instructions: "" }] } },
	},
	overlays: {
		"acme/app#3": { assigneeId: "claude-opus", autopilot: { startedAt: 1 }, stages: { ...emptyStages(), fix: { status: "running", agentId: "claude-opus", runId: "run-b" }, triage: { status: "done", agentId: "claude-gone" } } },
	},
	runs: [run("run-b", "running"), run("run-a", "succeeded", { agentId: "claude-gone", stage: "triage" })],
	notes: { "acme/app": [{ id: "n1", text: "Run pnpm test", at: 1, pinned: true }] },
	chats: [{ id: "chat-1" }],
};

describe("importing the old Factory app", () => {
	it("maps its settings, items, runs and notes, with agents matched by harness and model or left unassigned", () => {
		const state = importLegacyState(legacy, agents, 1000)!;
		expect(state.settings.repos).toEqual([{ repo: "acme/app", path: "E:/acme", addedAt: 0 }]);
		expect(state.settings).not.toHaveProperty("hubUrl");
		expect(state.settings).not.toHaveProperty("hubKeySealed");
		expect(state.settings).not.toHaveProperty("theme");
		expect(state).not.toHaveProperty("chats");
		expect(state.settings).toMatchObject({ pollMinutes: 5, independentReview: true, agentEfforts: { "claude:default:claude-opus-5-5": "max" } });
		expect(state.settings.playbooks.issue).toMatchObject({ agentId: "claude:default:claude-opus-5-5", stageAgents: { review: "codex:default:gpt-6.1" }, rules: [{ agentId: "codex:default:gpt-6.1" }] });
		expect(state.settings.playbooks.issue.stageAgents).not.toHaveProperty("verify");
		const overlay = state.overlays["acme/app#3"]!;
		expect(overlay.assigneeId).toBe("claude:default:claude-opus-5-5");
		expect(overlay.autopilot).toBeUndefined();
		// A stage that was going is idle now, and an agent that isn't here is unassigned.
		expect(overlay.stages?.fix).toMatchObject({ status: "idle", agentId: "claude:default:claude-opus-5-5" });
		expect(overlay.stages?.triage).toMatchObject({ status: "done", agentId: undefined });
		// Runs keep their history; the one that was going is stopped and never carried on.
		expect(state.runs.find(entry => entry.id === "run-b")).toMatchObject({ status: "cancelled", carriedOnAt: 1000, finishedAt: 1000, agentId: "claude:default:claude-opus-5-5" });
		expect(state.runs.find(entry => entry.id === "run-a")).toMatchObject({ status: "succeeded", agentId: "claude-gone" });
		expect(state.runs.every(entry => entry.sessionId === undefined)).toBe(true);
		expect(state.notes).toEqual(legacy.notes);
		expect(state.threads).toEqual({});
		expect(importLegacyState(null, agents)).toBeUndefined();
	});

	it("imports once, reads the old files without changing them, and never over saved state", async () => {
		const folder = await mkdtemp(path.join(os.tmpdir(), "phaseo-factory-legacy-"));
		try {
			const file = path.join(folder, "factory.json"), items = path.join(folder, "items.json");
			await writeFile(file, JSON.stringify(legacy));
			await writeFile(items, JSON.stringify({ repos: { "acme/app": { items: [] } } }));
			const before = { text: await readFile(file, "utf8"), modified: (await stat(file)).mtimeMs };
			const saved = new Map<string, string>();
			const store = { factoryState: (key: string) => saved.get(key), saveFactoryState: (entries: Record<string, string>) => { for (const [key, value] of Object.entries(entries)) saved.set(key, value); } };
			expect(await importLegacyOnce(store, folder, async () => agents)).toBe("imported");
			expect(JSON.parse(saved.get("state")!).settings.repos[0].repo).toBe("acme/app");
			expect(JSON.parse(saved.get("items")!)).toEqual({ repos: { "acme/app": { items: [] } } });
			expect(JSON.parse(saved.get("imported")!)).toMatchObject({ found: true });
			expect(await readFile(file, "utf8")).toBe(before.text);
			expect((await stat(file)).mtimeMs).toBe(before.modified);
			// Once is enough.
			saved.set("state", "{}");
			expect(await importLegacyOnce(store, folder, async () => agents)).toBe("skipped");
			expect(saved.get("state")).toBe("{}");
			// No old app: it records that it looked.
			const empty = new Map<string, string>();
			expect(await importLegacyOnce({ factoryState: key => empty.get(key), saveFactoryState: entries => { for (const [key, value] of Object.entries(entries)) empty.set(key, value); } }, path.join(folder, "missing"), async () => agents)).toBe("none");
			expect(empty.has("state")).toBe(false);
			expect(JSON.parse(empty.get("imported")!)).toMatchObject({ found: false });
		} finally {
			await rm(folder, { recursive: true, force: true });
		}
	});
});

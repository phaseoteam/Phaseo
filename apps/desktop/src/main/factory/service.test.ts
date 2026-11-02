import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { threadTools } from "../threadTools";
import { WorkspaceRuntime } from "../workspaceRuntime";
import { WorkspaceStore } from "../workspaceStore";
import { factoryPersistence } from "./persistence";
import { FactoryService } from "./service";
import { FactoryStore } from "./store";

describe("Factory in the desktop", () => {
	it("gives agents list_work_items, read_work_item and run_stage, and starts stages only with full access outside Plan mode", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-factory-service-"));
		const runtime = new WorkspaceRuntime(path.join(directory, "workspace"), () => ({ run: async () => {}, cancel: async () => {} }));
		const service = new FactoryService(runtime, { dataDir: path.join(directory, "factory"), legacyFolder: path.join(directory, "none"), demo: true, broadcast: () => undefined });
		runtime.factoryTools = threadId => service.agentTools(threadId);
		try {
			await service.start();
			const full = (await runtime.command({ type: "create-task", harness: "codex", model: "gpt", mode: "code", permissionMode: "full-access" })).tasks[0]!.id;
			const supervised = (await runtime.command({ type: "create-task", harness: "codex", model: "gpt", mode: "code", permissionMode: "supervised" })).tasks.find(task => task.id !== full)!.id;
			expect(threadTools(runtime.threadTools(full)).map(tool => tool.id)).toEqual(expect.arrayContaining(["list_work_items", "read_work_item", "run_stage"]));
			const tools = runtime.threadTools(full).factory!;
			const issues = await tools.list({ kind: "issue", repository: "phaseo-app/phaseo" });
			expect(issues.total).toBeGreaterThan(0);
			expect(issues.items.every(item => item.kind === "issue" && item.repository === "phaseo-app/phaseo")).toBe(true);
			const issue = issues.items.find(item => item.number === 3117)!;
			const read = await tools.read(issue.id);
			expect(read.stages.map(stage => stage.id)).toEqual(["triage", "reproduce", "fix"]);
			expect(read.agents.length).toBeGreaterThan(0);
			await expect(runtime.threadTools(supervised).factory!.runStage(issue.id, "triage")).rejects.toThrow("full access outside Plan mode");
			await expect(tools.runStage(issue.id, "review")).rejects.toThrow("no review stage");
			const started = await tools.runStage(issue.id, "triage", "claude-sonnet");
			expect(started).toMatchObject({ itemId: issue.id, stage: "triage", agentId: "claude-sonnet" });
			expect((await tools.read(issue.id)).stages[0]).toMatchObject({ status: "running", run: { id: started.runId, status: "running" } });
			await expect(tools.read("someone/else#1")).rejects.toThrow("No such work item");
		} finally { await service.shutdown(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("keeps its state in the workspace database across starts", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-factory-state-"));
		const threads = { ensureParent: async () => "thread", start: async () => ({ send: () => true, stop: () => undefined }) };
		const open = () => {
			const database = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
			const store = new FactoryStore({ dataDir: directory, demo: false, broadcast: () => undefined, persistence: factoryPersistence(database), agents: async () => [], threads });
			return { database, store };
		};
		try {
			const first = open();
			await first.store.load();
			first.store.addNote("@computer", "Git Bash breaks file:// URLs");
			first.store.setThread("acme/app#3", "thread-1");
			await first.store.updateSettings({ pollMinutes: 7 });
			await first.store.shutdown();
			first.database.close();
			const second = open();
			await second.store.load();
			expect(second.store.get().notes["@computer"]![0]).toMatchObject({ text: "Git Bash breaks file:// URLs", pinned: true });
			expect(second.store.get().threads).toEqual({ "acme/app#3": "thread-1" });
			expect(second.store.get().settings.pollMinutes).toBe(7);
			await second.store.shutdown();
			second.database.close();
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});

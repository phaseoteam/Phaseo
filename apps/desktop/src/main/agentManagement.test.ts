import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { validateCommand } from "../shared/workspace";

describe("ACP agent management", () => {
	it("retains task references through archival and protects active command configuration", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-agent-management-")); let finish: (() => void) | undefined;
		const runtime = new WorkspaceRuntime(root, () => ({ run: async () => { await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } }));
		try {
			const state = await runtime.command({ type: "add-agent", name: "Agent", executable: "original", arguments: ["--acp"] }); const agent = state.agents[0];
			const tasks = await runtime.command({ type: "create-task", harness: "acp", agentId: agent.id, mode: "chat", model: "default" }); const task = tasks.tasks[0]; await runtime.command({ type: "send", id: task.id, text: "Start" }); await vi.waitFor(() => expect(finish).toBeDefined());
			await expect(runtime.command({ type: "update-agent", id: agent.id, executable: "replacement" })).rejects.toThrow("running tasks");
			await runtime.command({ type: "update-agent", id: agent.id, name: "Renamed", archived: true }); expect(runtime.store.getTask(task.id).agentId).toBe(agent.id);
			await expect(runtime.command({ type: "create-task", harness: "acp", agentId: agent.id, mode: "chat", model: "default" })).rejects.toThrow("active connected");
			await runtime.command({ type: "cancel", id: task.id }); await vi.waitFor(() => expect(runtime.store.getTask(task.id).status).toBe("interrupted"));
			await runtime.command({ type: "update-agent", id: agent.id, executable: "replacement", arguments: ["--updated"], archived: false }); expect(runtime.store.get().agents[0]).toMatchObject({ name: "Renamed", executable: "replacement", arguments: ["--updated"], archived: false });
		} finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("validates edited command arguments", () => {
		for (const arguments_ of [null, [42], ["bad\0argument"]]) expect(() => validateCommand({ type: "update-agent", id: "agent", arguments: arguments_ })).toThrow("arguments");
		expect(validateCommand({ type: "update-agent", id: "agent", name: "Updated", arguments: ["--acp"] })).toMatchObject({ type: "update-agent" });
	});
});

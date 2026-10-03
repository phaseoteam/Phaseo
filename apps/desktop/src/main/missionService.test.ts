import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { MissionService } from "./missionService";
import type { AgentAdapter } from "./agentAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import { nextMissionRun, validateMissionCommand } from "../shared/missions";

function fixture(run: AgentAdapter["run"] = async () => {}) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-missions-")); const execute = vi.fn(run); const runtime = new WorkspaceRuntime(directory, () => ({ run: execute, cancel: async () => {} })); let now = Date.now(); const service = new MissionService(runtime, () => now); runtime.onChange = state => service.observe(state);
	const template = runtime.store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); template.messages = [{ id: "private-history", role: "user", text: "Old conversation", createdAt: "" }]; template.nativeSessionId = "old-native-session"; runtime.store.saveTask(template);
	const mission = service.command({ type: "save", title: "Recurring research", prompt: "Fresh research instruction", templateTaskId: template.id, schedule: { type: "interval", minutes: 1 } })[0];
	return { directory, runtime, execute, service, template, mission, advance: (milliseconds: number) => { now += milliseconds; }, now: () => now, close: async () => { service.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } };
}
describe("desktop missions", () => {
	it("starts paused and admits one fresh task atomically for each due run", async () => {
		const value = fixture(); try {
			value.advance(120000); value.service.tick(); expect(value.execute).not.toHaveBeenCalled();
			value.service.command({ type: "enable", id: value.mission.id, enabled: true }); value.advance(60000); value.service.tick(); value.service.tick();
			await vi.waitFor(() => expect(value.runtime.store.missions.get(value.mission.id).lastStatus).toBe("completed")); expect(value.execute).toHaveBeenCalledOnce();
			const [task, , text] = value.execute.mock.calls[0]; expect(task.missionId).toBe(value.mission.id); expect(task.nativeSessionId).toBeUndefined(); expect(task.messages.some(message => message.id === "private-history")).toBe(false); expect(text).toBe("Fresh research instruction"); expect(value.runtime.store.missions.get(value.mission.id).lastTaskId).toBe(task.id);
			value.advance(60000); value.service.tick(); await vi.waitFor(() => expect(value.execute).toHaveBeenCalledTimes(2)); expect(value.execute.mock.calls[1][0].id).not.toBe(task.id); expect(value.runtime.store.getTask(value.template.id).nativeSessionId).toBe("old-native-session");
		} finally { await value.close(); }
	});
	it("keeps native approvals interactive and refuses overlapping manual runs", async () => {
		const value = fixture(async (_task, _cwd, _text, callbacks) => { await callbacks.onApproval("file/write", "Owned fixture approval"); }); try {
			value.service.command({ type: "run", id: value.mission.id }); await vi.waitFor(() => expect(value.runtime.store.get().tasks.find(task => task.missionId)?.status).toBe("waiting"));
			expect(() => value.service.command({ type: "run", id: value.mission.id })).toThrow("active task"); expect(value.runtime.store.get().tasks.filter(task => task.missionId)).toHaveLength(1);
			const task = value.runtime.store.get().tasks.find(task => task.missionId)!; await value.runtime.command({ type: "approval", id: task.id, approvalId: task.approvals![0].id, decision: "accept" }); await vi.waitFor(() => expect(value.runtime.store.missions.get(value.mission.id).lastStatus).toBe("completed"));
		} finally { await value.close(); }
	});
	it("pauses after confirmed preflight failure while preserving the instruction for review", async () => {
		const value = fixture(async () => { throw new AgentInputRejectedError("Owned preflight failure"); }); try {
			value.service.command({ type: "enable", id: value.mission.id, enabled: true }); value.advance(60000); value.service.tick(); await vi.waitFor(() => expect(value.runtime.store.missions.get(value.mission.id).enabled).toBe(false));
			const task = value.runtime.store.get().tasks.find(task => task.missionId)!; expect(task.queue[0].text).toBe(value.mission.prompt); value.advance(86400000); value.service.tick(); expect(value.execute).toHaveBeenCalledOnce();
		} finally { await value.close(); }
	});
	it("skips missed runs and rolls back admission if the template is unavailable", async () => {
		const value = fixture(); try {
			value.service.command({ type: "enable", id: value.mission.id, enabled: true }); value.advance(600000); value.service.tick(); expect(value.execute).not.toHaveBeenCalled(); expect(Date.parse(value.runtime.store.missions.get(value.mission.id).nextRunAt!)).toBeGreaterThan(value.now());
			const template = value.runtime.store.getTask(value.template.id); template.archived = true; value.runtime.store.saveTask(template); value.advance(60000); value.service.tick(); expect(value.runtime.store.missions.get(value.mission.id)).toMatchObject({ enabled: false, lastStatus: "failed", runCount: 0 }); expect(value.runtime.store.get().tasks).toHaveLength(1);
		} finally { await value.close(); }
	});
	it("recovers a crash between durable admission and native start without replay", async () => {
		const value = fixture(); let restored: WorkspaceRuntime | undefined; let restoredService: MissionService | undefined; try {
			value.runtime.store.missions.admit(value.mission.id, value.now(), mission => { const task = value.runtime.store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); task.missionId = mission.id; value.runtime.store.saveTask(task); return value.runtime.store.apply({ type: "send", id: task.id, text: mission.prompt }); });
			value.service.close(); await value.runtime.close(); restored = new WorkspaceRuntime(value.directory, () => ({ run: value.execute, cancel: async () => {} })); restoredService = new MissionService(restored, value.now); restoredService.tick(); expect(value.execute).not.toHaveBeenCalled();
			const mission = restored.store.missions.get(value.mission.id); expect(mission.lastStatus).toBe("interrupted"); expect(mission.enabled).toBe(false); expect(restored.store.getTask(mission.lastTaskId!)).toMatchObject({ status: "interrupted", queue: [{ text: value.mission.prompt }] });
		} finally { restoredService?.close(); await restored?.close(); rmSync(value.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
	});
	it("validates intervals and computes the next selected local weekday", () => {
		expect(() => validateMissionCommand({ type: "save", title: "Name", prompt: "Instruction", templateTaskId: "task", schedule: { type: "interval", minutes: 0 } })).toThrow();
		const after = new Date(2026, 9, 5, 10, 0, 0); const next = new Date(nextMissionRun({ type: "daily", time: "09:30", weekdays: [1] }, after.getTime())); expect(next.getDay()).toBe(1); expect(next.getHours()).toBe(9); expect(next.getMinutes()).toBe(30); expect(next.getDate()).toBe(12);
	});
	it("blocks new runs while an older mission task has been resumed", async () => {
		const value = fixture(); try {
			const old = value.runtime.store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); old.missionId = value.mission.id; old.status = "running"; value.runtime.store.saveTask(old);
			expect(() => value.service.command({ type: "run", id: value.mission.id })).toThrow("active task"); value.service.command({ type: "enable", id: value.mission.id, enabled: true }); value.advance(60000); value.service.tick(); expect(value.execute).not.toHaveBeenCalled(); expect(value.runtime.store.missions.get(value.mission.id).enabled).toBe(true); expect(value.runtime.store.get().tasks).toHaveLength(2);
			old.status = "completed"; value.runtime.store.saveTask(old); const fork = value.runtime.store.apply({ type: "fork", id: old.id }); expect(fork.parentId).toBe(old.id); expect(fork.missionId).toBeUndefined();
		} finally { await value.close(); }
	});
});

import type { WorkspaceRuntime } from "./workspaceRuntime";
import type { MissionCommand } from "../shared/missions";
import { nextMissionRun } from "../shared/missions";
import type { Workspace } from "../shared/workspace";

export class MissionService {
	private timer?: ReturnType<typeof setInterval>;
	private closed = false;
	onChange: () => void = () => {};
	constructor(private readonly runtime: WorkspaceRuntime, private readonly clock = Date.now) {
		const now = this.clock();
		for (const mission of runtime.store.missions.list()) {
			if (mission.lastStatus === "running" && mission.lastTaskId) {
				const task = runtime.store.getTask(mission.lastTaskId);
				if (task.status === "idle") { task.status = "interrupted"; task.error = "The application stopped before this mission began. Review before retrying."; runtime.store.saveTask(task); }
			}
			if (mission.enabled && mission.nextRunAt && Date.parse(mission.nextRunAt) <= now) { mission.nextRunAt = nextMissionRun(mission.schedule, now); runtime.store.missions.put(mission); }
		}
		this.observe(runtime.store.get());
	}
	start() { if (!this.closed && !this.timer) { this.timer = setInterval(() => this.tick(), 1000); this.timer.unref(); } }
	close() { this.closed = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; }
	command(command: MissionCommand) {
		if (this.closed) throw new Error("The workspace is shutting down."); const store = this.runtime.store.missions; const now = this.clock();
		if (command.type === "save") { const template = this.runtime.store.getTask(command.templateTaskId); if (template.archived) throw new Error("Choose an active template task."); store.save(command, now); }
		else if (command.type === "delete") store.delete(command.id);
		else if (command.type === "enable") { const mission = store.get(command.id); mission.enabled = command.enabled; mission.nextRunAt = command.enabled ? nextMissionRun(mission.schedule, now) : undefined; mission.error = undefined; mission.updatedAt = new Date(now).toISOString(); store.put(mission); }
		else this.runtime.startMission(command.id, now);
		this.onChange(); return store.list();
	}
	observe(workspace: Workspace) {
		if (this.closed) return; let changed = false;
		for (const mission of this.runtime.store.missions.list()) {
			if (!mission.lastTaskId) continue;
			const task = workspace.tasks.find(value => value.id === mission.lastTaskId);
			if (task && (task.status === "running" || task.status === "waiting") && mission.lastStatus !== "running") { mission.lastStatus = "running"; mission.error = undefined; this.runtime.store.missions.put(mission); changed = true; continue; }
			if (mission.lastStatus !== "running") continue;
			if (!task || !["completed", "failed", "interrupted", "limited"].includes(task.status)) continue;
			mission.lastStatus = task.status as "completed" | "failed" | "interrupted" | "limited"; mission.error = task.error; mission.updatedAt = new Date(this.clock()).toISOString();
			if (task.status !== "completed") { mission.enabled = false; mission.nextRunAt = undefined; }
			this.runtime.store.missions.put(mission); changed = true;
		}
		if (changed) this.onChange();
	}
	tick() {
		if (this.closed) return;
		try {
			this.observe(this.runtime.store.get()); const now = this.clock();
			for (const mission of this.runtime.store.missions.list()) {
				if (!mission.enabled || !mission.nextRunAt || Date.parse(mission.nextRunAt) > now) continue;
				if (mission.lastStatus === "running" || this.runtime.store.get().tasks.some(task => task.missionId === mission.id && (task.status === "running" || task.status === "waiting")) || now - Date.parse(mission.nextRunAt) > 60000) { mission.nextRunAt = nextMissionRun(mission.schedule, now); this.runtime.store.missions.put(mission); this.onChange(); continue; }
				try { this.runtime.startMission(mission.id, now); }
				catch (error) { const current = this.runtime.store.missions.get(mission.id); current.enabled = false; current.nextRunAt = undefined; current.lastStatus = "failed"; current.error = error instanceof Error ? error.message : "Mission could not start."; this.runtime.store.missions.put(current); }
				this.onChange();
			}
		} catch { /* A scheduler failure must never cause untracked replay or interrupt other tasks. */ }
	}
}

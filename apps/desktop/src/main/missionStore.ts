import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Mission, MissionCommand } from "../shared/missions";
import { nextMissionRun } from "../shared/missions";
import type { Task } from "../shared/workspace";

export class MissionStore {
	constructor(private readonly db: DatabaseSync) { db.exec("CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, data TEXT NOT NULL)"); }
	list(): Mission[] { return this.db.prepare("SELECT data FROM missions").all().map(row => JSON.parse(row.data as string) as Mission).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
	get(id: string): Mission { const row = this.db.prepare("SELECT data FROM missions WHERE id=?").get(id); if (!row) throw new Error("Mission no longer exists."); return JSON.parse(row.data as string) as Mission; }
	put(mission: Mission) { this.db.prepare("INSERT INTO missions (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(mission.id, JSON.stringify(mission)); }
	save(command: Extract<MissionCommand, { type: "save" }>, now: number) {
		const existing = command.id ? this.get(command.id) : undefined; if (existing?.lastStatus === "running") throw new Error("Stop this mission's active task before editing it.");
		const timestamp = new Date(now).toISOString(); const mission: Mission = { ...existing, id: existing?.id ?? randomUUID(), title: command.title, prompt: command.prompt, templateTaskId: command.templateTaskId, schedule: command.schedule, enabled: existing?.enabled ?? false, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, lastStatus: existing?.lastStatus ?? "never", runCount: existing?.runCount ?? 0, error: undefined };
		mission.nextRunAt = mission.enabled ? nextMissionRun(mission.schedule, now) : undefined; this.put(mission); return mission;
	}
	delete(id: string) { const mission = this.get(id); if (mission.lastStatus === "running") throw new Error("Stop this mission's active task before deleting it."); this.db.prepare("DELETE FROM missions WHERE id=?").run(id); }
	admit(id: string, now: number, create: (mission: Mission) => Task): Task {
		this.db.exec("BEGIN IMMEDIATE");
		try { const mission = this.get(id); if (mission.lastStatus === "running") throw new Error("This mission already has an active task."); const task = create(mission); mission.lastTaskId = task.id; mission.lastRunAt = new Date(now).toISOString(); mission.updatedAt = mission.lastRunAt; mission.lastStatus = "running"; mission.runCount++; mission.error = undefined; mission.nextRunAt = mission.enabled ? nextMissionRun(mission.schedule, now) : undefined; this.put(mission); this.db.exec("COMMIT"); return task; }
		catch (error) { this.db.exec("ROLLBACK"); throw error; }
	}
}

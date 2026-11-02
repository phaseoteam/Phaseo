// The work tracker's scheduled automation: SLA watch and ambient follow-ups. Each is a no-op unless
// its env flag is "true" (WORK_SLA_WATCH_ENABLED, WORK_AMBIENT_ENABLED; both default off), and
// ambient also needs the workspace's ambient_enabled setting. With both flags off nothing is read.

import type { Env } from "@/env";
import { ambientEnabled, runAmbientFollowUps, type AmbientSummary } from "./ambient";
import type { DataClient } from "./items";
import { runSlaWatch, slaWatchEnabled, type SlaWatchSummary } from "./slaWatch";

/** SLA watch runs every 15 minutes (minute 5, 20, 35, 50 of the hour); ambient once an hour, at minute 35. */
export const WORK_JOB_EVERY_MINUTES = 15;
export const WORK_JOB_MINUTE_OFFSET = 5;
export const WORK_AMBIENT_MINUTE = 35;

export type WorkAutomationSummary = { sla: SlaWatchSummary | null; ambient: AmbientSummary | null };

export function workAutomationEnabled(env: Pick<Env, "WORK_AMBIENT_ENABLED" | "WORK_SLA_WATCH_ENABLED">): boolean {
	return ambientEnabled(env) || slaWatchEnabled(env);
}

/** Which jobs are due at this minute (the Worker's cron fires every minute). */
export function dueWorkJobs(at: Date): { sla: boolean; ambient: boolean } {
	const minute = at.getUTCMinutes();
	return {
		sla: minute % WORK_JOB_EVERY_MINUTES === WORK_JOB_MINUTE_OFFSET,
		ambient: minute === WORK_AMBIENT_MINUTE,
	};
}

export async function runWorkAutomation(args: {
	env: Pick<Env, "WORK_AMBIENT_ENABLED" | "WORK_SLA_WATCH_ENABLED">;
	client: DataClient;
	now: Date;
	jobs?: { sla: boolean; ambient: boolean };
}): Promise<WorkAutomationSummary> {
	const jobs = args.jobs ?? dueWorkJobs(args.now);
	const summary: WorkAutomationSummary = { sla: null, ambient: null };
	if (jobs.sla && slaWatchEnabled(args.env)) {
		try {
			summary.sla = await runSlaWatch({ env: args.env, client: args.client, now: args.now });
		} catch (error) {
			console.error("work_sla_watch_failed", error instanceof Error ? error.message : String(error));
		}
	}
	if (jobs.ambient && ambientEnabled(args.env)) {
		try {
			summary.ambient = await runAmbientFollowUps({ env: args.env, client: args.client, now: args.now });
		} catch (error) {
			console.error("work_ambient_failed", error instanceof Error ? error.message : String(error));
		}
	}
	return summary;
}

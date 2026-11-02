import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";
import { dueWorkJobs, runWorkAutomation, workAutomationEnabled } from "@/work/scheduled";

// The work tracker's SLA watch (every 15 minutes) and ambient follow-ups (hourly), on the Worker's
// every-minute cron. Both are off unless WORK_SLA_WATCH_ENABLED / WORK_AMBIENT_ENABLED are "true";
// while they are off this returns before touching the database.
export async function handleWorkScheduledEvent(event: ScheduledController, env: Env): Promise<void> {
	if (!workAutomationEnabled(env)) return;
	const now = new Date(event.scheduledTime);
	const jobs = dueWorkJobs(now);
	if (!jobs.sla && !jobs.ambient) return;
	try {
		const summary = await runWorkAutomation({ env, client: getDataClient(env), now, jobs });
		if ((summary.sla?.warned ?? 0) > 0 || (summary.ambient?.stalled ?? 0) > 0) console.log("work_automation_completed", summary);
	} catch (error) {
		console.error("work_automation_failed", error instanceof Error ? error.message : String(error));
	}
}

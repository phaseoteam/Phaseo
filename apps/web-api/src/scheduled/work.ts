import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";
import { snapshotCycleDays, utcDate } from "@/work/cycles";
import { workEmailEnabled } from "@/work/email";
import { DIGEST_EVERY_MINUTES, runNotificationDigest } from "@/work/emailDigest";
import { runRecurrences } from "@/work/extras";
import { runWebhooks } from "@/work/webhooks";
import { dueWorkJobs, runWorkAutomation, workAutomationEnabled } from "@/work/scheduled";

/** Cycle burn-up snapshots: once an hour, at this minute, for every running cycle (one database statement). */
export const WORK_CYCLE_SNAPSHOT_MINUTE = 50;
/** Notification digests run every DIGEST_EVERY_MINUTES, at this offset (minute 2, 12, 22, ...). */
export const WORK_DIGEST_MINUTE_OFFSET = 2;
/** Recurring items are made every 5 minutes (minute 3, 8, 13, ...). */
export const WORK_RECURRENCE_EVERY_MINUTES = 5;
export const WORK_RECURRENCE_MINUTE_OFFSET = 3;

// The work tracker's jobs on the Worker's every-minute cron:
// * cycle snapshots (hourly): each running cycle's totals for the day, for its burn-up chart. Always on;
//   it only records totals the cycle page already shows.
// * webhooks (every minute): new item events to each enabled webhook. Only webhooks admins made send anything.
// * recurring items (every 5 minutes): items made from templates on their schedule. Always on; only
//   recurrences people set up make anything.
// * notification digests (every 10 minutes): off unless WORK_EMAIL_ENABLED is "true".
// * SLA watch (every 15 minutes) and ambient follow-ups (hourly): off unless WORK_SLA_WATCH_ENABLED /
//   WORK_AMBIENT_ENABLED are "true"; while they are off nothing is read for them.
export async function handleWorkScheduledEvent(event: ScheduledController, env: Env): Promise<void> {
	const now = new Date(event.scheduledTime);
	if (now.getUTCMinutes() === WORK_CYCLE_SNAPSHOT_MINUTE) {
		const recorded = await snapshotCycleDays(getDataClient(env), utcDate(now));
		if (recorded === null) console.error("work_cycle_snapshot_failed");
	}
	try {
		const sent = await runWebhooks({ env, client: getDataClient(env), now });
		if (sent.delivered || sent.failed) console.log("work_webhooks_completed", sent);
	} catch (error) {
		console.error("work_webhooks_failed", error instanceof Error ? error.message : String(error));
	}
	if (now.getUTCMinutes() % WORK_RECURRENCE_EVERY_MINUTES === WORK_RECURRENCE_MINUTE_OFFSET) {
		try {
			const made = await runRecurrences(getDataClient(env), now);
			if (made.created || made.failed) console.log("work_recurrences_completed", made);
		} catch (error) {
			console.error("work_recurrences_failed", error instanceof Error ? error.message : String(error));
		}
	}
	if (now.getUTCMinutes() % DIGEST_EVERY_MINUTES === WORK_DIGEST_MINUTE_OFFSET && workEmailEnabled(env)) {
		try {
			const digest = await runNotificationDigest({ env, client: getDataClient(env), now, origin: env.PHASEO_WEB_ORIGIN?.trim() || undefined });
			if (digest.emailed || digest.failed) console.log("work_digest_completed", digest);
		} catch (error) {
			console.error("work_digest_failed", error instanceof Error ? error.message : String(error));
		}
	}
	if (!workAutomationEnabled(env)) return;
	const jobs = dueWorkJobs(now);
	if (!jobs.sla && !jobs.ambient) return;
	try {
		const summary = await runWorkAutomation({ env, client: getDataClient(env), now, jobs });
		if ((summary.sla?.warned ?? 0) > 0 || (summary.ambient?.stalled ?? 0) > 0) console.log("work_automation_completed", summary);
	} catch (error) {
		console.error("work_automation_failed", error instanceof Error ? error.message : String(error));
	}
}

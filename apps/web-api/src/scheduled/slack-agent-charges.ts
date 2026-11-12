import type { Env } from "@/env";
import { chargeSlackAgentMonths } from "@/billing/slackAgentCharges";
import { getDataClient } from "@/data/supabase";
import { emitLogs, telemetryConfig } from "../../../../packages/shared/observability/index.mjs";

// The cron fires every minute; charging (and retrying months waiting for
// credits) once an hour is plenty.
const RUN_AT_MINUTE = 17;

export async function handleSlackAgentChargesScheduledEvent(event: ScheduledController, env: Env): Promise<void> {
	if (new Date(event.scheduledTime).getUTCMinutes() !== RUN_AT_MINUTE) return;
	const started = Date.now();
	let failed = 0;
	try {
		const summary = await chargeSlackAgentMonths(getDataClient(env), new Date(event.scheduledTime));
		failed = summary.failed;
		if (summary.due > 0) console.log("slack_agent_charges_completed", summary);
	} catch (error) {
		failed++;
		console.error("slack_agent_charges_failed", error instanceof Error ? error.message : String(error));
	}
	await emitLogs(telemetryConfig(env, "phaseo-web-api"), [{ event_name: "job.run", job: "slack_agent_charges", outcome: failed ? "error" : "completed", actionable: failed > 0, failed_count: failed, duration_ms: Date.now() - started, scheduled_at: event.scheduledTime }]);
}

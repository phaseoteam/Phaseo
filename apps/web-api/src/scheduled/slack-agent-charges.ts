import type { Env } from "@/env";
import { chargeSlackAgentMonths } from "@/billing/slackAgentCharges";
import { getDataClient } from "@/data/supabase";

// The cron fires every minute; charging (and retrying months waiting for
// credits) once an hour is plenty.
const RUN_AT_MINUTE = 17;

export async function handleSlackAgentChargesScheduledEvent(event: ScheduledController, env: Env): Promise<void> {
	if (new Date(event.scheduledTime).getUTCMinutes() !== RUN_AT_MINUTE) return;
	try {
		const summary = await chargeSlackAgentMonths(getDataClient(env), new Date(event.scheduledTime));
		if (summary.due > 0) console.log("slack_agent_charges_completed", summary);
	} catch (error) {
		console.error("slack_agent_charges_failed", error instanceof Error ? error.message : String(error));
	}
}

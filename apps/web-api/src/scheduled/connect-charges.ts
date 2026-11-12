import type { Env } from "@/env";
import { chargeConnectMonths } from "@/billing/connectCharges";
import { getDataClient } from "@/data/supabase";

// The cron fires every minute; charging (and retrying months waiting for
// credits) once an hour is plenty. A different minute from the Slack charge.
const RUN_AT_MINUTE = 23;

export async function handleConnectChargesScheduledEvent(event: ScheduledController, env: Env): Promise<void> {
	if (new Date(event.scheduledTime).getUTCMinutes() !== RUN_AT_MINUTE) return;
	try {
		const summary = await chargeConnectMonths(getDataClient(env), new Date(event.scheduledTime));
		if (summary.due > 0) console.log("connect_charges_completed", summary);
	} catch (error) {
		console.error("connect_charges_failed", error instanceof Error ? error.message : String(error));
	}
}

import { emitLogs, telemetryConfig, type PlatformEvent } from "../../../../packages/shared/observability/index.mjs";
import type { GatewayBindings } from "@/runtime/env";

export function createJobObserver(env: GatewayBindings, scheduledTime: number) {
	const events: PlatformEvent[] = [];
	return {
		async run<T>(job: string, execute: () => Promise<T>, enabled = true): Promise<T> {
			const started = Date.now();
			let outcome = enabled ? "completed" : "skipped";
			try { return await execute(); }
			catch (error) { outcome = "error"; throw error; }
			finally {
				events.push({ event_name: "job.run", job, outcome, actionable: outcome === "error", duration_ms: Date.now() - started, scheduled_at: scheduledTime });
			}
		},
		async flush() {
			try {
				const config = telemetryConfig(env, "phaseo-jobs");
				events.push({ event_name: "job.heartbeat", outcome: "success", scheduled_at: scheduledTime });
				for (let offset = 0; offset < events.length; offset += 32) await emitLogs(config, events.slice(offset, offset + 32));
			} catch { /* Monitoring must not change cron execution. */ }
		},
	};
}

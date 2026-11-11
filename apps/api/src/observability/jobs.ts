import { emitLogs, safeError, telemetryConfig, type PlatformEvent } from "../../../../packages/shared/observability/index.mjs";
import type { GatewayBindings } from "@/runtime/env";

export function createJobObserver(env: GatewayBindings, scheduledTime: number) {
	const events: PlatformEvent[] = [];
	return {
		async run<T>(job: string, execute: () => Promise<T>, enabled = true): Promise<T> {
			const started = Date.now();
			let outcome = enabled ? "completed" : "skipped";
			let diagnostic: PlatformEvent = {};
			try { return await execute(); }
			catch (error) {
				outcome = "error";
				diagnostic = safeError(error);
				// RPC messages and details can contain customer data; export only a database code.
				const cause = error instanceof Error ? error.cause : null;
				if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
					&& /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(cause.code)) diagnostic.error_code = cause.code;
				throw error;
			}
			finally {
				events.push({ ...diagnostic, event_name: "job.run", job, outcome, actionable: outcome === "error", duration_ms: Date.now() - started, scheduled_at: scheduledTime });
			}
		},
		async flush() {
			try {
				const config = telemetryConfig(env, "phaseo-jobs");
				config.release ??= env.CF_VERSION_METADATA?.id;
				for (const event of events) event.release = config.release;
				events.push({ event_name: "job.heartbeat", outcome: "success", scheduled_at: scheduledTime });
				for (let offset = 0; offset < events.length; offset += 32) await emitLogs(config, events.slice(offset, offset + 32));
			} catch { /* Monitoring must not change cron execution. */ }
		},
	};
}

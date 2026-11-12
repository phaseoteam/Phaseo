import type { Env } from "@/env";
import { emitLogs, telemetryConfig } from "../../../../packages/shared/observability/index.mjs";
import { notifyPendingProviderModels } from "@/lib/provider-model-notifications";
import { activateDueProviderCatalogReleases, runProviderCatalogPollingJob } from "@/routes/account/provider-catalog-sync";

export async function handleProviderCatalogScheduledEvent(_event: ScheduledController, env: Env, executionCtx: ExecutionContext): Promise<void> {
	const started = Date.now();
	let failed = 0;
	let released = 0;
	try {
		released = await activateDueProviderCatalogReleases(env);
	} catch (error) {
		failed++;
		console.error("provider_catalog_release_activation_failed", error instanceof Error ? error.message : String(error));
	}
	try {
		const summary = await runProviderCatalogPollingJob(env, 20, executionCtx);
		failed += summary.failed;
		console.log("provider_catalog_poll_completed", { ...summary, released });
	} catch (error) {
		failed++;
		console.error("provider_catalog_poll_failed", error instanceof Error ? error.message : String(error));
	}
	await notifyPendingProviderModels(env).catch(() => { failed++; console.error("provider_model_notification_failed"); });
	await emitLogs(telemetryConfig(env, "phaseo-web-api"), [{ event_name: "job.run", job: "provider_catalog_poll", outcome: failed ? "error" : "completed", actionable: failed > 0, failed_count: failed, duration_ms: Date.now() - started, scheduled_at: _event.scheduledTime }]);
}

import type { Env } from "@/env";
import { activateDueProviderCatalogReleases, runProviderCatalogPollingJob } from "@/routes/account/provider-catalog-sync";

export async function handleProviderCatalogScheduledEvent(_event: ScheduledController, env: Env): Promise<void> {
	try {
		const released = await activateDueProviderCatalogReleases(env);
		const summary = await runProviderCatalogPollingJob(env);
		console.log("provider_catalog_poll_completed", { ...summary, released });
	} catch (error) {
		console.error("provider_catalog_poll_failed", error instanceof Error ? error.message : String(error));
	}
}

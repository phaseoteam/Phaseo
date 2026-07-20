import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { batchApiFlag } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import WebhooksSettingsClient, {
	type WebhookEndpoint,
} from "@/components/(gateway)/settings/webhooks/WebhooksSettingsClient";

export const metadata = {
	title: "Webhooks - Settings",
};

export default async function WebhooksSettingsPage() {
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
					Webhooks
				</h1>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<WebhooksSettingsContent />
			</Suspense>
		</main>
	);
}

async function WebhooksSettingsContent() {
	if (!(await batchApiFlag())) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Webhook settings are currently limited to the enabled Batch API segment.
			</div>
		);
	}

	const { accessToken, workspaceId } = await getServerAccountContext();

	if (!accessToken || !workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage webhooks.
			</div>
		);
	}
	const { endpoints } = await fetchAccountWebApi<{ endpoints: WebhookEndpoint[] }>(
		`/api/account/settings/webhooks?workspaceId=${encodeURIComponent(workspaceId)}`,
		accessToken,
	);

	return <WebhooksSettingsClient endpoints={endpoints} />;
}

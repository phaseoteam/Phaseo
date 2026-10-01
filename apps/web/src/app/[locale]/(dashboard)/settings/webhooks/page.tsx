import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { batchApiFlag } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import WebhooksSettingsClient, {
	type WebhookEndpoint,
} from "@/components/(gateway)/settings/webhooks/WebhooksSettingsClient";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("webhooks") };
}

export default async function WebhooksSettingsPage() {
	const t = await getTranslations("SettingsUI.settingsPageCopy");
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
					{t("webhooksTitle")}
				</h1>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<WebhooksSettingsContent />
			</Suspense>
		</main>
	);
}

async function WebhooksSettingsContent() {
	const t = await getTranslations("SettingsUI.settingsPageCopy");
	if (!(await batchApiFlag())) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("webhooksBatchApiLimit")}
			</div>
		);
	}

	const { accessToken, workspaceId } = await getServerAccountContext();

	if (!accessToken || !workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("webhooksWorkspace")}
			</div>
		);
	}
	const { endpoints } = await fetchAccountWebApi<{ endpoints: WebhookEndpoint[] }>(
		`/api/account/settings/webhooks?workspaceId=${encodeURIComponent(workspaceId)}`,
		accessToken,
	);

	return <WebhooksSettingsClient endpoints={endpoints} />;
}

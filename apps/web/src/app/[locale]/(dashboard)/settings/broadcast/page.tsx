import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastSettingsClient from "@/components/(gateway)/settings/observability/BroadcastSettingsClient";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { fetchSettingsBroadcastInitialData } from "@/lib/fetchers/internal/fetchSettingsBroadcastInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("broadcast") };
}

export default async function BroadcastSettingsPage() {
	const t = await getTranslations("SettingsUI");
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
						{t("headers.broadcast")}
					</h1>
					<ProductFeedbackButton
						surface="settings_broadcast"
						prompt={t("headers.feedbackBroadcastPrompt")}
					/>
				</div>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastSettingsContent />
			</Suspense>
		</main>
	);
}

async function BroadcastSettingsContent() {
	const t = await getTranslations("SettingsUI");
	const initialData = await fetchSettingsBroadcastInitialData();

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("headers.broadcastWorkspaceRequired")}
			</div>
		);
	}

	return (
		<BroadcastSettingsClient
			teamName={initialData.teamName}
			configuredDestinations={initialData.configuredDestinations}
		/>
	);
}

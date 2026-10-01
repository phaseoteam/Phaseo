import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsRoutingInitialData } from "@/lib/fetchers/internal/fetchSettingsRoutingInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.routing")} - ${t("headers.settings")}` };
}

export default function RoutingSettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Routing"
				titleKey="headers.routing"
				description="Set the workspace defaults used when a request does not match a dynamic route."
				descriptionKey="headers.routingDescription"
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<RoutingSettingsContent />
			</Suspense>
		</div>
	);
}

async function RoutingSettingsContent() {
	const [initialData, t] = await Promise.all([fetchSettingsRoutingInitialData(), getTranslations("SettingsUI")]);

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("settingsPageCopy.routingWorkspace")}
			</div>
		);
	}

	return (
		<RoutingSettingsClient
			initialMode={initialData.routingMode}
			initialBetaChannelEnabled={initialData.betaChannelEnabled}
			initialAlphaChannelEnabled={initialData.alphaChannelEnabled}
			initialResponseHealingEnabled={initialData.responseHealingEnabled}
			initialResponseHealingLocked={initialData.responseHealingLocked}
			initialResponseHealingMode={initialData.responseHealingMode}
			teamName={initialData.teamName}
		/>
	);
}

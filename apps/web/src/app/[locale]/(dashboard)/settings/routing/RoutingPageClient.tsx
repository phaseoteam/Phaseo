"use client";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsRoutingInitialData } from "@/lib/fetchers/internal/settingsTypes";


export default function RoutingSettingsPage() {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("headers.routing")}
				description={t("headers.routingDescription")}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<RoutingSettingsContent />
			</Suspense>
		</div>
	);
}

const RoutingSettingsContent = withSettingsResource("routing", function RoutingSettingsContent({ initialData }: { initialData: SettingsRoutingInitialData }) {
	const t = useTranslations("SettingsUI");

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
});

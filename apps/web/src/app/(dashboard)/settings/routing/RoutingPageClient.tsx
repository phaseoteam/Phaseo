"use client";
import { Suspense } from "react";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsRoutingInitialData } from "@/lib/fetchers/internal/settingsTypes";


export default function RoutingSettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Routing"
				description="Set the workspace defaults used when a request does not match a dynamic route."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<RoutingSettingsContent />
			</Suspense>
		</div>
	);
}

const RoutingSettingsContent = withSettingsResource("routing", function RoutingSettingsContent({ initialData }: { initialData: SettingsRoutingInitialData }) {

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage routing preferences.
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

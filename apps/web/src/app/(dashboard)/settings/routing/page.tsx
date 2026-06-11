import { Suspense } from "react";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { fetchSettingsRoutingInitialData } from "@/lib/fetchers/internal/fetchSettingsRoutingInitialData";

export const metadata = {
	title: "Routing - Settings",
};

export default function RoutingSettingsPage() {
	return (
		<div className="space-y-6">
			<header>
				<h1 className="text-2xl font-bold">Routing</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Tune how the Gateway balances cost, latency, and throughput when
					selecting providers.
				</p>
			</header>
			<Suspense fallback={<SettingsSectionFallback />}>
				<RoutingSettingsContent />
			</Suspense>
		</div>
	);
}

async function RoutingSettingsContent() {
	const initialData = await fetchSettingsRoutingInitialData();

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
}

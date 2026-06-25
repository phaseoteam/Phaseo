import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastSettingsClient from "@/components/(gateway)/settings/observability/BroadcastSettingsClient";
import { fetchSettingsBroadcastInitialData } from "@/lib/fetchers/internal/fetchSettingsBroadcastInitialData";

export const metadata = {
	title: "Broadcast - Settings",
};

export default async function BroadcastSettingsPage() {
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
						Broadcast
					</h1>
				</div>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastSettingsContent />
			</Suspense>
		</main>
	);
}

async function BroadcastSettingsContent() {
	const initialData = await fetchSettingsBroadcastInitialData();

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage broadcast settings.
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

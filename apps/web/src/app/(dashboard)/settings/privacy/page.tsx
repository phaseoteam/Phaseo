import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import PrivacySettingsClient from "@/components/(gateway)/settings/privacy/PrivacySettingsClient";
import { fetchSettingsPrivacyInitialData } from "@/lib/fetchers/internal/fetchSettingsPrivacyInitialData";
import { gatewayIoLoggingFlag } from "@/lib/flags";

export const metadata = {
	title: "Privacy - Settings",
};

export default function PrivacySettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Privacy"
				description="Configure privacy defaults and provider restrictions for your workspace."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<PrivacySettingsContent />
			</Suspense>
		</div>
	);
}

async function PrivacySettingsContent() {
	const [initialData, ioLoggingFeatureEnabled] = await Promise.all([
		fetchSettingsPrivacyInitialData(),
		gatewayIoLoggingFlag(),
	]);

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage privacy settings.
			</div>
		);
	}

	return (
		<PrivacySettingsClient
			teamName={initialData.teamName}
			initialGlobal={initialData.initialGlobal}
			providers={initialData.providers}
			activeProviderModels={initialData.activeProviderModels}
			ioLoggingFeatureEnabled={ioLoggingFeatureEnabled}
		/>
	);
}

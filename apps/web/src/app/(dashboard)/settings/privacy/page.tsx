import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountPrivacySettingsClient from "@/components/(gateway)/settings/account/AccountPrivacySettingsClient";
import { DataContributionSettingsCard } from "@/components/(gateway)/settings/privacy/DataContributionSettingsCard";
import { fetchSettingsPrivacyInitialData } from "@/lib/fetchers/internal/fetchSettingsPrivacyInitialData";

export const metadata = {
	title: "Privacy - Settings",
};

export default function PrivacySettingsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Privacy"
				description="Set data handling, log storage, and route access for every request in this workspace."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<PrivacySettingsContent />
			</Suspense>
		</div>
	);
}

async function PrivacySettingsContent() {
	const initialData = await fetchSettingsPrivacyInitialData();

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to manage privacy settings.
			</div>
		);
	}

	return (
		<div className="space-y-8">
		<AccountPrivacySettingsClient
			policy={initialData.policy}
			providers={initialData.providers}
			models={initialData.models}
			workspaceId={initialData.workspaceId}
			workspaceLogStorage={{
				enabled: initialData.initialGlobal?.io_logging_enabled === true,
				retentionDays: Math.max(90, Math.min(365, Number(initialData.initialGlobal?.io_logging_retention_days ?? 90))),
				includeProviderPayloads: initialData.initialGlobal?.io_logging_include_provider_payloads !== false,
			}}
		/>
		{initialData.dataContribution.available ? (
			<DataContributionSettingsCard initial={initialData.dataContribution} />
		) : null}
		</div>
	);
}

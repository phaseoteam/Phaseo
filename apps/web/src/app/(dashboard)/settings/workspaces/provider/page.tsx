import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import ProviderWorkspaceClient from "@/components/(gateway)/settings/workspaces/ProviderWorkspaceClient";
import { fetchSettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/fetchSettingsProviderOnboardingInitialData";

export const metadata = { title: "Provider - Workspace Settings" };

export default function WorkspaceProviderPage() {
	return <div className="space-y-6"><SettingsPageHeader title="Provider" description="Manage provider identity and catalog delivery for the active workspace." /><Suspense fallback={<SettingsSectionFallback />}><WorkspaceProviderContent /></Suspense></div>;
}

async function WorkspaceProviderContent() {
	const initialData = await fetchSettingsProviderOnboardingInitialData();
	return <ProviderWorkspaceClient initialData={initialData} />;
}

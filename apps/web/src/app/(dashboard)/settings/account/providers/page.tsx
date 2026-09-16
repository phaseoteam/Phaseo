import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import ProviderOnboardingClient from "@/components/(gateway)/settings/account/ProviderOnboardingClient";
import { fetchSettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/fetchSettingsProviderOnboardingInitialData";

export const metadata = { title: "Provider catalog - Phaseo" };

export default function ProviderOnboardingPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><ProviderOnboardingContent /></Suspense>;
}

async function ProviderOnboardingContent() {
	const initialData = await fetchSettingsProviderOnboardingInitialData();
	const hasCatalog = (initialData.catalogProviders ?? initialData.linkedProviders).length > 0;
	return <div className="space-y-6"><SettingsPageHeader title={hasCatalog ? "Provider catalog" : "Become a provider"} description={hasCatalog ? "Manage the models you support on the gateway." : "Connect your provider account. Your personal workspace is managed automatically."} /><ProviderOnboardingClient initialData={initialData} /></div>;
}

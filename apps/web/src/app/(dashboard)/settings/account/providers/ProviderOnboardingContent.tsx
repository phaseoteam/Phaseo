"use client";
import { withPrivateSettings } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderOnboardingClient from "@/components/(gateway)/settings/account/ProviderOnboardingClient";
export default withPrivateSettings("/api/account/settings/provider-onboarding", function ProviderOnboardingContent({ initialData }: { initialData: SettingsProviderOnboardingInitialData }) {
	const hasCatalog = (initialData.catalogProviders ?? initialData.linkedProviders).length > 0;
	return <div className="space-y-6"><SettingsPageHeader title={hasCatalog ? "Provider catalog" : "Become a provider"} description={hasCatalog ? "Manage the models you support on the gateway." : "Connect your provider account. Your personal workspace is managed automatically."} /><ProviderOnboardingClient initialData={initialData} /></div>;
}, false);

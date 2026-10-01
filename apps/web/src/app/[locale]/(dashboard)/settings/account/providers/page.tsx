import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import ProviderOnboardingClient from "@/components/(gateway)/settings/account/ProviderOnboardingClient";
import { fetchSettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/fetchSettingsProviderOnboardingInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.providerOnboarding")} - ${t("headers.settings")}` };
}

export default function ProviderOnboardingPage() {
	return <div className="space-y-6"><SettingsPageHeader title="Provider onboarding" titleKey="headers.providerOnboarding" description="Connect your provider catalog and keep your account linked to the public provider profile." descriptionKey="headers.providerOnboardingDescription" /><Suspense fallback={<SettingsSectionFallback />}><ProviderOnboardingContent /></Suspense></div>;
}

async function ProviderOnboardingContent() {
	const initialData = await fetchSettingsProviderOnboardingInitialData();
	return <ProviderOnboardingClient initialData={initialData} />;
}

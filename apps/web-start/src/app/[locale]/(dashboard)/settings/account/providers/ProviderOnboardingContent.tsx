"use client";
import { useTranslations } from "next-intl";
import { withPrivateSettings } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderOnboardingClient from "@/components/(gateway)/settings/account/ProviderOnboardingClient";
export default withPrivateSettings("/api/account/settings/provider-onboarding", function ProviderOnboardingContent({ initialData }: { initialData: SettingsProviderOnboardingInitialData }) {
	const t = useTranslations("SettingsUI.providerCatalog");
	const hasCatalog = (initialData.catalogProviders ?? initialData.linkedProviders).length > 0;
	return <div className="space-y-6"><SettingsPageHeader title={hasCatalog ? t("title") : t("becomeProvider")} description={hasCatalog ? t("description") : t("onboardingDescription")} /><ProviderOnboardingClient initialData={initialData} /></div>;
}, false);

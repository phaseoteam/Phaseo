import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderReviewClient from "@/components/(gateway)/settings/internal/ProviderReviewClient";
import { providerReviewQuery } from "./providerReview.functions";
import ProviderModelRequests from "@/components/(gateway)/settings/internal/ProviderModelRequests";

export async function getProviderReviewMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("providerReview") };
}

// requireInternalAdmin("/settings/account/providers") runs in the route's beforeLoad.
export default function ProviderReviewPage() {
	const t = useTranslations("SettingsUI.providerReviewCopy");
	const { data: { applications, requests } } = useSuspenseQuery(providerReviewQuery());
	return <div className="space-y-6"><SettingsPageHeader title={t("title")} description={t("description")} /><ProviderReviewClient initialApplications={applications} /><ProviderModelRequests initialRequests={requests}/></div>;
}

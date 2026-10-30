import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderReviewClient from "@/components/(gateway)/settings/internal/ProviderReviewClient";
import { fetchInternalProviderApplications, fetchProviderModelRequests } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";
import ProviderModelRequests from "@/components/(gateway)/settings/internal/ProviderModelRequests";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("providerReview") };
}

export default async function ProviderReviewPage() {
	await requireInternalAdmin("/settings/account/providers");
	const t = await getTranslations("SettingsUI.providerReviewCopy");
	const [applications,requests] = await Promise.all([fetchInternalProviderApplications(),fetchProviderModelRequests()]);
	return <div className="space-y-6"><SettingsPageHeader title={t("title")} description={t("description")} /><ProviderReviewClient initialApplications={applications} /><ProviderModelRequests initialRequests={requests}/></div>;
}

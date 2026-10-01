import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderReviewClient from "@/components/(gateway)/settings/internal/ProviderReviewClient";
import { fetchInternalProviderApplications, fetchInternalProviderCatalogReviews } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("providerReview") };
}

export default async function ProviderReviewPage() {
	await requireInternalAdmin("/settings/account/providers");
	const t = await getTranslations("SettingsUI.providerReviewCopy");
	const [applications, reviews] = await Promise.all([fetchInternalProviderApplications(), fetchInternalProviderCatalogReviews()]);
	return <div className="space-y-6"><SettingsPageHeader title={t("title")} description={t("description")} /><ProviderReviewClient initialApplications={applications} initialReviews={reviews} /></div>;
}

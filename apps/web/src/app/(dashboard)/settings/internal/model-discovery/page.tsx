import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ModelDiscoveryReviewClient from "@/components/(gateway)/settings/internal/ModelDiscoveryReviewClient";
import { fetchInternalModelDiscoveryReviews } from "@/lib/fetchers/internal/fetchInternalModelDiscoveryReviews";

export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: `${t("internalMainCopy.discovery")} - ${t("headers.settings")}` }; }

export default async function ModelDiscoveryReviewPage() {
	const t = await getTranslations("SettingsUI");
	await requireInternalAdmin("/internal");
	const items = await fetchInternalModelDiscoveryReviews();
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("internalMainCopy.discovery")}
				description={t("internalMainCopy.discoveryHelp")}
			/>
			<ModelDiscoveryReviewClient initialItems={items} />
		</div>
	);
}

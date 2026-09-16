import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ProviderReviewClient from "@/components/(gateway)/settings/internal/ProviderReviewClient";
import { fetchInternalProviderApplications, fetchInternalProviderCatalogReviews } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";

export const metadata = { title: "Provider review - Settings" };

export default async function ProviderReviewPage() {
	await requireInternalAdmin("/settings/account/providers");
	const [applications, reviews] = await Promise.all([fetchInternalProviderApplications(), fetchInternalProviderCatalogReviews()]);
	return <div className="space-y-6"><SettingsPageHeader title="Provider review" description="Approve provider organisations and their model claims before public routing." /><ProviderReviewClient initialApplications={applications} initialReviews={reviews} /></div>;
}

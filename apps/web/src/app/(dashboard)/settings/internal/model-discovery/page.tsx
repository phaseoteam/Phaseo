import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import ModelDiscoveryReviewClient from "@/components/(gateway)/settings/internal/ModelDiscoveryReviewClient";
import { fetchInternalModelDiscoveryReviews } from "@/lib/fetchers/internal/fetchInternalModelDiscoveryReviews";

export const metadata = { title: "Model discovery - Settings" };

export default async function ModelDiscoveryReviewPage() {
	await requireInternalAdmin("/internal");
	const items = await fetchInternalModelDiscoveryReviews();
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Model discovery"
				description="Review provider detections before changing the public catalog or routing configuration."
			/>
			<ModelDiscoveryReviewClient initialItems={items} />
		</div>
	);
}

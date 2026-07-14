import { fetchFrontendModelSubscriptionPlans } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ModelSubscriptionsClient from "@/components/(data)/model/pricing/ModelSubscriptionsClient";

export default async function ModelSubscriptions({
	modelId,
	ownerOrganisationId,
	ownerOrganisationName,
	showHeader = true,
}: {
	modelId: string;
	ownerOrganisationId?: string | null;
	ownerOrganisationName?: string | null;
	showHeader?: boolean;
}) {
	const subscriptionPlans = await fetchFrontendModelSubscriptionPlans(modelId).catch(
		() => [],
	);

	return (
		<ModelSubscriptionsClient
			subscriptionPlans={subscriptionPlans}
			ownerOrganisationId={ownerOrganisationId}
			ownerOrganisationName={ownerOrganisationName}
			showHeader={showHeader}
		/>
	);
}

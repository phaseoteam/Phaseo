import { fetchFrontendModelSubscriptionPlans } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import ModelSubscriptionsClient from "@/components/(data)/model/pricing/ModelSubscriptionsClient";
import { toSubscriptionPlanSummaries } from "@/components/(data)/model/pricing/subscriptionPlanSummary";

export default async function ModelSubscriptions({
	modelId,
	ownerOrganisationId,
	ownerOrganisationName,
	showHeader = true,
	includeHidden = false,
}: {
	modelId: string;
	ownerOrganisationId?: string | null;
	ownerOrganisationName?: string | null;
	showHeader?: boolean;
	includeHidden?: boolean;
}) {
	const subscriptionPlans = await fetchFrontendModelSubscriptionPlans(modelId, includeHidden).catch(
		() => [],
	);

	return (
		<ModelSubscriptionsClient
			subscriptionPlans={toSubscriptionPlanSummaries(subscriptionPlans)}
			ownerOrganisationId={ownerOrganisationId}
			ownerOrganisationName={ownerOrganisationName}
			showHeader={showHeader}
		/>
	);
}

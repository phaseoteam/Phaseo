import { useSuspenseQuery } from "@tanstack/react-query";
import { modelSubscriptionPlansQuery } from "@/components/(data)/model/modelData.queries";
import ModelSubscriptionsClient from "@/components/(data)/model/pricing/ModelSubscriptionsClient";
import { toSubscriptionPlanSummaries } from "@/components/(data)/model/pricing/subscriptionPlanSummary";

export default function ModelSubscriptions({
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
	const { data } = useSuspenseQuery(modelSubscriptionPlansQuery(modelId, includeHidden));
	const subscriptionPlans = data ?? [];

	return (
		<ModelSubscriptionsClient
			subscriptionPlans={toSubscriptionPlanSummaries(subscriptionPlans)}
			ownerOrganisationId={ownerOrganisationId}
			ownerOrganisationName={ownerOrganisationName}
			showHeader={showHeader}
		/>
	);
}

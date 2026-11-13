import { useTranslations } from "@/i18n/react";
import SubscriptionPlanAllowances from "./SubscriptionPlanAllowances";
import SubscriptionPlanOffers from "./SubscriptionPlanOffers";
import type { SubscriptionPlanDetails } from "@/lib/fetchers/subscription-plans/types";
import Link from "@/components/link";
import { Button } from "@/components/ui/button";
import SubscriptionPlanFeaturesTable from "./SubscriptionPlanFeaturesTable";
import SubscriptionPlanModelsTable from "./SubscriptionPlanModelsTable";
import SubscriptionPlanUsageSection from "./SubscriptionPlanUsage";
import SubscriptionPlanCompare from "./SubscriptionPlanCompare";
import { formatSubscriptionPlanMessage, type SubscriptionPlansMessages } from "@/i18n/subscription-plans";

const PREVIEW_FEATURES = 5;
const PREVIEW_MODELS = 8;

interface SubscriptionPlanOverviewProps {
	plan: SubscriptionPlanDetails;
	messages: SubscriptionPlansMessages["detail"];
}

function ViewAll({ href, label }: { href: string; label: string }) {
	return (
		<Button asChild variant="link" className="h-auto p-0 text-sm">
			<Link href={href}>{label}</Link>
		</Button>
	);
}

export default function SubscriptionPlanOverview({ plan, messages }: SubscriptionPlanOverviewProps) {
	const access = useTranslations("Common.ui.subscriptionCatalog");
	const features = plan.features ?? [];
	const models = plan.models ?? [];

	return (
		<div className="space-y-10">
			<SubscriptionPlanUsageSection usage={plan.usage ?? []} />
			<SubscriptionPlanOffers plan={plan} />
			<SubscriptionPlanCompare planId={plan.plan_id} provider={plan.organisation?.name ?? messages.unknownProvider} plans={plan.related_plans ?? []} />
			<SubscriptionPlanAllowances allowances={plan.allowances ?? []} />

			<section id="main-features" className="scroll-mt-36 space-y-4">
				<h2 className="text-xl font-semibold">{messages.mainFeatures}</h2>
				{features.length ? (
					<div className="space-y-3">
						<SubscriptionPlanFeaturesTable features={features.slice(0, PREVIEW_FEATURES)} messages={messages} />
						{features.length > PREVIEW_FEATURES ? <ViewAll href={`/subscription-plans/${plan.plan_id}/features`} label={formatSubscriptionPlanMessage(messages.viewAllFeatures, { count: features.length })} /> : null}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{messages.noFeatures}</p>
				)}
			</section>

			<section id="included-models" className="scroll-mt-36 space-y-4">
				<h2 className="text-xl font-semibold">{access("plan_model_access")}</h2>
				{models.length ? (
					<div className="space-y-3">
						<SubscriptionPlanModelsTable models={models} usage={plan.usage} limit={PREVIEW_MODELS} />
						{models.length > PREVIEW_MODELS ? <ViewAll href={`/subscription-plans/${plan.plan_id}/models`} label={formatSubscriptionPlanMessage(messages.viewAllModels, { count: models.length })} /> : null}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">{messages.noModels}</p>
				)}
			</section>
		</div>
	);
}

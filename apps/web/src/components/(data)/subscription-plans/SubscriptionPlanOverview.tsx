import type { SubscriptionPlanDetails } from "@/lib/fetchers/subscription-plans/types";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import SubscriptionPlanFeaturesTable from "./SubscriptionPlanFeaturesTable";

interface SubscriptionPlanOverviewProps {
	plan: SubscriptionPlanDetails;
}

export default function SubscriptionPlanOverview({
	plan,
}: SubscriptionPlanOverviewProps) {
	// Get top 5 features
	const topFeatures = plan.features?.slice(0, 5) ?? [];

	// Get most recent models (assuming models have release date or something, but for now, just first 5)
	const recentModels = plan.models?.slice(0, 5) ?? [];

	return (
		<div className="space-y-10">
			{/* Features */}
			<section id="main-features" className="scroll-mt-36 space-y-4">
				<h2 className="text-xl font-semibold">Main Features</h2>
					{topFeatures.length > 0 ? (
						<div className="space-y-3">
							<SubscriptionPlanFeaturesTable features={topFeatures} />
							{plan.features && plan.features.length > 5 && (
								<Button asChild variant="link" className="h-auto p-0"><Link
									href={`/subscription-plans/${plan.plan_id}/features`}
									className="text-sm text-primary relative underline decoration-transparent hover:decoration-current transition-colors duration-200"
								>
									View all {plan.features.length} features <ArrowRight className="size-4" aria-hidden="true" />
								</Link></Button>
							)}
						</div>
					) : (
						<p className="text-muted-foreground">
							No features information available.
						</p>
					)}
			</section>

			{/* Models */}
			<section id="included-models" className="scroll-mt-36 space-y-4">
				<h2 className="text-xl font-semibold">Included Models</h2>
					{recentModels.length > 0 ? (
						<div className="divide-y divide-border/70 border-y border-border/70">
							{recentModels.map((modelInfo) => (
								<div
									key={modelInfo.model_id}
									className="flex items-center justify-between px-1 py-3"
								>
									<div className="flex-1">
										<Link
											href={`/models/${modelInfo.model_id}`}
											className="font-medium hover:text-primary transition-colors relative underline decoration-transparent hover:decoration-current transition-colors duration-200"
										>
											{modelInfo.model.name}
										</Link>
										{modelInfo.model.organisation_name && (
											<p className="text-sm text-muted-foreground">
												by {modelInfo.model.organisation_name}
											</p>
										)}
									</div>
								</div>
							))}
							{plan.models && plan.models.length > 5 && (
								<Button asChild variant="link" className="h-auto py-3 px-0"><Link
									href={`/subscription-plans/${plan.plan_id}/models`}
									className="text-sm text-primary relative underline decoration-transparent hover:decoration-current transition-colors duration-200"
								>
									View all {plan.models.length} models <ArrowRight className="size-4" aria-hidden="true" />
								</Link></Button>
							)}
						</div>
					) : (
						<p className="text-muted-foreground">
							No models information available.
						</p>
					)}
			</section>
		</div>
	);
}

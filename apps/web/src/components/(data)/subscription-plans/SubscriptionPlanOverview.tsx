import { SubscriptionPlanDetails } from "@/lib/fetchers/subscription-plans/getSubscriptionPlan";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Features */}
			<Card>
				<CardHeader>
					<CardTitle>Main Features</CardTitle>
				</CardHeader>
				<CardContent>
					{topFeatures.length > 0 ? (
						<div className="space-y-3">
							<SubscriptionPlanFeaturesTable features={topFeatures} />
							{plan.features && plan.features.length > 5 && (
								<Link
									href={`/subscription-plans/${plan.plan_id}/features`}
									className="text-sm text-primary relative underline decoration-transparent hover:decoration-current transition-colors duration-200"
								>
									View all {plan.features.length} features →
								</Link>
							)}
						</div>
					) : (
						<p className="text-muted-foreground">
							No features information available.
						</p>
					)}
				</CardContent>
			</Card>

			{/* Models */}
			<Card>
				<CardHeader>
					<CardTitle>Included Models</CardTitle>
				</CardHeader>
				<CardContent>
					{recentModels.length > 0 ? (
						<div className="space-y-3">
							{recentModels.map((modelInfo, index) => (
								<div
									key={modelInfo.model_id}
									className="flex items-center justify-between p-3 border rounded-lg"
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
								<Link
									href={`/subscription-plans/${plan.plan_id}/models`}
									className="text-sm text-primary relative underline decoration-transparent hover:decoration-current transition-colors duration-200"
								>
									View all {plan.models.length} models →
								</Link>
							)}
						</div>
					) : (
						<p className="text-muted-foreground">
							No models information available.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

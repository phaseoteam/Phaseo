import type { ExtendedModel } from "@/data/types";
import ComparisonHeader from "./comparisonComponents/ComparisonHeader";
import OverviewCard from "./comparisonComponents/OverviewCard";
import PerformanceBenchmarkGraph from "./comparisonComponents/performanceComparison/PerformanceBenchmarkGraph";
import PricingAnalysis from "./comparisonComponents/pricingAnalysis/PricingAnalysis";
import AvailabilityComparison from "./comparisonComponents/AvailabilityComparison";
import SubscriptionPlansComparison from "./comparisonComponents/SubscriptionPlansComparison";
import GatewayUsageComparison from "./comparisonComponents/GatewayUsageComparison";
import type { CompareGatewayUsageByModel } from "./types";

export default function ComparisonDisplay({
	selectedModels,
	usageByModel,
}: {
	selectedModels: ExtendedModel[];
	usageByModel: CompareGatewayUsageByModel;
}) {
	return (
		<div className="w-full flex flex-col space-y-10">
			<ComparisonHeader selectedModels={selectedModels} />
			<OverviewCard selectedModels={selectedModels} />
			<GatewayUsageComparison
				selectedModels={selectedModels}
				usageByModel={usageByModel}
			/>
			<PerformanceBenchmarkGraph selectedModels={selectedModels} />
			<PricingAnalysis selectedModels={selectedModels} />
			<section className="space-y-4">
				<header className="space-y-1">
					<h2 className="text-lg font-semibold">Availability</h2>
					<p className="text-sm text-muted-foreground">
						API provider availability and subscription plans.
					</p>
				</header>
				<div className="space-y-6">
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							API Availability
						</h3>
						<AvailabilityComparison selectedModels={selectedModels} hideHeader />
					</div>
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Subscription Plans
						</h3>
						<SubscriptionPlansComparison selectedModels={selectedModels} hideHeader />
					</div>
				</div>
			</section>
		</div>
	);
}

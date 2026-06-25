import { BarChart3 } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import ProviderTokenUsageChartClient from "./ProviderTokenUsageChartClient";
import {
	fetchFrontendAPIProviderAppTokenTimeseries,
	fetchFrontendAPIProviderModelTokenTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default async function ProviderTokenUsageChart({
	apiProviderId,
}: {
	apiProviderId: string;
}) {
	const [{ models, points }, { apps, points: appPoints }] = await Promise.all([
		fetchFrontendAPIProviderModelTokenTimeseries(apiProviderId, {
			days: 30,
			topModels: 8,
		}),
		fetchFrontendAPIProviderAppTokenTimeseries(apiProviderId, {
			days: 30,
			topApps: 20,
		}),
	]);

	return (
		<section className="space-y-2">
			<h3 className="text-xl font-semibold">Token usage</h3>

			{models.length > 0 && points.length > 0 ? (
				<ProviderTokenUsageChartClient
					models={models}
					points={points}
					apps={apps}
					appPoints={appPoints}
				/>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BarChart3 />
						</EmptyMedia>
						<EmptyTitle>No Token Usage Yet</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							Usage over time will appear once this provider receives
							gateway traffic.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}

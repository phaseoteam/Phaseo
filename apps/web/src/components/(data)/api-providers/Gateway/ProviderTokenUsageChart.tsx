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
import { getTranslations } from "next-intl/server";

export default async function ProviderTokenUsageChart({
	apiProviderId,
}: {
	apiProviderId: string;
}) {
	const t = await getTranslations("Catalogue.providers");
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
		<section id="token-usage" className="scroll-mt-36 space-y-3">
			<h2 className="text-xl font-semibold">{t("tokenUsage")}</h2>

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
						<EmptyTitle>{t("noTokenUsageYet")}</EmptyTitle>
						<EmptyDescription className="max-w-md mx-auto">
							{t("usageWillAppearAfterTraffic")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}

import { BarChart3 } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import ProviderTokenUsageChartClient from "./ProviderTokenUsageChartClient";
import { useSuspenseQueries } from "@tanstack/react-query";
import {
	apiProviderAppTokenTimeseriesQuery,
	apiProviderModelTokenTimeseriesQuery,
} from "../apiProvider.queries";
import { useTranslations } from "@/i18n/react";

export default function ProviderTokenUsageChart({
	apiProviderId,
}: {
	apiProviderId: string;
}) {
	const t = useTranslations("Catalogue.providers");
	const [{ data: { models, points } }, { data: { apps, points: appPoints } }] = useSuspenseQueries({
		queries: [
			apiProviderModelTokenTimeseriesQuery(apiProviderId, {
				days: 30,
				topModels: 8,
			}),
			apiProviderAppTokenTimeseriesQuery(apiProviderId, {
				days: 30,
				topApps: 20,
			}),
		],
	});

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

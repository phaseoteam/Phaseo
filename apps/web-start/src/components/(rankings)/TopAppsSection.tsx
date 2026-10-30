import { AppsUsageList } from "@/components/(rankings)/AppsUsageList";
import { useTranslations } from "next-intl";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rankingTopAppsSectionQuery } from "@/components/(rankings)/rankingSections.queries";

export function TopAppsSection() {
	const t = useTranslations("Catalogue.rankings");
	const { data: { today, week, month } } = useSuspenseQuery(rankingTopAppsSectionQuery(20));
	if (!today || !week || !month) return <RankingUnavailable id="top-apps" title={t("topApps")} />;
	const byTokens = <T extends { tokens: number }>(rows: T[]) =>
		[...rows].sort((left, right) => Number(right.tokens ?? 0) - Number(left.tokens ?? 0));

	return (
		<section id="top-apps" className="scroll-mt-32 space-y-4 border-t border-border pt-12">
			<AppsUsageList
				dataByRange={{
					today: byTokens(today.data),
					week: byTokens(week.data),
					month: byTokens(month.data),
				}}
				defaultRange="week"
				showHeader
				title={t("topApps")}
				subtitle={t("topAppsSubtitle")}
			/>
		</section>
	);
}

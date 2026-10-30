import { AppsUsageList } from "@/components/(rankings)/AppsUsageList";
import { fetchFrontendRankingTopApps } from "@/lib/fetchers/frontend/fetchRankingSections";
import { getTranslations } from "next-intl/server";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

export async function TopAppsSection() {
	const t = await getTranslations("Catalogue.rankings");
	const [today, week, month] = await Promise.all([
		fetchFrontendRankingTopApps("today", 20).catch(() => null),
		fetchFrontendRankingTopApps("week", 20).catch(() => null),
		fetchFrontendRankingTopApps("month", 20).catch(() => null),
	]);
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

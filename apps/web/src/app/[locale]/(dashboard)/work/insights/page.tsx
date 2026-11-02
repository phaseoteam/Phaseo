import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InsightsView } from "@/components/work/InsightsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkInsights } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.insights");
	return { title: t("title") };
}

const RANGES = [7, 30, 90, 180] as const;

export default async function WorkInsightsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
	const context = await requireWorkPage();
	const requested = Number((await searchParams).days);
	const days = (RANGES as readonly number[]).includes(requested) ? requested : 30;
	const to = new Date();
	const from = new Date(to.getTime() - (days - 1) * 86_400_000);
	const result = await loadWork<WorkInsights | { insights: WorkInsights }>(context, "insights", { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
	if (!result.ok) return <WorkLoadError status={result.status} message={result.message} />;
	const insights = "insights" in result.data ? result.data.insights : result.data;
	return <InsightsView insights={{ ...insights, from: insights.from ?? from.toISOString(), to: insights.to ?? to.toISOString() }} days={days} ranges={[...RANGES]} />;
}

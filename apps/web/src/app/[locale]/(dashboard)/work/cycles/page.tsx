import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CyclesView } from "@/components/work/CyclesView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkCurrentCycleResponse, WorkCycle } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.cycles");
	return { title: t("title") };
}

export default async function WorkCyclesPage() {
	const context = await requireWorkPage();
	const [cycles, current] = await Promise.all([
		loadWork<{ cycles: WorkCycle[] }>(context, "cycles"),
		loadWork<WorkCurrentCycleResponse>(context, "cycles/current"),
	]);
	if (!cycles.ok) return <WorkLoadError status={cycles.status} message={cycles.message} />;
	return <CyclesView cycles={listFrom<WorkCycle>(cycles.data, "cycles")} current={current.ok ? current.data?.cycle ?? null : null} />;
}

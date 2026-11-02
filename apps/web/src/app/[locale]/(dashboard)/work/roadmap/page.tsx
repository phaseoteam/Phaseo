import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoadmapView } from "@/components/work/RoadmapView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkRoadmapResponse } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.roadmap");
	return { title: t("title") };
}

export default async function WorkRoadmapPage() {
	const context = await requireWorkPage();
	const roadmap = await loadWork<WorkRoadmapResponse>(context, "roadmap");
	if (!roadmap.ok) return <WorkLoadError status={roadmap.status} message={roadmap.message} />;
	return <RoadmapView initiatives={roadmap.data.initiatives ?? []} projects={roadmap.data.projects ?? []} />;
}

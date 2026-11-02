import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectDetail } from "@/components/work/ProjectsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import { parseLayout } from "@/lib/work/views";
import type { WorkCycle, WorkMember, WorkProject, WorkProjectDetailResponse } from "@/lib/work/types";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.projects");
	return { title: t("title") };
}

export default async function WorkProjectPage({ params, searchParams }: { params: Params; searchParams: Promise<{ layout?: string }> }) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const context = await requireWorkPage();
	const [detail, members, projects, cycles] = await Promise.all([
		loadWork<WorkProjectDetailResponse>(context, `projects/${id}`),
		loadWork<{ members: WorkMember[] }>(context, "members"),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
		loadWork<{ cycles: WorkCycle[] }>(context, "cycles"),
	]);
	if (!detail.ok) {
		if (detail.status === 404) notFound();
		return <WorkLoadError status={detail.status} message={detail.message} />;
	}
	return (
		<ProjectDetail
			project={detail.data.project}
			items={detail.data.items ?? []}
			members={members.ok ? listFrom<WorkMember>(members.data, "members") : []}
			projects={projects.ok ? listFrom<WorkProject>(projects.data, "projects") : []}
			cycles={cycles.ok ? listFrom<WorkCycle>(cycles.data, "cycles") : []}
			layout={parseLayout((await searchParams).layout)}
		/>
	);
}

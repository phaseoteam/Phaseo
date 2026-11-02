import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectDetail } from "@/components/work/ProjectsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import { parseLayout } from "@/lib/work/views";
import type { ProjectUpdate, WorkCycle, WorkDocument, WorkInitiative, WorkMember, WorkMilestone, WorkProject, WorkProjectDetailResponse, WorkSettingsResponse } from "@/lib/work/types";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.projects");
	return { title: t("title") };
}

export default async function WorkProjectPage({ params, searchParams }: { params: Params; searchParams: Promise<{ layout?: string }> }) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const context = await requireWorkPage();
	const [detail, members, projects, cycles, milestones, updates, settings, documents, initiatives] = await Promise.all([
		loadWork<WorkProjectDetailResponse>(context, `projects/${id}`),
		loadWork<{ members: WorkMember[] }>(context, "members"),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
		loadWork<{ cycles: WorkCycle[] }>(context, "cycles"),
		loadWork<{ milestones: WorkMilestone[] }>(context, `projects/${id}/milestones`),
		loadWork<{ updates: ProjectUpdate[] }>(context, `projects/${id}/updates`),
		loadWork<WorkSettingsResponse>(context, "settings"),
		loadWork<{ documents: WorkDocument[] }>(context, "documents", { projectId: id }),
		loadWork<{ initiatives: WorkInitiative[] }>(context, "initiatives"),
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
			milestones={milestones.ok ? listFrom<WorkMilestone>(milestones.data, "milestones") : []}
			updates={updates.ok ? listFrom<ProjectUpdate>(updates.data, "updates") : []}
			currentUserId={context.userId}
			canManageAll={settings.ok ? settings.data?.canEdit === true : false}
			documents={documents.ok ? listFrom<WorkDocument>(documents.data, "documents") : []}
			initiatives={initiatives.ok ? listFrom<WorkInitiative>(initiatives.data, "initiatives") : []}
		/>
	);
}

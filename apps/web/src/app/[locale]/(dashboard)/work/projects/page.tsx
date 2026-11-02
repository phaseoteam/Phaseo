import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectsView } from "@/components/work/ProjectsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkMember, WorkProject } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.projects");
	return { title: t("title") };
}

export default async function WorkProjectsPage() {
	const context = await requireWorkPage();
	const [projects, members] = await Promise.all([
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
		loadWork<{ members: WorkMember[] }>(context, "members"),
	]);
	if (!projects.ok) return <WorkLoadError status={projects.status} message={projects.message} />;
	return <ProjectsView projects={listFrom<WorkProject>(projects.data, "projects")} members={members.ok ? listFrom<WorkMember>(members.data, "members") : []} />;
}

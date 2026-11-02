import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TemplatesView } from "@/components/work/TemplatesView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkProject, WorkRecurrence, WorkTemplate } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.templates");
	return { title: t("title") };
}

export default async function WorkTemplatesPage() {
	const context = await requireWorkPage();
	const [templates, recurrences, projects] = await Promise.all([
		loadWork<{ templates: WorkTemplate[] }>(context, "templates"),
		loadWork<{ recurrences: WorkRecurrence[] }>(context, "recurrences"),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
	]);
	if (!templates.ok) return <WorkLoadError status={templates.status} message={templates.message} />;
	return (
		<TemplatesView
			templates={listFrom<WorkTemplate>(templates.data, "templates")}
			recurrences={recurrences.ok ? listFrom<WorkRecurrence>(recurrences.data, "recurrences") : []}
			projects={projects.ok ? listFrom<WorkProject>(projects.data, "projects") : []}
		/>
	);
}

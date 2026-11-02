import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ErrorsView } from "@/components/work/ErrorsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import { ERROR_GROUP_STATUSES, type ErrorGroup, type ErrorGroupStatus, type ErrorProject } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.errors");
	return { title: t("title") };
}

export default async function WorkErrorsPage({ searchParams }: { searchParams: Promise<{ status?: string; projectId?: string }> }) {
	const context = await requireWorkPage();
	const params = await searchParams;
	const status: ErrorGroupStatus = (ERROR_GROUP_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as ErrorGroupStatus) : "open";
	const projectId = params.projectId && /^[0-9a-f-]{36}$/i.test(params.projectId) ? params.projectId : null;
	const [groups, projects] = await Promise.all([
		loadWork<{ groups: ErrorGroup[] }>(context, "errors", { status, projectId }),
		loadWork<{ projects: ErrorProject[] }>(context, "error-projects"),
	]);
	if (!groups.ok) return <WorkLoadError status={groups.status} message={groups.message} />;
	return (
		<ErrorsView
			status={status}
			projectId={projectId}
			groups={listFrom<ErrorGroup>(groups.data, "groups").filter((group) => group.status === status && (!projectId || group.projectId === projectId))}
			projects={projects.ok ? listFrom<ErrorProject>(projects.data, "projects") : []}
		/>
	);
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { WorkSettingsView } from "@/components/work/WorkSettingsView";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { ErrorProject, GithubRepo, IntakeForm, WorkMemberSettingsResponse, WorkProject, WorkSettingsResponse } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.settings");
	return { title: t("title") };
}

export default async function WorkSettingsPage() {
	const context = await requireWorkPage();
	const [forms, projects, repos, settings, mine, workProjects] = await Promise.all([
		loadWork<{ forms: IntakeForm[]; emailDomain?: string | null }>(context, "intake-forms"),
		loadWork<{ projects: ErrorProject[] }>(context, "error-projects"),
		loadWork<{ repos: GithubRepo[] }>(context, "github-repos"),
		loadWork<WorkSettingsResponse>(context, "settings"),
		loadWork<WorkMemberSettingsResponse>(context, "me/settings"),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
	]);
	const failed = [forms, projects, repos].find((result) => !result.ok);
	if (failed && !failed.ok) return <WorkLoadError status={failed.status} message={failed.message} />;
	return (
		<WorkSettingsView
			forms={forms.ok ? listFrom<IntakeForm>(forms.data, "forms") : []}
			projects={projects.ok ? listFrom<ErrorProject>(projects.data, "projects") : []}
			repos={repos.ok ? listFrom<GithubRepo>(repos.data, "repos") : []}
			settings={settings.ok ? settings.data?.settings ?? null : null}
			canEditSettings={settings.ok ? settings.data?.canEdit !== false : false}
			mine={mine.ok ? mine.data ?? null : null}
			workProjects={workProjects.ok ? listFrom<WorkProject>(workProjects.data, "projects") : []}
			emailDomain={forms.ok ? forms.data?.emailDomain ?? null : null}
		/>
	);
}

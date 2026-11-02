import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { WorkSettingsView } from "@/components/work/WorkSettingsView";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { ErrorProject, GithubRepo, IntakeForm, WorkSettingsResponse } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.settings");
	return { title: t("title") };
}

export default async function WorkSettingsPage() {
	const context = await requireWorkPage();
	const [forms, projects, repos, settings] = await Promise.all([
		loadWork<{ forms: IntakeForm[] }>(context, "intake-forms"),
		loadWork<{ projects: ErrorProject[] }>(context, "error-projects"),
		loadWork<{ repos: GithubRepo[] }>(context, "github-repos"),
		loadWork<WorkSettingsResponse>(context, "settings"),
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
		/>
	);
}

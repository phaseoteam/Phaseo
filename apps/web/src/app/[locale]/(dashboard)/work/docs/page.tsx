import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocsView } from "@/components/work/DocsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkDocument, WorkProject } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.docs");
	return { title: t("title") };
}

export default async function WorkDocsPage() {
	const context = await requireWorkPage();
	const [documents, projects] = await Promise.all([
		loadWork<{ documents: WorkDocument[] }>(context, "documents"),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
	]);
	if (!documents.ok) return <WorkLoadError status={documents.status} message={documents.message} />;
	return <DocsView documents={listFrom<WorkDocument>(documents.data, "documents")} projects={projects.ok ? listFrom<WorkProject>(projects.data, "projects") : []} />;
}

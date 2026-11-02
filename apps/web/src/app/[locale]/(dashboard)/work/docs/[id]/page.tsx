import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DocumentEditor } from "@/components/work/DocsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { listFrom, loadWork, requireWorkPage } from "@/lib/work/server";
import type { WorkDocument, WorkMember, WorkProject } from "@/lib/work/types";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Work.docs");
	return { title: t("title") };
}

export default async function WorkDocumentPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const context = await requireWorkPage();
	const [document, projects, members] = await Promise.all([
		loadWork<{ document: WorkDocument }>(context, `documents/${id}`),
		loadWork<{ projects: WorkProject[] }>(context, "projects"),
		loadWork<{ members: WorkMember[] }>(context, "members"),
	]);
	if (!document.ok) {
		if (document.status === 404) notFound();
		return <WorkLoadError status={document.status} message={document.message} />;
	}
	return (
		<DocumentEditor
			key={document.data.document.updatedAt}
			document={document.data.document}
			projects={projects.ok ? listFrom<WorkProject>(projects.data, "projects") : []}
			members={members.ok ? listFrom<WorkMember>(members.data, "members") : []}
		/>
	);
}

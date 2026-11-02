import { notFound } from "next/navigation";
import { ErrorGroupDetail } from "@/components/work/ErrorsView";
import { WorkLoadError } from "@/components/work/WorkLoadError";
import { loadWork, requireWorkPage } from "@/lib/work/server";
import type { ErrorGroup } from "@/lib/work/types";

export default async function WorkErrorGroupPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const context = await requireWorkPage();
	const result = await loadWork<{ group: ErrorGroup }>(context, `errors/${id}`);
	if (!result.ok) {
		if (result.status === 404) notFound();
		return <WorkLoadError status={result.status} message={result.message} />;
	}
	return <ErrorGroupDetail group={result.data.group} projectName={result.data.group.projectName} />;
}

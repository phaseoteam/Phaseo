import { notFound } from "next/navigation";
import { connection } from "next/server";
import { enterpriseSelfServePreviewEnabled } from "@/lib/flags";
import WorkspaceEnterpriseContent, { type Mode } from "./WorkspaceEnterpriseContent";
export default async function WorkspaceEnterpriseRoute({ mode }: { mode: Mode; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	await connection();
	if (!(await enterpriseSelfServePreviewEnabled())) notFound();
	return <WorkspaceEnterpriseContent mode={mode} />;
}

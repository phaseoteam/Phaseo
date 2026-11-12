import { notFound } from "@/lib/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { settingsFlagQuery } from "@/features/settings/settings.functions";
import WorkspaceEnterpriseContent, { type Mode } from "./WorkspaceEnterpriseContent";
export default function WorkspaceEnterpriseRoute({ mode }: { mode: Mode }) {
	const { data: enabled } = useSuspenseQuery(settingsFlagQuery("enterpriseSelfServe"));
	if (!enabled) notFound();
	return <WorkspaceEnterpriseContent mode={mode} />;
}

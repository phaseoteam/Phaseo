import { useEffect, useState } from "react";
import type { BranchPullRequest } from "../../../shared/pullRequests";

/**
 * The pull request for a project checkout's current branch, linked or not. The main process
 * caches the read briefly; `refreshKey` asks again, for example when the pane's "+" menu opens.
 */
export function useBranchPullRequest(projectId: string | undefined, refreshKey: unknown = 0) {
	const [value, setValue] = useState<{ projectId: string; read: BranchPullRequest }>();
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !projectId) return;
		let active = true;
		void api.branchPullRequest(projectId).then(read => { if (active) setValue({ projectId, read }); }, () => { if (active) setValue(undefined); });
		return () => { active = false; };
	}, [projectId, refreshKey]);
	return value && value.projectId === projectId ? value.read : undefined;
}

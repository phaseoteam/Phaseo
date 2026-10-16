import { useCallback } from "react";
import type { PullRequestMergeMethod } from "../../../shared/pullRequestView";

/** Where the pull request pane remembers the merge method chosen last. */
export const lastMergeMethodKey = "phaseo.desktop.pullRequestMergeMethod";

export function readLastMergeMethod(): PullRequestMergeMethod {
	try { const value = JSON.parse(window.localStorage.getItem(lastMergeMethodKey) ?? "\"squash\"") as unknown; return value === "merge" || value === "rebase" ? value : "squash"; } catch { return "squash"; }
}

/** T3's resolvePullRequestMergeMethod: the choice made here, then the default, then the last one chosen, else the first the repository allows. */
export function resolvePullRequestMergeMethod(allowed: readonly PullRequestMergeMethod[], current: PullRequestMergeMethod | null | undefined, projectDefault: PullRequestMergeMethod | null | undefined, lastSelected: PullRequestMergeMethod): PullRequestMergeMethod {
	for (const method of [current, projectDefault, lastSelected]) if (method && allowed.includes(method)) return method;
	return allowed[0] ?? "merge";
}

/** Resolves a merge method on demand, for quick actions that merge without opening the pull request. */
export function useMergeMethodResolver() {
	return useCallback((_projectId: string, allowed: readonly PullRequestMergeMethod[]) => resolvePullRequestMergeMethod(allowed, null, null, readLastMergeMethod()), []);
}

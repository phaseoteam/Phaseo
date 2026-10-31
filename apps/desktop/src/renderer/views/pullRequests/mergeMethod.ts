import { useCallback } from "react";
import { settingsProject } from "../../../shared/projectSettings";
import type { PullRequestMergeMethod } from "../../../shared/pullRequestView";
import { useOptionalWorkspace } from "../../app/workspace";
import { useWorkspacePreferences } from "../../lib/workspacePreferences";

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

/** The merge method a project's pull requests start with: Project settings, else Settings → General, else none (last selected). */
export function useDefaultMergeMethod() {
	const projects = useOptionalWorkspace()?.overview.projects;
	const preferences = useWorkspacePreferences();
	return useCallback((projectId: string) => settingsProject(projects ?? [], projectId)?.settings?.pullRequestMergeMethod ?? preferences.pullRequestMergeMethod, [projects, preferences.pullRequestMergeMethod]);
}

/** Resolves a merge method on demand, for quick actions that merge without opening the pull request. */
export function useMergeMethodResolver() {
	const defaultFor = useDefaultMergeMethod();
	return useCallback((projectId: string, allowed: readonly PullRequestMergeMethod[]) => resolvePullRequestMergeMethod(allowed, null, defaultFor(projectId), readLastMergeMethod()), [defaultFor]);
}

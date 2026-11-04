import type { Project } from "./workspace";

/** Archived, directly or through the project a worktree was made from. */
export function isProjectArchived(project: Pick<Project, "archived" | "worktree"> | undefined, projects: readonly Pick<Project, "id" | "archived">[]) {
	if (!project) return false;
	return Boolean(project.archived || (project.worktree && projects.find(source => source.id === project.worktree!.sourceProjectId)?.archived));
}

/** Projects as pickers list them: archived ones left out (except `keep`, the one already chosen), pinned ones first. */
export function pickerProjects<T extends Pick<Project, "id" | "archived" | "pinned" | "worktree">>(projects: readonly T[], keep?: string): T[] {
	const shown = projects.filter(project => project.id === keep || !isProjectArchived(project, projects));
	return [...shown.filter(project => project.pinned), ...shown.filter(project => !project.pinned)];
}

/** The sidebar's project filter: any number of projects, none meaning all. Older windows kept one id as a string. */
export function projectScopes(value: unknown): string[] {
	if (typeof value === "string") return value ? [value] : [];
	return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id)))].slice(0, 100) : [];
}

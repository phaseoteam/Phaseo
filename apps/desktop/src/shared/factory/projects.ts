import type { Project } from "../workspace";

/**
 * A worktree Factory made for an item (`<workspace>/factory/worktrees/...`, named after the clone). Project pickers
 * leave these out so they don't fill up with one entry per item; their threads still list, and Factory links to them.
 */
export function isFactoryWorktree(project: Pick<Project, "directory" | "worktree">): boolean {
	return Boolean(project.worktree) && /[\\/]factory[\\/]worktrees[\\/]/i.test(project.directory);
}

import { isScriptCommand, parseScriptCommand } from "../../shared/keybindings";
import type { Project, Task } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { saveKeybindings, useKeybindings } from "../lib/keybindings";

/** T3's confirmation for Remove project, with "chats" for its threads. */
export function removeProjectMessage(project: Pick<Project, "name" | "directory">, chats: number) {
	return [
		chats > 0 ? `Remove project "${project.name}" and delete its ${chats} chat${chats === 1 ? "" : "s"}?` : `Remove project "${project.name}"?`,
		`Path: ${project.directory}`,
		chats > 0 ? "This permanently clears conversation history for those chats and any archived chats." : "This permanently clears any archived conversation history.",
		"This removes only the project entry, not the files on disk.",
		"This action cannot be undone.",
	].join("\n");
}

/** The chats Remove project deletes: the project's and its worktrees'. */
export function projectChats(project: Pick<Project, "id">, projects: readonly Project[], tasks: readonly Pick<Task, "id" | "projectId">[]) {
	const ids = new Set([project.id, ...projects.filter(value => value.worktree?.sourceProjectId === project.id).map(value => value.id)]);
	return tasks.filter(task => task.projectId && ids.has(task.projectId));
}

/**
 * T3's Remove project: asks first, then deletes the project entry, its worktree entries and their chats. Files on
 * disk are never touched. Its action shortcuts go too. Resolves true when it was removed.
 */
export function useRemoveProject() {
	const { api, overview, setOverview, selectedId, select, settings, settingsProjectId, closeSettings, setError } = useWorkspace();
	const keybindings = useKeybindings();
	return async (project: Project) => {
		if (!api) { setError("Open the desktop app to remove projects."); return false; }
		const chats = projectChats(project, overview.projects, overview.tasks);
		if (!window.confirm(removeProjectMessage(project, chats.length))) return false;
		try {
			setOverview(await api.command({ type: "remove-project", id: project.id }));
		} catch (reason) { setError(errorText(reason)); return false; }
		if (selectedId && chats.some(chat => chat.id === selectedId)) select(undefined);
		if (settings === "project" && settingsProjectId && (settingsProjectId === project.id || overview.projects.some(value => value.id === settingsProjectId && value.worktree?.sourceProjectId === project.id))) closeSettings();
		const kept = keybindings.entries.filter(entry => !isScriptCommand(entry.command) || parseScriptCommand(entry.command)?.projectId !== project.id);
		if (kept.length !== keybindings.entries.length) void saveKeybindings(kept).catch(() => undefined);
		return true;
	};
}

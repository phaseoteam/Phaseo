import { scriptCommand, type CommandInfo } from "./keybindings";
import type { WorkspacePreferences } from "./preferences";
import { autoSettleDays, type AutoSettleRules } from "./threadLifecycle";

/** T3 Code's script icons. */
export const projectScriptIcons = ["play", "test", "lint", "configure", "build", "debug"] as const;
export type ProjectScriptIcon = typeof projectScriptIcons[number];
/** A named command for a project, after T3 Code's project scripts: run from the chat header, when a worktree is made, or when a chat settles. */
export type ProjectScript = { id: string; name: string; command: string; icon: ProjectScriptIcon; runOnWorktreeCreate: boolean; runOnSettle?: boolean };
/**
 * One project's own settings, after T3's project overrides. An absent auto-settle key follows Settings → General;
 * autoSettleAfterDays null means never. Worktrees use their source project's settings.
 */
export type ProjectSettings = { autoSettleAfterDays?: number | null; autoSettleOnMerge?: boolean; keepPullRequests?: boolean; scripts?: ProjectScript[] };
export type ProjectUpdate = { id: string; name?: string; settings?: ProjectSettings };
export const maximumProjectScripts = 30;

type ProjectLike = { id: string; name: string; directory: string; worktree?: { sourceProjectId: string; removedAt?: string }; settings?: ProjectSettings };

const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasControl = (value: string, allowNewlines = false) => [...value].some(character => { const code = character.charCodeAt(0); return (code < 32 && !(allowNewlines && (code === 9 || code === 10 || code === 13))) || code === 127; });

export function validateProjectScript(value: unknown): ProjectScript {
	if (!plain(value)) throw new Error("Invalid project script.");
	const { id, name, command, icon, runOnWorktreeCreate, runOnSettle } = value;
	if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid project script.");
	if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || hasControl(name)) throw new Error("Give each script a name of up to 80 characters.");
	if (typeof command !== "string" || !command.trim() || command.length > 10_000 || hasControl(command, true)) throw new Error(`Give “${name.trim()}” a command of up to 10,000 characters.`);
	if (typeof icon !== "string" || !(projectScriptIcons as readonly string[]).includes(icon)) throw new Error("Choose an icon for each script.");
	if (typeof runOnWorktreeCreate !== "boolean" || (runOnSettle !== undefined && typeof runOnSettle !== "boolean")) throw new Error("Invalid project script.");
	return { id, name: name.trim(), command: command.trim(), icon: icon as ProjectScriptIcon, runOnWorktreeCreate, ...(runOnSettle ? { runOnSettle: true } : {}) };
}

export function validateProjectSettings(value: unknown): ProjectSettings {
	if (!plain(value)) throw new Error("Invalid project settings.");
	const settings: ProjectSettings = {};
	const days = value.autoSettleAfterDays;
	if (days !== undefined) {
		if (days !== null && (typeof days !== "number" || !Number.isInteger(days) || days < autoSettleDays.minimum || days > autoSettleDays.maximum)) throw new Error(`Auto-settle must be a whole number of days from ${autoSettleDays.minimum} to ${autoSettleDays.maximum}, or never.`);
		settings.autoSettleAfterDays = days;
	}
	for (const key of ["autoSettleOnMerge", "keepPullRequests"] as const) {
		if (value[key] === undefined) continue;
		if (typeof value[key] !== "boolean") throw new Error("Invalid auto-settle setting.");
		settings[key] = value[key];
	}
	if (value.scripts !== undefined) {
		if (!Array.isArray(value.scripts) || value.scripts.length > maximumProjectScripts) throw new Error(`A project can have up to ${maximumProjectScripts} scripts.`);
		const scripts = value.scripts.map(validateProjectScript);
		if (new Set(scripts.map(script => script.id)).size !== scripts.length) throw new Error("Invalid project script.");
		if (scripts.filter(script => script.runOnSettle).length > 1) throw new Error("Only one script can run when a chat settles.");
		if (scripts.length) settings.scripts = scripts;
	}
	return settings;
}

export function validateProjectUpdate(value: unknown): ProjectUpdate {
	if (!plain(value) || typeof value.id !== "string" || !value.id || value.id.length > 200) throw new Error("Invalid project.");
	const update: ProjectUpdate = { id: value.id };
	if (value.name !== undefined) {
		if (typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 200 || hasControl(value.name)) throw new Error("Give the project a name of up to 200 characters.");
		update.name = value.name.trim();
	}
	if (value.settings !== undefined) update.settings = validateProjectSettings(value.settings);
	return update;
}

/** The project whose settings apply: a worktree uses its source project's, as a T3 worktree uses its project's. */
export function settingsProject<T extends ProjectLike>(projects: readonly T[], id: string | undefined): T | undefined {
	let project = projects.find(value => value.id === id);
	for (let hops = 0; project?.worktree && hops < 20; hops++) {
		const source = projects.find(value => value.id === project!.worktree!.sourceProjectId);
		if (!source) break;
		project = source;
	}
	return project;
}

/** The auto-settle rules for a project: its overrides, else the workspace preferences. */
export function autoSettleRules(preferences: Pick<WorkspacePreferences, "autoSettleAfterDays" | "autoSettleOnMerge" | "keepPullRequests">, settings?: ProjectSettings): AutoSettleRules {
	return {
		days: settings?.autoSettleAfterDays !== undefined ? settings.autoSettleAfterDays : preferences.autoSettleAfterDays,
		onMerge: settings?.autoSettleOnMerge ?? preferences.autoSettleOnMerge,
		keepPullRequests: settings?.keepPullRequests ?? preferences.keepPullRequests,
	};
}

type ChatLike = { id: string; projectId?: string; archived: boolean; settledOverride?: "settled" | "active"; delegation?: { parentTaskId?: string } };

/**
 * Where a settled chat's settle scripts run, after T3's cleanUpSettledThread: only in the chat's own worktree.
 * A project's main checkout, or a worktree another open chat still uses, is shared, so nothing runs there.
 */
export function settleScriptTarget(chat: ChatLike, projects: readonly ProjectLike[], chats: readonly ChatLike[]): { directory: string; script: ProjectScript } | undefined {
	const project = projects.find(value => value.id === chat.projectId);
	if (!project?.worktree || project.worktree.removedAt) return;
	if (chats.some(other => other.id !== chat.id && other.projectId === project.id && !other.archived && !other.delegation?.parentTaskId && other.settledOverride !== "settled")) return;
	const script = settleScript(settingsProject(projects, project.id)?.settings?.scripts ?? []);
	return script ? { directory: project.directory, script } : undefined;
}

/** T3's settle script: the one that runs in a chat's worktree when the chat settles. */
export const settleScript = (scripts: readonly ProjectScript[]) => scripts.find(script => script.runOnSettle);
/** T3's one-click script in the chat header: the first that is neither setup nor settle, else the first that is not settle. */
export const primaryScript = (scripts: readonly ProjectScript[]) => scripts.find(script => !script.runOnWorktreeCreate && !script.runOnSettle) ?? scripts.find(script => !script.runOnSettle);
/** A script's name with its roles, as T3's script menu shows it. */
export function scriptMenuLabel(script: ProjectScript) {
	const roles = [...script.runOnWorktreeCreate ? ["setup"] : [], ...script.runOnSettle ? ["on settle"] : []];
	return roles.length ? `${script.name} (${roles.join(", ")})` : script.name;
}

/** Scripts to start in a newly created worktree of a project. */
export const worktreeCreateScripts = (projects: readonly ProjectLike[], projectId: string) => settingsProject(projects, projectId)?.settings?.scripts?.filter(script => script.runOnWorktreeCreate) ?? [];

/** A new script id that is not in use. */
export function newScriptId(name: string, scripts: readonly ProjectScript[]) {
	const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "script";
	let id = base;
	for (let index = 2; scripts.some(script => script.id === id); index++) id = `${base}-${index}`;
	return id;
}

/**
 * Each project action as a keyboard shortcut command (T3 binds `script.<id>.run`). Worktrees share their project's
 * actions, so only projects have commands; a chat in a worktree runs its project's.
 */
export function projectActionCommands(projects: readonly ProjectLike[]): CommandInfo[] {
	return projects.filter(project => !project.worktree).flatMap(project => (project.settings?.scripts ?? []).map(script => ({ command: scriptCommand(project.id, script.id), label: `Run ${script.name} in ${project.name}`, group: "Project actions", keys: [] })));
}

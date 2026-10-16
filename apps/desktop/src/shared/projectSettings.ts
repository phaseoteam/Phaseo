import { scriptCommand, type CommandInfo } from "./keybindings";
import type { WorkspacePreferences } from "./preferences";
import { autoSettleDays, type AutoSettleRules } from "./threadLifecycle";

/** T3 Code's script icons. */
export const projectScriptIcons = ["play", "test", "lint", "configure", "build", "debug"] as const;
export type ProjectScriptIcon = typeof projectScriptIcons[number];
/** A named command for a project, after T3 Code's project scripts: run from the chat header, when a worktree is made, or when a chat settles. */
export type ProjectScript = {
	id: string; name: string; command: string; icon: ProjectScriptIcon; runOnWorktreeCreate: boolean; runOnSettle?: boolean;
	/** T3's preview URL: the page the action serves, opened in the chat's browser when autoOpenPreview is on. */
	previewUrl?: string; autoOpenPreview?: boolean;
};
/**
 * One project's own settings, after T3's project overrides. An absent auto-settle key follows Settings → General;
 * autoSettleAfterDays null means never. Worktrees use their source project's settings.
 */
export type ProjectSettings = { autoSettleAfterDays?: number | null; autoSettleOnMerge?: boolean; keepPullRequests?: boolean; scripts?: ProjectScript[]; icon?: ProjectIcon };
/** T3's project icon colours. */
export const projectIconColors = ["gray", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"] as const;
export type ProjectIconColor = typeof projectIconColors[number];
/** T3's project icon choices: a Lucide icon with a colour, an emoji, or a coloured monogram of one or two letters. */
export type ProjectIcon = { kind: "lucide"; name: string; color: ProjectIconColor } | { kind: "emoji"; emoji: string } | { kind: "monogram"; text: string; color: ProjectIconColor };
export type ProjectUpdate = { id: string; name?: string; settings?: ProjectSettings };
export const maximumProjectScripts = 30;

type ProjectLike = { id: string; name: string; directory: string; worktree?: { sourceProjectId: string; removedAt?: string }; settings?: ProjectSettings };

const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasControl = (value: string, allowNewlines = false) => [...value].some(character => { const code = character.charCodeAt(0); return (code < 32 && !(allowNewlines && (code === 9 || code === 10 || code === 13))) || code === 127; });

export function validateProjectScript(value: unknown): ProjectScript {
	if (!plain(value)) throw new Error("Invalid project script.");
	const { id, name, command, icon, runOnWorktreeCreate, runOnSettle, previewUrl, autoOpenPreview } = value;
	if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid project script.");
	if (typeof name !== "string" || !name.trim() || name.trim().length > 80 || hasControl(name)) throw new Error("Give each script a name of up to 80 characters.");
	if (typeof command !== "string" || !command.trim() || command.length > 10_000 || hasControl(command, true)) throw new Error(`Give “${name.trim()}” a command of up to 10,000 characters.`);
	if (typeof icon !== "string" || !(projectScriptIcons as readonly string[]).includes(icon)) throw new Error("Choose an icon for each script.");
	if (typeof runOnWorktreeCreate !== "boolean" || (runOnSettle !== undefined && typeof runOnSettle !== "boolean") || (autoOpenPreview !== undefined && typeof autoOpenPreview !== "boolean")) throw new Error("Invalid project script.");
	const preview = previewUrl === undefined || previewUrl === null || (typeof previewUrl === "string" && !previewUrl.trim()) ? undefined : normalisePreviewUrl(previewUrl, name.trim());
	return { id, name: name.trim(), command: command.trim(), icon: icon as ProjectScriptIcon, runOnWorktreeCreate, ...(runOnSettle ? { runOnSettle: true } : {}), ...(preview ? { previewUrl: preview, ...(autoOpenPreview ? { autoOpenPreview: true } : {}) } : {}) };
}

/** A preview URL as typed: "localhost:5173" gets http://, as T3's preview does; anything but a web address is refused. */
export function normalisePreviewUrl(value: unknown, name = "the action"): string {
	if (typeof value !== "string" || value.trim().length > 2000 || hasControl(value)) throw new Error(`Give “${name}” a preview URL of up to 2,000 characters.`);
	const text = value.trim();
	let url: URL;
	try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`); } catch { throw new Error(`The preview URL for “${name}” is not a web address.`); }
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error(`Use an http or https preview URL for “${name}”, without a user name or password.`);
	return url.href;
}

const graphemes = (value: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;

/** Checks a project icon as T3's contracts do; a monogram is one or two letters or numbers. */
export function validateProjectIcon(value: unknown): ProjectIcon {
	if (!plain(value)) throw new Error("Invalid project icon.");
	const color = value.color;
	const validColor = typeof color === "string" && (projectIconColors as readonly string[]).includes(color);
	if (value.kind === "lucide" && typeof value.name === "string" && value.name.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.name) && validColor) return { kind: "lucide", name: value.name, color: color as ProjectIconColor };
	if (value.kind === "emoji" && typeof value.emoji === "string" && value.emoji.trim() && value.emoji.trim().length <= 32 && !hasControl(value.emoji) && graphemes(value.emoji.trim()) === 1) return { kind: "emoji", emoji: value.emoji.trim() };
	if (value.kind === "monogram" && typeof value.text === "string" && validColor) {
		const text = value.text.normalize("NFKC").trim().toUpperCase();
		if (text.length <= 32 && /^[\p{L}\p{N}][\p{L}\p{N}\p{M}‌‍]*$/u.test(text) && graphemes(text) <= 2) return { kind: "monogram", text, color: color as ProjectIconColor };
		throw new Error("A monogram is one or two letters or numbers.");
	}
	throw new Error("Invalid project icon.");
}

/** T3's automatic project badge: two letters from the name and a colour that always comes out the same for it. */
export function projectIdentity(name: string): { monogram: string; color: ProjectIconColor } {
	const normalised = name.normalize("NFKC").trim();
	const words = normalised.match(/[\p{L}\p{N}]+/gu) ?? [];
	let monogram = "PR";
	if (words[0]) {
		const glyphs = Array.from(words[0]), first = glyphs[0];
		const second = glyphs.slice(1).find(glyph => /\p{N}/u.test(glyph)) ?? (words.length > 1 ? Array.from(words.at(-1) ?? "")[0] : glyphs.at(-1)) ?? first;
		monogram = Array.from(`${first}${second}`.toUpperCase()).slice(0, 2).join("");
	}
	let index = 0;
	for (const glyph of normalised.toLocaleLowerCase("en-US") || "project") index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % projectIconColors.length;
	return { monogram, color: projectIconColors[index] ?? "blue" };
}

/** A script declared in a checkout's t3.json, T3's checked-in project file, offered for import. */
export type T3ProjectScript = { name: string; command: string; icon?: ProjectScriptIcon; runOnWorktreeCreate?: boolean; runOnSettle?: boolean; previewUrl?: string; autoOpenPreview?: boolean };
export type T3ProjectFileState = { status: "missing" | "invalid" | "ok"; scripts: T3ProjectScript[] };
export const t3ProjectFileName = "t3.json";

/** Reads t3.json as T3's schema does: one bad entry makes the whole file invalid, so nothing in it is offered. */
export function parseT3ProjectFile(text: string): T3ProjectScript[] {
	const value: unknown = JSON.parse(text);
	if (!plain(value)) throw new Error("t3.json must be an object.");
	if (value.scripts === undefined) return [];
	if (!Array.isArray(value.scripts) || value.scripts.length > 50) throw new Error("scripts must be a list of up to 50 scripts.");
	return value.scripts.map((raw, index): T3ProjectScript => {
		if (!plain(raw)) throw new Error(`Script ${index + 1} must be an object.`);
		const text = (key: string, maximum: number) => { const field = raw[key]; if (typeof field !== "string" || !field.trim() || field.length > maximum) throw new Error(`Script ${index + 1} needs a ${key}.`); return field.trim(); };
		const flag = (key: string) => { const field = raw[key]; if (field !== undefined && typeof field !== "boolean") throw new Error(`Script ${index + 1} has an invalid ${key}.`); return field === true; };
		if (raw.icon !== undefined && !(projectScriptIcons as readonly string[]).includes(raw.icon as string)) throw new Error(`Script ${index + 1} has an unknown icon.`);
		const previewUrl = raw.previewUrl === undefined ? undefined : text("previewUrl", 2000);
		return { name: text("name", 200), command: text("command", 10_000), ...(raw.icon ? { icon: raw.icon as ProjectScriptIcon } : {}), ...(flag("runOnWorktreeCreate") ? { runOnWorktreeCreate: true } : {}), ...(flag("runOnSettle") ? { runOnSettle: true } : {}), ...(previewUrl ? { previewUrl, ...(flag("autoOpenPreview") ? { autoOpenPreview: true } : {}) } : {}) };
	});
}

/** T3's import list: t3.json scripts not already saved under the same command or name. */
export const importableScripts = (fileScripts: readonly T3ProjectScript[], scripts: readonly ProjectScript[]) =>
	fileScripts.filter(file => !scripts.some(script => script.command === file.command || script.name.toLowerCase() === file.name.toLowerCase()));

/** A t3.json script as a new action, with T3's defaults. */
export const scriptFromProjectFile = (file: T3ProjectScript): Omit<ProjectScript, "id"> => ({
	name: file.name, command: file.command, icon: file.icon ?? "play", runOnWorktreeCreate: file.runOnWorktreeCreate ?? false,
	...(file.runOnSettle ? { runOnSettle: true } : {}), ...(file.previewUrl ? { previewUrl: file.previewUrl, ...(file.autoOpenPreview ? { autoOpenPreview: true } : {}) } : {}),
});

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
	if (value.icon !== undefined) settings.icon = validateProjectIcon(value.icon);
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

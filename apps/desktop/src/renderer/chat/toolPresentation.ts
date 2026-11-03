import type { AgentActivity } from "../../shared/workspace";

/**
 * Plain-language rows for a turn's tool calls: "Read src/app.ts" or "Changed theme to dark", rather than a tool's
 * name and its raw JSON, which stay in the row's details. Harnesses report calls differently (a name with JSON input
 * and output, a shell command as the title, or a label and output only), so each reader below takes what it can.
 */
export type ToolAction = "command" | "read" | "edit" | "search" | "web" | "app-change" | "app-read" | "thread" | "tools" | "agent" | "other";
export type ToolPresentation = { label: string; action: ToolAction };

type Input = Record<string, unknown>;
type Tense = readonly [running: string, done: string];
const verbs = {
	ran: ["Running", "Ran"], read: ["Reading", "Read"], edited: ["Editing", "Edited"], wrote: ["Writing", "Wrote"], deleted: ["Deleting", "Deleted"],
	searched: ["Searching for", "Searched for"], found: ["Finding files matching", "Found files matching"], listed: ["Listing", "Listed"],
	web: ["Searching the web for", "Searched the web for"], fetched: ["Fetching", "Fetched"], changed: ["Changing", "Changed"], checked: ["Checking", "Checked"],
} as const satisfies Record<string, Tense>;

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : undefined;
const shortPath = (value: unknown) => text(value)?.replaceAll("\\", "/").split("/").slice(-3).join("/");
/** A tool's own name: Claude Code calls MCP tools mcp__server__tool. */
export const toolName = (title: string) => title.replace(/^mcp__.+?__/, "");
const humanise = (name: string) => { const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase(); return words.charAt(0).toUpperCase() + words.slice(1); };

/** The call's JSON input, when the row's text starts with it (the Claude and Cursor adapters write it first). */
export function toolInput(activity: Pick<AgentActivity, "text">): Input | undefined {
	const head = activity.text.split("\n\n")[0]?.trim();
	if (!head?.startsWith("{")) return undefined;
	try { const value = JSON.parse(head) as unknown; return value && typeof value === "object" && !Array.isArray(value) ? // Cursor writes { args, result }; an app command's own input also has args, but no result.
(("args" in value && "result" in value && value.args && typeof value.args === "object") ? value.args as Input : value as Input) : undefined; } catch { return undefined; }
}

const settingLabels: Record<string, string> = { colourTheme: "colour theme", sendKey: "send key", notifications: "desktop alerts", autopilot: "Allow Autopilot", maxActiveAgents: "agents running at once" };
const areaLabels: Record<string, string> = { projects: "projects", instructions: "global instructions", mcp: "MCP servers", agents: "agents", accounts: "accounts", keybindings: "keyboard shortcuts", themes: "colour themes", defaultModel: "the default model", factory: "Factory settings" };
const scalar = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;

function appCommand(input: Input | undefined, running: boolean): ToolPresentation {
	const command = text(input?.command), args = (input?.args && typeof input.args === "object" ? input.args : {}) as Input;
	const tense = (pair: Tense) => pair[running ? 0 : 1];
	if (command === "settings.set") {
		const key = text(args.key) ?? "a setting", value = scalar(args.value);
		return { label: `${tense(verbs.changed)} ${settingLabels[key] ?? humanise(key).toLowerCase()}${value && !running ? ` to ${value}` : ""}`, action: "app-change" };
	}
	if (command === "config.set") {
		// Colours are the change worth seeing at a glance: "Changed colour themes (dark accent #ff5500)".
		const value = (args.value && typeof args.value === "object" ? args.value : {}) as Input;
		const colours = text(args.area) === "themes" ? (["light", "dark"] as const).flatMap(mode => { const half = value[mode] as Input | undefined; return half && typeof half === "object" ? (["accent", "canvas"] as const).flatMap(field => text(half[field]) ? [`${mode} ${field === "canvas" ? "background" : field} ${text(half[field])}`] : []) : []; }) : [];
		return { label: `${tense(verbs.changed)} ${areaLabels[text(args.area) ?? ""] ?? "the configuration"}${colours.length && !running ? ` (${colours.join(", ")})` : ""}`, action: "app-change" };
	}
	if (command === "settings.list") return { label: `${tense(verbs.checked)} ${text(args.query) ? `settings for “${text(args.query)}”` : "settings"}`, action: "app-read" };
	if (command === "config.get") return { label: `${tense(verbs.checked)} ${areaLabels[text(args.area) ?? ""] ?? "the configuration"}`, action: "app-read" };
	if (command === "app.state") return { label: running ? "Checking the window" : "Checked the window", action: "app-read" };
	if (command === "theme.set") return { label: `${tense(verbs.changed)} theme${!running && scalar(args.theme) ? ` to ${scalar(args.theme)}` : ""}`, action: "app-change" };
	return { label: command ? `${running ? "Running" : "Ran"} app command ${command}` : "Used the app", action: "app-change" };
}

/** What a row says, for its tool, input and status. */
export function presentTool(activity: Pick<AgentActivity, "title" | "text" | "status">): ToolPresentation {
	const name = toolName(activity.title), key = name.toLowerCase(), input = toolInput(activity), running = activity.status === "running";
	const say = (pair: Tense, object: string | undefined, action: ToolAction, fallback = "") => ({ label: `${pair[running ? 0 : 1]} ${object ?? fallback}`.trim(), action });
	switch (key) {
		case "bash": case "run_command": case "shell": case "powershell": return say(verbs.ran, text(input?.command), "command", "a command");
		case "read": case "read_file": case "view_image": case "notebookread": return say(verbs.read, shortPath(input?.file_path ?? input?.path ?? input?.filename), "read", "a file");
		case "edit": case "multiedit": case "edit_file": case "notebookedit": return say(verbs.edited, shortPath(input?.file_path ?? input?.path ?? input?.notebook_path), "edit", "a file");
		case "write": case "write_file": return say(verbs.wrote, shortPath(input?.file_path ?? input?.path), "edit", "a file");
		case "delete_file": return say(verbs.deleted, shortPath(input?.path), "edit", "a file");
		case "grep": case "search_files": return say(verbs.searched, text(input?.pattern ?? input?.query) && `“${text(input?.pattern ?? input?.query)}”`, "search", "text");
		case "glob": case "find_files": return say(verbs.found, text(input?.pattern ?? input?.query), "search", "a pattern");
		case "ls": case "list_files": return say(verbs.listed, shortPath(input?.path ?? input?.directory), "search", "files");
		case "websearch": case "web_search": return say(verbs.web, text(input?.query) && `“${text(input?.query)}”`, "web", "an answer");
		case "webfetch": case "web_fetch": return say(verbs.fetched, text(input?.url), "web", "a page");
		case "filechange": return { label: running ? "Editing files" : "Edited files", action: "edit" };
		case "mcptoolcall": case "dynamictoolcall": return { label: running ? "Using a tool" : "Used a tool", action: "other" };
		case "toolsearch": case "load_tools": return { label: running ? "Loading tools" : "Loaded tools", action: "tools" };
		case "todowrite": return { label: running ? "Updating the plan" : "Updated the plan", action: "other" };
		case "task": case "agent": return { label: `${running ? "Starting" : "Started"} an agent${text(input?.description) ? `: ${text(input?.description)}` : ""}`, action: "agent" };
		case "skill": case "load_skill": return { label: `${running ? "Loading" : "Loaded"} skill${text(input?.skill ?? input?.name) ? ` ${text(input?.skill ?? input?.name)}` : ""}`, action: "tools" };
		case "askuserquestion": case "ask_user": return { label: running ? "Asking you" : "Asked you", action: "other" };
		case "list_app_commands": return { label: running ? "Looking up app commands" : "Looked up app commands", action: "app-read" };
		case "run_app_command": return appCommand(input, running);
		case "list_threads": case "read_thread": case "wait_thread": case "send_thread": case "steer_thread": case "launch_thread": case "launch_threads": case "delegate_task":
			return { label: `${humanise(name)}${text(input?.title) ? `: ${text(input?.title)}` : ""}`, action: "thread" };
	}
	// A Codex command arrives as its own title.
	if (/\s/.test(activity.title) && !/^[A-Z][a-z]+ [a-z]/.test(activity.title)) return { label: `${running ? "Running" : "Ran"} ${text(activity.title)}`, action: "command" };
	return { label: /\s/.test(name) ? name : humanise(name), action: "other" };
}

/** The first sentence of a thought, for its row; the whole thought shows when the row opens. */
export function thoughtLine(markdown: string) {
	const heading = /^\s*\*\*([^*\r\n]+)\*\*/.exec(markdown)?.[1];
	const plain = (heading ?? markdown).replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+\.)[ \t]+/gm, "").replace(/`+|\*\*|~~/g, "").replace(/\s+/g, " ").trim();
	if (heading) return plain;
	const end = /[.?!]["'”’)]?(?=\s)/.exec(plain);
	return end ? plain.slice(0, end.index + end[0].length) : plain;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const groupLabels: Record<ToolAction, (count: number) => string> = {
	"app-change": count => `Changed ${plural(count, "setting", "settings")}`,
	edit: count => `Edited ${plural(count, "file", "files")}`,
	command: count => `Ran ${plural(count, "command", "commands")}`,
	thread: count => `Used ${plural(count, "chat", "chats")}`,
	agent: count => `Started ${plural(count, "agent", "agents")}`,
	read: count => `Read ${plural(count, "file", "files")}`,
	search: count => `Searched ${count === 1 ? "once" : `${count} times`}`,
	web: count => `Searched the web ${count === 1 ? "once" : `${count} times`}`,
	"app-read": count => `Checked the app ${count === 1 ? "once" : `${count} times`}`,
	tools: count => `Loaded tools ${count === 1 ? "once" : `${count} times`}`,
	other: count => `Used ${plural(count, "tool", "tools")}`,
};
/** Changes lead a summary; looking things up comes after. */
const priority: ToolAction[] = ["app-change", "edit", "command", "thread", "agent", "read", "search", "web", "app-read", "other", "tools"];

/** One line for a turn's tool calls: at most two kinds by what they did, and a count of the rest. */
export function summarizeTools(presentations: readonly ToolPresentation[]) {
	const counts = new Map<ToolAction, number>();
	for (const { action } of presentations) counts.set(action, (counts.get(action) ?? 0) + 1);
	const kinds = priority.filter(action => counts.has(action));
	const shown = kinds.slice(0, 2), rest = kinds.slice(2).reduce((sum, action) => sum + counts.get(action)!, 0);
	const parts = [...shown.map(action => groupLabels[action](counts.get(action)!)), ...rest ? [`${plural(rest, "other action", "other actions")}`] : []];
	const sentence = parts.map((part, index) => index ? part.charAt(0).toLowerCase() + part.slice(1) : part);
	return sentence.length < 3 ? sentence.join(" and ") : `${sentence.slice(0, -1).join(", ")} and ${sentence.at(-1)}`;
}

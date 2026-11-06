import { configAreaIds } from "./appConfig";

/**
 * Every user-facing app action, in one typed list. The command palette shows presets over it, and agents reach the
 * same commands through list_app_commands and run_app_command, so a new action needs one entry here and one handler.
 * `surface` says where it runs: renderer commands change what the window shows; main commands change workspace state.
 * `agent: false` keeps a command for the person alone.
 */
export type AppCommandArgument = { name: string; type: "string" | "boolean" | "enum" | "json"; values?: readonly string[]; required?: boolean; maxLength?: number; description: string };
export type AppCommand = { id: string; title: string; group: "Navigate" | "View" | "Chats" | "Operator"; description: string; surface: "renderer" | "main"; agent: boolean; args?: readonly AppCommandArgument[] };

// Every Settings page an agent can open; a project's settings need its id, so they open from the project instead.
const pages = ["general", "appearance", "chat", "diffs", "threads", "browser", "source-control", "worktrees", "maintenance", "notifications", "phaseo-account", "accounts", "usage", "agents", "mcp", "code-hosts", "outside-agents", "keyboard", "diagnostics", "experimental"] as const;
const panes = ["changes", "files", "diff", "terminal", "browser", "agents", "pulls"] as const;

export const appCommands = [
	{ id: "app.state", title: "Read what is on screen", group: "View", description: "What the window shows now: mode (chat or code), the open chat, the open page, the right pane, the theme and whether the sidebar is open.", surface: "renderer", agent: true },
	{ id: "chat.new", title: "New chat", group: "Chats", description: "Open the new-chat composer. With draft, the message box holds that text for the person to edit and send; nothing is sent.", surface: "renderer", agent: true, args: [{ name: "draft", type: "string", maxLength: 20000, description: "Text to put in the message box." }] },
	{ id: "chat.open", title: "Open chat", group: "Chats", description: "Show a chat in the window.", surface: "renderer", agent: true, args: [{ name: "threadId", type: "string", required: true, maxLength: 100, description: "The chat's id." }] },
	{ id: "mode.set", title: "Switch mode", group: "Navigate", description: "Switch the window between Chat and Code.", surface: "renderer", agent: true, args: [{ name: "mode", type: "enum", values: ["chat", "code"], required: true, description: "chat or code." }] },
	{ id: "inbox.open", title: "Inbox", group: "Navigate", description: "Open the Inbox: everything waiting on the person.", surface: "renderer", agent: true },
	{ id: "usage.open", title: "Usage", group: "Navigate", description: "Open Usage on cost, tokens or subscription limits.", surface: "renderer", agent: true, args: [{ name: "view", type: "enum", values: ["cost", "tokens", "limits"], description: "Which view; default cost." }] },
	{ id: "scheduled.open", title: "Scheduled tasks", group: "Navigate", description: "Open the scheduled tasks page.", surface: "renderer", agent: true },
	{ id: "pullRequests.open", title: "Open pull requests", group: "Navigate", description: "Open the Pull requests page.", surface: "renderer", agent: true },
	{ id: "factory.open", title: "Factory", group: "Navigate", description: "Open Code ▸ Factory, on a work item when given.", surface: "renderer", agent: true, args: [{ name: "item", type: "string", maxLength: 300, description: "A work item as owner/repo#number." }] },
	{ id: "settings.open", title: "Settings", group: "Navigate", description: "Open Settings on a page.", surface: "renderer", agent: true, args: [{ name: "page", type: "enum", values: pages, description: "Which page; default general." }] },
	{ id: "sidebar.set", title: "Show or hide the sidebar", group: "View", description: "Show or hide the sidebar; omit open to toggle it.", surface: "renderer", agent: true, args: [{ name: "open", type: "boolean", description: "true shows it, false hides it." }] },
	{ id: "pane.open", title: "Open the right pane", group: "View", description: "Show a surface in the right pane beside the open chat.", surface: "renderer", agent: true, args: [{ name: "surface", type: "enum", values: panes, required: true, description: "Which surface." }] },
	{ id: "pane.close", title: "Close the right pane", group: "View", description: "Close the right pane.", surface: "renderer", agent: true },
	{ id: "theme.set", title: "Change theme", group: "View", description: "Use the light, dark or system theme.", surface: "renderer", agent: true, args: [{ name: "theme", type: "enum", values: ["light", "dark", "system"], required: true, description: "light, dark or system." }] },
	{ id: "toast.show", title: "Show a notification", group: "View", description: "Show a short notification in the window, for something the person should see now.", surface: "renderer", agent: true, args: [{ name: "title", type: "string", required: true, maxLength: 120, description: "One line." }, { name: "detail", type: "string", maxLength: 500, description: "Optional second line." }, { name: "tone", type: "enum", values: ["info", "success", "warning", "error"], description: "Default info." }] },
	{ id: "settings.list", title: "List settings", group: "View", description: "Every setting with its page, type, allowed values, current value, whether it is kept on this device or in the workspace.", surface: "renderer", agent: true, args: [{ name: "query", type: "string", maxLength: 200, description: "Words to narrow the list, such as theme or notifications." }] },
	{ id: "settings.set", title: "Change a setting", group: "View", description: "Change one setting from settings.list, as the person would in Settings.", surface: "renderer", agent: true, args: [{ name: "key", type: "string", required: true, maxLength: 100, description: "The setting's key from settings.list." }, { name: "value", type: "json", required: true, description: "The new value, of the setting's type (true or false, one of its values, a number, an object, or null where allowed)." }] },
	{ id: "config.get", title: "Read configuration", group: "View", description: `Read one area of the app's configuration: ${configAreaIds.join(", ")} (themes holds colour themes with their background and accent colours). Without area, lists the areas and what config.set takes for each. Single settings such as light or dark are in settings.list.`, surface: "renderer", agent: true, args: [{ name: "area", type: "enum", values: configAreaIds, description: "Which area." }] },
	{ id: "config.set", title: "Change configuration", group: "View", description: "Change one area of the app's configuration, as the person would on its Settings page. config.get without area says what value each area takes.", surface: "renderer", agent: true, args: [{ name: "area", type: "enum", values: configAreaIds, required: true, description: "Which area." }, { name: "value", type: "json", required: true, description: "The change, in the shape config.get describes for the area." }] },
	{ id: "palette.open", title: "Search chats and commands", group: "Navigate", description: "Open the command palette.", surface: "renderer", agent: true },
	{ id: "operator.open", title: "Operator", group: "Operator", description: "Open the operator chat, creating it the first time.", surface: "main", agent: true },
	{ id: "operator.pause", title: "Pause the operator", group: "Operator", description: "Stop the operator and its agents and hold its events until the person resumes it.", surface: "main", agent: true },
	{ id: "operator.resume", title: "Resume the operator", group: "Operator", description: "Deliver held events and let events wake the operator again.", surface: "main", agent: false },
	{ id: "operator.raiseCap", title: "Raise the operator's spend cap", group: "Operator", description: "Raise the operator's spend cap by $5.", surface: "main", agent: false },
] as const satisfies readonly AppCommand[];

export type AppCommandId = typeof appCommands[number]["id"];
export type AppCommandArgs = Record<string, unknown>;
export type AppCommandRequest = { requestId: string; command: AppCommandId; args: AppCommandArgs };
export type AppCommandResult = { requestId: string; ok: true; result?: unknown } | { requestId: string; ok: false; error: string };
/** What app.state reports. */
export type AppState = { mode: "chat" | "code"; openChat?: { id: string; title: string }; page?: string; rightPane?: string; theme: string; sidebarOpen: boolean };

export const appCommand = (id: string): AppCommand | undefined => (appCommands as readonly AppCommand[]).find(command => command.id === id);

/** Checks a command and its arguments against the registry; agents may only run agent commands. */
export function validateAppCommand(id: unknown, raw: unknown, caller: "agent" | "person"): { command: AppCommand; args: AppCommandArgs } {
	const command = typeof id === "string" ? appCommand(id) : undefined;
	if (!command) throw new Error("Unknown app command; list_app_commands lists them.");
	if (caller === "agent" && !command.agent) throw new Error(`${command.title} is for the person only.`);
	if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) throw new Error("args must be an object.");
	const input = (raw ?? {}) as Record<string, unknown>, known = command.args ?? [];
	const unknown = Object.keys(input).find(name => !known.some(argument => argument.name === name));
	if (unknown) throw new Error(`${command.id} takes no ${unknown} argument.`);
	const args: AppCommandArgs = {};
	for (const argument of known) {
		const value = input[argument.name];
		if (value === undefined) { if (argument.required) throw new Error(`${command.id} needs ${argument.name}.`); continue; }
		if (argument.type === "json") { if (JSON.stringify(value).length > 20000) throw new Error(`${argument.name} is too large.`); args[argument.name] = value; continue; }
		if (argument.type === "boolean") { if (typeof value !== "boolean") throw new Error(`${argument.name} must be true or false.`); args[argument.name] = value; continue; }
		if (typeof value !== "string" || !value.trim()) throw new Error(`${argument.name} must be text.`);
		if (argument.type === "enum" && !argument.values!.includes(value)) throw new Error(`${argument.name} must be one of ${argument.values!.join(", ")}.`);
		if (argument.maxLength && value.length > argument.maxLength) throw new Error(`${argument.name} is longer than ${argument.maxLength} characters.`);
		args[argument.name] = value;
	}
	return { command, args };
}

/** The palette's presets over the registry: what the person picks, and the command and arguments it runs. */
export type PaletteEntry = { title: string; command: AppCommandId; args?: AppCommandArgs; keywords?: string };
export const paletteEntries: readonly PaletteEntry[] = [
	{ title: "New chat", command: "chat.new" },
	{ title: "Operator", command: "operator.open", keywords: "meta agent command threads events subscriptions" },
	{ title: "Switch to Chat", command: "mode.set", args: { mode: "chat" } },
	{ title: "Switch to Code", command: "mode.set", args: { mode: "code" } },
	{ title: "Inbox", command: "inbox.open", keywords: "needs you waiting attention autopilot log decisions" },
	{ title: "Usage", command: "usage.open", keywords: "cost tokens spend today pace forecast pull requests settled" },
	{ title: "Usage limits", command: "usage.open", args: { view: "limits" }, keywords: "subscriptions rings" },
	{ title: "Scheduled tasks", command: "scheduled.open" },
	{ title: "Open pull requests", command: "pullRequests.open", keywords: "prs pr github review merge branch" },
	{ title: "Toggle sidebar", command: "sidebar.set" },
	{ title: "Show files and changes", command: "pane.open", args: { surface: "changes" } },
	{ title: "Open terminal", command: "pane.open", args: { surface: "terminal" } },
	{ title: "Open browser", command: "pane.open", args: { surface: "browser" } },
	{ title: "Settings", command: "settings.open" },
	{ title: "Accounts and sign-in", command: "settings.open", args: { page: "accounts" } },
	{ title: "Phaseo account", command: "settings.open", args: { page: "phaseo-account" }, keywords: "sign in login github google gitlab email credits" },
	{ title: "Keyboard shortcuts", command: "settings.open", args: { page: "keyboard" } },
	{ title: "Diagnostics", command: "settings.open", args: { page: "diagnostics" }, keywords: "processes cpu memory traces logs slow failures" },
];

/** list_app_commands: what an agent may run, optionally narrowed by words in the id, title or description. */
export function agentAppCommands(query?: string) {
	const words = query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
	return (appCommands as readonly AppCommand[]).filter(command => command.agent && words.every(word => `${command.id} ${command.title} ${command.description}`.toLowerCase().includes(word)))
		.map(command => ({ id: command.id, title: command.title, description: command.description, ...command.args?.length ? { args: command.args } : {} }));
}

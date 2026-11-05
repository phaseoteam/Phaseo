import type { AgentActivity } from "../../shared/workspace";

/**
 * Plain-language rows for a turn's tool calls: "Read src/app.ts" or "Changed theme to dark", rather than a tool's
 * name and its raw JSON, which stay in the row's details. Harnesses report calls differently (a name with JSON input
 * and output, a shell command as the title, or a label and output only), so each reader below takes what it can.
 */
export type ToolAction = "command" | "read" | "edit" | "search" | "web" | "browser" | "page" | "preview" | "app-change" | "app-read" | "thread" | "tools" | "agent" | "other";
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

type Sentence = (input: Input | undefined, running: boolean) => ToolPresentation;
/** A sentence with nothing to fill in. */
const fixed = (runningLabel: string, doneLabel: string, action: ToolAction): Sentence => (_input, running) => ({ label: running ? runningLabel : doneLabel, action });
/** A sentence naming what the call worked on, when its input says; otherwise the fallback. */
const about = (pair: Tense, object: (input: Input | undefined) => string | undefined, fallback: string, action: ToolAction): Sentence => (input, running) => ({ label: `${pair[running ? 0 : 1]} ${object(input) ?? fallback}`, action });
const quoted = (value: unknown) => text(value) && `“${text(value)}”`;
/** A page or link by its host and path, without the scheme. */
const address = (value: unknown) => text(value)?.replace(/^https?:\/\//, "").replace(/\/$/, "");
const count = (value: unknown, one: string, many: string) => Array.isArray(value) && value.length > 1 ? `${value.length} ${many}` : one;

/** Tools of every agent and of the app's own orchestration, browser and Factory, as plain sentences. */
const sentences: Record<string, Sentence> = {
	// Pages
	html_preview: fixed("Checking how the page looks", "Checked how the page looks", "preview"),
	html_render: about(["Showing", "Showed"], input => quoted(input?.title), "a page", "page"),
	// Chats this one works with
	list_threads: fixed("Looking through chats", "Looked through chats", "thread"),
	search_threads: about(["Searching chats for", "Searched chats for"], input => quoted(input?.query), "a chat", "thread"),
	read_thread: fixed("Reading a chat", "Read a chat", "thread"),
	wait_thread: fixed("Waiting for a chat", "Waited for a chat", "thread"),
	send_thread: fixed("Messaging a chat", "Messaged a chat", "thread"),
	steer_thread: fixed("Steering a chat", "Steered a chat", "thread"),
	interrupt_thread: fixed("Stopping a chat", "Stopped a chat", "thread"),
	fork_thread: fixed("Forking a chat", "Forked a chat", "thread"),
	rename_thread: about(["Renaming the chat to", "Renamed the chat to"], input => quoted(input?.title), "something new", "thread"),
	launch_thread: about(["Starting a chat:", "Started a chat:"], input => text(input?.title), "", "thread"),
	launch_threads: (input, running) => ({ label: `${running ? "Starting" : "Started"} ${count(input?.threads, "a chat", "chats")}`, action: "thread" }),
	delegate_task: about(["Handing off:", "Handed off:"], input => text(input?.title), "a task", "agent"),
	handoff_thread: about(["Handing the chat to", "Handed the chat to"], input => text(input?.harness), "another agent", "thread"),
	configure_thread: (input, running) => ["model", "modelOptions", "mode", "permissionMode"].some(key => input?.[key] !== undefined) ? { label: running ? "Changing a chat's settings" : "Changed a chat's settings", action: "thread" } : { label: running ? "Checking a chat's settings" : "Checked a chat's settings", action: "thread" },
	merge_thread_context: fixed("Bringing in another chat's context", "Brought in another chat's context", "thread"),
	read_thread_queue: fixed("Checking a chat's queue", "Checked a chat's queue", "thread"),
	edit_thread_queue: fixed("Changing a chat's queue", "Changed a chat's queue", "thread"),
	read_pending_questions: fixed("Checking for questions to answer", "Checked for questions to answer", "thread"),
	answer_question: fixed("Answering a question", "Answered a question", "thread"),
	move_to_worktree: about(["Moving the chat to branch", "Moved the chat to branch"], input => text(input?.branch), "a worktree", "edit"),
	background_wait: fixed("Waiting for background work", "Waited for background work", "agent"),
	// Agents, models and projects
	list_agents: fixed("Looking up agents", "Looked up agents", "app-read"),
	list_models: fixed("Looking up models", "Looked up models", "app-read"),
	list_projects: fixed("Looking up projects", "Looked up projects", "app-read"),
	add_project: about(["Adding the project", "Added the project"], input => shortPath(input?.path), "a project", "app-change"),
	clone_project: about(["Cloning", "Cloned"], input => address(input?.url ?? input?.repository), "a repository", "app-change"),
	read_global_instructions: fixed("Reading your global instructions", "Read your global instructions", "app-read"),
	update_global_instructions: fixed("Updating your global instructions", "Updated your global instructions", "app-change"),
	request_secret: about(["Asking you for", "Asked you for"], input => text(input?.label), "a secret", "other"),
	// Pull requests and issues
	watch_pull_request: fixed("Watching a pull request", "Started watching a pull request", "thread"),
	unwatch_pull_request: fixed("Stopping watching a pull request", "Stopped watching a pull request", "thread"),
	link_pull_request: fixed("Linking a pull request", "Linked a pull request", "thread"),
	link_pull_requests: (input, running) => ({ label: `${running ? "Linking" : "Linked"} ${count(input?.pullRequests, "a pull request", "pull requests")}`, action: "thread" }),
	unlink_pull_request: fixed("Unlinking a pull request", "Unlinked a pull request", "thread"),
	unlink_pull_requests: fixed("Unlinking pull requests", "Unlinked pull requests", "thread"),
	list_thread_pull_requests: fixed("Checking linked pull requests", "Checked linked pull requests", "thread"),
	read_pull_request_guide: fixed("Reading the pull request guide", "Read the pull request guide", "read"),
	write_pull_request_guides: fixed("Writing pull request guides", "Wrote pull request guides", "edit"),
	watch_issue: fixed("Watching an issue", "Started watching an issue", "thread"),
	unwatch_issue: fixed("Stopping watching an issue", "Stopped watching an issue", "thread"),
	link_issue: fixed("Linking an issue", "Linked an issue", "thread"),
	unlink_issue: fixed("Unlinking an issue", "Unlinked an issue", "thread"),
	read_issue: fixed("Reading an issue", "Read an issue", "read"),
	list_thread_issues: fixed("Checking linked issues", "Checked linked issues", "thread"),
	draft_issue: about(["Drafting an issue:", "Drafted an issue:"], input => text(input?.title), "", "edit"),
	// Schedules and events
	schedule_task: about(["Scheduling", "Scheduled"], input => quoted(input?.title), "a task", "app-change"),
	list_scheduled_tasks: fixed("Looking up scheduled tasks", "Looked up scheduled tasks", "app-read"),
	update_scheduled_task: fixed("Changing a scheduled task", "Changed a scheduled task", "app-change"),
	delete_scheduled_task: fixed("Deleting a scheduled task", "Deleted a scheduled task", "app-change"),
	run_scheduled_task_now: fixed("Running a scheduled task now", "Ran a scheduled task now", "agent"),
	subscribe_events: fixed("Subscribing to events", "Subscribed to events", "app-change"),
	unsubscribe_events: fixed("Unsubscribing from events", "Unsubscribed from events", "app-change"),
	list_subscriptions: fixed("Checking subscriptions", "Checked subscriptions", "app-read"),
	// Factory
	list_work_items: fixed("Looking up work items", "Looked up work items", "app-read"),
	read_work_item: fixed("Reading a work item", "Read a work item", "read"),
	run_stage: about(["Running the stage", "Ran the stage"], input => quoted(input?.stage), "a stage", "agent"),
	// The built-in browser
	browser_open: about(["Opening", "Opened"], input => address(input?.url), "the browser", "browser"),
	browser_click: fixed("Clicking in the page", "Clicked in the page", "browser"),
	browser_type: about(["Typing", "Typed"], input => quoted(input?.text), "in the page", "browser"),
	browser_snapshot: fixed("Reading the page", "Read the page", "browser"),
	browser_screenshot: fixed("Taking a screenshot", "Took a screenshot", "browser"),
	browser_evaluate: fixed("Running a script in the page", "Ran a script in the page", "browser"),
	browser_wait_for: fixed("Waiting for the page", "Waited for the page", "browser"),
	browser_tabs: fixed("Checking the browser's tabs", "Checked the browser's tabs", "browser"),
	browser_close: fixed("Closing the browser tab", "Closed the browser tab", "browser"),
	browser_resize: fixed("Resizing the browser", "Resized the browser", "browser"),
	browser_dialog: fixed("Answering a page's dialog", "Answered a page's dialog", "browser"),
	browser_set_appearance: about(["Switching the browser to", "Switched the browser to"], input => text(input?.colorScheme) && `${text(input?.colorScheme)} mode`, "another look", "browser"),
	browser_recording_start: fixed("Starting a recording", "Started a recording", "browser"),
	browser_recording_stop: fixed("Stopping the recording", "Stopped the recording", "browser"),
	browser_act: fixed("Using the page", "Used the page", "browser"),
	// The Phaseo agent's own tools
	start_background_command: about(["Starting", "Started"], input => text(input?.command) && `${text(input?.command)} in the background`, "a background command", "command"),
	read_background_output: fixed("Reading a background command's output", "Read a background command's output", "command"),
	stop_background_command: fixed("Stopping a background command", "Stopped a background command", "command"),
	list_background_commands: fixed("Checking background commands", "Checked background commands", "command"),
	update_plan: fixed("Updating the plan", "Updated the plan", "other"),
	read_plan: fixed("Reading the plan", "Read the plan", "other"),
	propose_plan: fixed("Proposing a plan", "Proposed a plan", "other"),
	list_skills: fixed("Looking up skills", "Looked up skills", "tools"),
	// Other agents' own tools
	view_image: about(["Viewing", "Viewed"], input => shortPath(input?.path ?? input?.file_path), "an image", "read"),
	imageview: fixed("Viewing an image", "Viewed an image", "read"),
	list: about(verbs.listed, input => shortPath(input?.path), "files", "search"),
	delete: about(verbs.deleted, input => shortPath(input?.path ?? input?.file_path), "a file", "edit"),
	patch: fixed("Editing files", "Edited files", "edit"),
	applyagentdiff: fixed("Editing files", "Edited files", "edit"),
	semsearch: about(["Searching the code for", "Searched the code for"], input => quoted(input?.query), "an answer", "search"),
	readlints: fixed("Checking for problems", "Checked for problems", "read"),
	todoread: fixed("Reading the plan", "Read the plan", "other"),
	readtodos: fixed("Reading the plan", "Read the plan", "other"),
	updatetodos: fixed("Updating the plan", "Updated the plan", "other"),
	exitplanmode: fixed("Proposing a plan", "Proposed a plan", "other"),
	question: fixed("Asking you", "Asked you", "other"),
	askquestion: fixed("Asking you", "Asked you", "other"),
	bashoutput: fixed("Reading a background command's output", "Read a background command's output", "command"),
	killshell: fixed("Stopping a background command", "Stopped a background command", "command"),
	killbash: fixed("Stopping a background command", "Stopped a background command", "command"),
	listmcpresourcestool: fixed("Looking up MCP resources", "Looked up MCP resources", "tools"),
	readmcpresourcetool: about(["Reading", "Read"], input => text(input?.uri), "an MCP resource", "read"),
	slashcommand: about(["Running", "Ran"], input => text(input?.command), "a command", "command"),
	generateimage: fixed("Making an image", "Made an image", "other"),
	await: fixed("Waiting", "Waited", "other"),
	contextcompaction: fixed("Compacting context", "Compacted context", "other"),
	enteredreviewmode: fixed("Starting a review", "Started a review", "agent"),
	exitedreviewmode: fixed("Finishing the review", "Finished the review", "agent"),
	collabagenttoolcall: fixed("Working with another agent", "Worked with another agent", "agent"),
	// Cursor reports every MCP call as its "mcp" tool, naming the tool in its arguments.
	mcp: about(["Using", "Used"], input => text(input?.toolName), "a tool", "other"),
};

const organizeVerbs: Record<string, Tense> = { pin: ["Pinning", "Pinned"], unpin: ["Unpinning", "Unpinned"], archive: ["Archiving", "Archived"], unarchive: ["Restoring", "Restored"], settle: ["Settling", "Settled"], unsettle: ["Unsettling", "Unsettled"], snooze: ["Snoozing", "Snoozed"], wake: ["Waking", "Woke"], tag: ["Tagging", "Tagged"], mark_unread: ["Marking", "Marked"], regenerate_title: ["Renaming", "Renamed"], rename: ["Renaming", "Renamed"] };
function organizeThread(input: Input | undefined, running: boolean): ToolPresentation {
	const action = text(input?.action) ?? "", pair = organizeVerbs[action];
	if (action === "rename" && text(input?.title)) return { label: `${running ? "Renaming" : "Renamed"} a chat to ${quoted(input?.title)}`, action: "thread" };
	return { label: pair ? `${pair[running ? 0 : 1]} a chat${action === "mark_unread" ? " unread" : ""}` : running ? "Organising a chat" : "Organised a chat", action: "thread" };
}

/** What a row says, for its tool, input and status. */
export function presentTool(activity: Pick<AgentActivity, "title" | "text" | "status">): ToolPresentation {
	const name = toolName(activity.title), key = name.toLowerCase(), input = toolInput(activity), running = activity.status === "running";
	const say = (pair: Tense, object: string | undefined, action: ToolAction, fallback = "") => ({ label: `${pair[running ? 0 : 1]} ${object ?? fallback}`.trim(), action });
	switch (key) {
		case "bash": case "run_command": case "shell": case "powershell": return say(verbs.ran, text(input?.command), "command", "a command");
		case "read": case "read_file": case "notebookread": return say(verbs.read, shortPath(input?.file_path ?? input?.path ?? input?.filename), "read", "a file");
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
		case "organize_thread": return organizeThread(input, running);
	}
	const sentence = sentences[key];
	if (sentence) return sentence(input, running);
	// The Phaseo agent labels an MCP call "Server · tool".
	const served = /^(.+?) · (.+)$/.exec(activity.title);
	if (served) return { label: `${running ? "Using" : "Used"} ${humanise(served[2]).toLowerCase()} from ${served[1]}`, action: "other" };
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
	browser: count => `Used the browser ${count === 1 ? "once" : `${count} times`}`,
	page: count => `Showed ${plural(count, "page", "pages")}`,
	preview: count => `Checked ${plural(count, "page", "pages")}`,
	"app-read": count => `Checked the app ${count === 1 ? "once" : `${count} times`}`,
	tools: count => `Loaded tools ${count === 1 ? "once" : `${count} times`}`,
	other: count => `Used ${plural(count, "tool", "tools")}`,
};
/** Changes lead a summary; looking things up comes after. */
const priority: ToolAction[] = ["app-change", "edit", "page", "command", "thread", "agent", "read", "search", "web", "browser", "app-read", "other", "preview", "tools"];

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

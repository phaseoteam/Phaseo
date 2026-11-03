import { createHash } from "node:crypto";
import { conversationPageOf } from "../../shared/conversationPage";
import type { RememberedModels } from "../../shared/rememberedModels";
import type { Account, Harness, Message, ModelOption, Project, Task, WorkspaceCommand } from "../../shared/workspace";
import { settleBlocker } from "../../shared/threadLifecycle";
import { overviewOrder, taskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import type { GitDiffRequest, GitDiffResult, TurnFileChange } from "../../shared/gitDiff";
import type { GitWorkingStatus } from "./phoneReview";
import { projectTree } from "../projectFileSearch";
import { phoneFilePreview } from "./phoneFiles";
import { phoneModels, phoneSetChat, startPhoneChat, type PhoneModelSources } from "./phoneHost";
import type { PhoneHost } from "./phoneSession";

/** What each harness offers in the tests: Codex lists efforts on the model, Claude as a Reasoning option. */
export const fakeModels: Partial<Record<Harness, ModelOption[]>> = {
	phaseo: [{ id: "phaseo/test", name: "Phaseo test" }, { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", releaseDate: "2026-09-01", organisationId: "anthropic", serviceTiers: [{ id: "fast", name: "Fast", description: "" }] }],
	grok: [{ id: "grok-5-code", name: "Grok 5 Code" }],
	codex: [
		{ id: "gpt-6.1", name: "GPT-6.1", reasoningEfforts: [{ id: "low", description: "" }, { id: "medium", description: "" }, { id: "xhigh", description: "" }], defaultReasoningEffort: "medium" },
		{ id: "gpt-6.1-mini", name: "GPT-6.1 mini" },
		{ id: "gpt-5", name: "GPT-5", legacy: true },
	],
	claude: [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", options: [{ id: "effort", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "high", label: "High", isDefault: true }] }, { id: "thinking", label: "Thinking", type: "boolean" }] }],
};

/** An in-memory app for the phone tests: chats, their messages, and the commands a phone sent. */
export function fakePhoneHost() {
	const tasks = new Map<string, Task>();
	const projects: Project[] = [{ id: "p1", name: "Phaseo", directory: "/work/phaseo", createdAt: "2026-11-01T00:00:00.000Z" }];
	const commands: WorkspaceCommand[] = [], repositoryChecks: string[] = [];
	/** Each snapshot pair's changed files ("before:after"), and how often git was asked for one. */
	const checkpointFiles = new Map<string, TurnFileChange[]>(), turnReads: string[] = [];
	/** Each project's git status (none: not a checkout), the patch each diff returns, and the diffs asked for as "projectId scope…". */
	const gitStatuses = new Map<string, GitWorkingStatus>(), patches = new Map<string, string>(), diffReads: { projectId: string; request: GitDiffRequest }[] = [];
	/** Each project's folder on disk for file reads, which go through the real tree and preview; and the projects read. */
	const fileRoots = new Map<string, string>(), fileReads: string[] = [];
	const fileRoot = (projectId: string) => { fileReads.push(projectId); const root = fileRoots.get(projectId); if (!root) throw new Error("Project no longer exists."); return root; };
	let clock = Date.parse("2026-11-01T10:00:00.000Z");
	const tick = () => new Date(clock += 1000).toISOString();
	// A Phaseo account that can call the gateway, and Codex and Claude Code signed in on the computer.
	const accounts: Account[] = [{ id: "phaseo-account", name: "Phaseo", harness: "phaseo", kind: "api", configured: true }];
	const agents = { local: ["codex", "claude"] as Harness[], failing: new Set<Harness>(), remembered: { favourites: [] } as RememberedModels, projectModels: {} as Record<string, Partial<Record<Harness, ModelOption[]>>> };
	const overview = (): WorkspaceOverview => ({ version: 1, projects, accounts, agents: [], mcpConnections: [], tasks: [...tasks.values()].map(task => taskOverview(task)).sort(overviewOrder) });
	const listeners: ((overview: WorkspaceOverview) => void)[] = [];
	const changed = () => { const value = overview(); for (const listener of listeners) listener(value); };
	const get = (id: string) => { const task = tasks.get(id); if (!task) throw new Error("Task no longer exists."); return task; };
	const touch = (task: Task) => { task.revision = (task.revision ?? 0) + 1; task.updatedAt = tick(); };
	const addTask = (change: Partial<Task> & { id: string }) => {
		const at = tick();
		const task: Task = { title: change.id, harness: "phaseo", model: "phaseo/test", mode: "chat", status: "completed", pinned: false, archived: false, messages: [], queue: [], createdAt: at, updatedAt: at, revision: 1, ...change };
		tasks.set(task.id, task); return task;
	};
	const addMessage = (taskId: string, message: Partial<Message> & { role: Message["role"]; text: string }) => {
		const task = get(taskId), entry: Message = { id: `m${task.messages.length + 1}-${taskId}`, createdAt: tick(), ...message };
		task.messages.push(entry); touch(task); changed(); return entry;
	};
	const discover = async (harness: Harness, _accountId?: string, projectId?: string) => {
		if (agents.failing.has(harness)) throw new Error("Not signed in on the computer.");
		return (projectId ? agents.projectModels[projectId]?.[harness] : undefined) ?? fakeModels[harness] ?? [];
	};
	const sources: PhoneModelSources = { discover, localHarnesses: async () => agents.local, remembered: () => agents.remembered, permissionOf: id => get(id).permissionMode };
	const host: PhoneHost = {
		desktopName: () => "Test PC", appVersion: "1.2.3", overview,
		task: id => get(id),
		page: query => ({ ...conversationPageOf(get(query.taskId).messages, query, get(query.taskId).revision ?? 0), activities: get(query.taskId).activities ?? [] }),
		command: async command => {
			commands.push(command);
			if (command.type === "send" || command.type === "steer") { const task = get(command.id); task.status = "running"; addMessage(command.id, { role: "user", text: command.text }); }
			else if (command.type === "cancel") { const task = get(command.id); task.status = "interrupted"; touch(task); changed(); }
			else if (command.type === "create-task") {
				const { type: _type, autopilot: _autopilot, ...fields } = command;
				addTask({ id: `new-${tasks.size + 1}`, title: "New task", ...fields }); changed();
			}
			// The lifecycle and settings commands as the store applies them, its refusals included.
			else if (command.type === "settle") { const task = get(command.id); const blocker = settleBlocker(taskOverview(task)); if (blocker) throw new Error(blocker); task.settledOverride = "settled"; task.settledAt = tick(); touch(task); changed(); }
			else if (command.type === "unsettle") { const task = get(command.id); task.settledOverride = "active"; task.settledAt = undefined; touch(task); changed(); }
			else if (command.type === "snooze") { const task = get(command.id); task.snoozedUntil = command.until; task.snoozedAt = tick(); touch(task); changed(); }
			else if (command.type === "wake") { const task = get(command.id); task.snoozedUntil = task.snoozedAt = undefined; touch(task); changed(); }
			else if (command.type === "mark-unread") { const task = get(command.id); task.lastVisitedAt = "2000-01-01T00:00:00.000Z"; touch(task); changed(); }
			else if (command.type === "update-task") {
				const task = get(command.id);
				if ((command.model ?? command.mode ?? command.reasoningEffort ?? command.modelOptions) !== undefined && task.status === "running") throw new Error("Stop this task before changing its model or mode.");
				if (command.model !== undefined && command.model !== task.model) { task.reasoningEffort = undefined; task.modelOptions = undefined; }
				for (const key of ["title", "pinned", "archived", "model", "mode", "reasoningEffort", "modelOptions"] as const) if (command[key] !== undefined) Object.assign(task, { [key]: command[key] });
				touch(task); changed();
			}
			else if (command.type === "queue-remove" || command.type === "queue-edit" || command.type === "queue-move") {
				const task = get(command.id), at = task.queue.findIndex(value => value.id === command.messageId);
				if (command.type === "queue-remove") task.queue.splice(at, 1);
				else if (command.type === "queue-edit") task.queue[at] = { ...task.queue[at]!, text: command.text };
				else { const to = command.direction === "up" ? at - 1 : at + 1; if (to >= 0 && to < task.queue.length) [task.queue[at], task.queue[to]] = [task.queue[to]!, task.queue[at]!]; }
				touch(task); changed();
			}
			else if (command.type === "approval") { const task = get(command.id); if (!task.approvals?.some(value => value.id === command.approvalId)) throw new Error("This approval is no longer pending."); task.approvals = task.approvals.filter(value => value.id !== command.approvalId); touch(task); changed(); }
			return overview();
		},
		newChat: input => startPhoneChat(overview, async command => { await host.command(command); return overview(); }, sources, input),
		models: input => phoneModels(overview(), sources, input),
		// Every test project is a checkout except one in /scratch.
		isRepository: directory => { repositoryChecks.push(directory); return !directory.startsWith("/scratch"); },
		setChat: async input => { await host.command(await phoneSetChat(get(input.chatId), discover, input)); },
		turnChanges: async (_projectId, before, after) => { turnReads.push(`${before}:${after}`); return checkpointFiles.get(`${before}:${after}`) ?? []; },
		gitStatus: async projectId => gitStatuses.get(projectId) ?? null,
		// A patch is found by its scope ("uncommitted", "branch", or "turn:before:after"), else the project's "*".
		diff: async (projectId, request) => {
			diffReads.push({ projectId, request });
			const key = request.scope === "turn" ? `turn:${request.from}:${request.to}` : request.scope;
			const patch = patches.get(key) ?? patches.get("*") ?? "";
			return { patch, hash: createHash("sha256").update(patch).digest("hex"), truncated: false, repository: true } satisfies GitDiffResult;
		},
		files: async (projectId, request) => projectTree(fileRoot(projectId), request),
		readFile: async (projectId, filename) => phoneFilePreview(fileRoot(projectId), filename),
	};
	return { host, tasks, projects, accounts, agents, sources, repositoryChecks, checkpointFiles, turnReads, gitStatuses, patches, diffReads, fileRoots, fileReads, commands, addTask, addMessage, get, touch, changed, overview, onChange: (listener: (overview: WorkspaceOverview) => void) => listeners.push(listener) };
}

import { conversationPageOf } from "../../shared/conversationPage";
import type { Harness, Message, ModelOption, Project, Task, WorkspaceCommand } from "../../shared/workspace";
import { overviewOrder, taskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { phoneModels, startPhoneChat } from "./phoneHost";
import type { PhoneHost } from "./phoneSession";

/** What each harness offers in the tests: Codex lists efforts on the model, Claude as a Reasoning option. */
export const fakeModels: Partial<Record<Harness, ModelOption[]>> = {
	phaseo: [{ id: "phaseo/test", name: "Phaseo test" }],
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
	const commands: WorkspaceCommand[] = [];
	let clock = Date.parse("2026-11-01T10:00:00.000Z");
	const tick = () => new Date(clock += 1000).toISOString();
	const overview = (): WorkspaceOverview => ({ version: 1, projects, accounts: [], agents: [], mcpConnections: [], tasks: [...tasks.values()].map(task => taskOverview(task)).sort(overviewOrder) });
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
	const discover = async (harness: Harness) => fakeModels[harness] ?? [];
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
			else if (command.type === "approval") { const task = get(command.id); if (!task.approvals?.some(value => value.id === command.approvalId)) throw new Error("This approval is no longer pending."); task.approvals = task.approvals.filter(value => value.id !== command.approvalId); touch(task); changed(); }
			return overview();
		},
		newChat: input => startPhoneChat(overview, async command => { await host.command(command); return overview(); }, discover, input),
		models: input => phoneModels(overview(), discover, input),
	};
	return { host, tasks, commands, addTask, addMessage, get, touch, changed, overview, onChange: (listener: (overview: WorkspaceOverview) => void) => listeners.push(listener) };
}

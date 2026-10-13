import type { Harness, ModelOption, Task, WorkspaceCommand } from "../shared/workspace";
import type { ThreadTools } from "../shared/orchestration";
import type { WorkspaceOverview } from "../shared/workspaceOverview";
import type { WorkspaceStore } from "./workspaceStore";
import { validateDelegate } from "./threadTools";

type Host = {
	store: WorkspaceStore;
	isClosing: () => boolean;
	broadcast: () => void;
	start: (id: string) => void;
	command: (command: WorkspaceCommand) => Promise<WorkspaceOverview>;
	assertHarnessAvailable: (harness: Harness) => void;
	assertProjectAvailable: (id: string) => void;
	discoverModels?: (harness: Harness, accountId?: string, projectId?: string) => Promise<ModelOption[]>;
	modelDiscoveries: Set<Promise<unknown>>;
};

export class WorkspaceThreads {
	private readonly listeners = new Set<() => void>();
	private readonly modelCache = new Map<string, { models?: ModelOption[]; checkedAt: number; pending?: Promise<ModelOption[]> }>();
	constructor(private readonly host: Host) {}
	changed() { for (const listener of [...this.listeners]) listener(); }
	forThread(parentId: string): ThreadTools {
		const summary = (task: Pick<Task, "id" | "title" | "harness" | "model" | "status" | "parentId"> & { error?: string }) => ({ id: task.id, title: task.title, harness: task.harness, model: task.model, status: task.status, parentId: task.parentId, error: task.error });
		const scoped = (id: string, childOnly = false) => {
			const task = this.host.store.getTask(id);
			if ((childOnly || id !== parentId) && task.delegation?.parentTaskId !== parentId && (childOnly || !this.host.store.getTask(parentId).messages.some(message => message.role === "user" && message.threadReferences?.includes(id)))) throw new Error("This chat is outside this agent's scope.");
			return task;
		};
		return {
			handoff: async (id, request) => {
				scoped(id); const parent = scoped(parentId);
				if (this.host.isClosing() || parent.archived || parent.status === "interrupted") throw new Error("This parent is not accepting work.");
				if (!request.requestId.trim() || request.requestId.length > 100 || !request.model.trim() || request.model === "default") throw new Error("Choose an explicit model and retry identifier.");
				const retry = this.host.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId && task.delegation.requestId === request.requestId);
				if (retry) return summary(this.host.store.getTaskView(retry.id));
				const accounts = this.host.store.getAccounts().filter(account => account.harness === request.harness && account.configured && !account.archived);
				request = { ...request, accountId: request.accountId ?? (request.harness === parent.harness ? parent.accountId : accounts.length === 1 ? accounts[0].id : undefined) };
				this.host.assertHarnessAvailable(request.harness);
				if (parent.projectId) this.host.assertProjectAvailable(parent.projectId);
				if (this.host.store.getOverview().tasks.filter(task => task.delegation?.parentTaskId === parentId && ["idle", "running", "waiting"].includes(task.status)).length >= 4) throw new Error("Wait for existing child work to finish.");
				if (this.host.discoverModels && !(await this.forThread(parentId).models!(request.harness, request.accountId, request.model)).models.some(model => model.id === request.model)) throw new Error("This model is not available for the selected account.");
				if (this.host.isClosing()) throw new Error("Workspace is shutting down.");
				const child = this.host.store.handoffDelegatedTask(parentId, id, request.requestId, request);
				this.host.broadcast(); return summary(child);
			},
			rename: async (id, title) => { scoped(id, true); if (!title.trim() || title.length > 100) throw new Error("Invalid chat title."); await this.host.command({ type: "update-task", id, title }); return summary(scoped(id, true)); },
			steer: async (id, text) => { scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting work."); if (!text.trim() || text.length > 100000) throw new Error("Invalid child prompt."); await this.host.command({ type: "steer", id, text }); return summary(scoped(id, true)); },
			queue: id => scoped(id, true).queue.map(({ id, text, createdAt }) => ({ id, text: text.slice(0, 8000), createdAt })),
			editQueue: async (id, messageId, text) => { const child = scoped(id, true); if (!child.queue.some(message => message.id === messageId)) throw new Error("Queued message was not found."); if (text !== undefined && (!text.trim() || text.length > 100000)) throw new Error("Invalid queued prompt."); await this.host.command(text === undefined ? { type: "queue-remove", id, messageId } : { type: "queue-edit", id, messageId, text }); return summary(scoped(id, true)); },
			fork: async (id, requestId, messageId) => { scoped(id); if (this.host.isClosing()) throw new Error("Workspace is shutting down."); const parent = this.host.store.getTask(parentId); if (parent.delegation) throw new Error("Fork from the parent chat to keep ownership explicit."); const retry = this.host.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId && task.delegation.requestId === requestId); if (retry) return summary(this.host.store.getTaskView(retry.id)); if (this.host.store.getOverview().tasks.filter(task => task.delegation?.parentTaskId === parentId && ["idle", "running", "waiting"].includes(task.status)).length >= 4) throw new Error("Wait for existing child work to finish."); const child = this.host.store.forkDelegatedTask(parentId, id, requestId, messageId); this.host.broadcast(); return summary(child); },
			send: async (id, text) => { scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting work."); if (!text.trim() || text.length > 100000) throw new Error("Invalid child prompt."); await this.host.command({ type: "send", id, text }); return summary(scoped(id, true)); },
			merge: async (id, requestId) => { scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting results."); const parent = this.host.store.mergeThreadContext(parentId, id, requestId); this.host.broadcast(); if (!parent.archived && ["idle", "completed"].includes(parent.status)) this.host.start(parentId); return summary(parent); },
			models: async (harness, accountId, query) => {
				if (this.host.isClosing() || !this.host.discoverModels) throw new Error("Model discovery is unavailable.");
				this.host.assertHarnessAvailable(harness);
				const parent = this.host.store.getTask(parentId);
				const accounts = this.host.store.getAccounts().filter(account => account.harness === harness && account.configured && !account.archived);
				accountId ??= harness === parent.harness ? parent.accountId : accounts.length === 1 ? accounts[0].id : undefined;
				const account = accountId ? accounts.find(account => account.id === accountId) : undefined;
				if (accountId && !account) throw new Error("Choose a connected account for this harness.");
				if (account?.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()) throw new Error("Sign in again to renew this account.");
				if ((harness === "phaseo" || harness === "cursor") && !accountId) return { models: [], total: 0, accounts: accounts.map(({ id, name }) => ({ id, name })) };
				const key = JSON.stringify([harness, accountId, account?.secretId, account?.endpoint, parent.projectId]);
				let cached = this.modelCache.get(key);
				if (!cached) { cached = { checkedAt: 0 }; if (this.modelCache.size >= 32) this.modelCache.delete(this.modelCache.keys().next().value!); this.modelCache.set(key, cached); }
				if (!cached.pending && (!cached.models || Date.now() - cached.checkedAt > 600000)) {
					const entry = cached;
					const discovery = this.host.discoverModels(harness, accountId, parent.projectId).then(models => { entry.models = models; entry.checkedAt = Date.now(); return models; }).finally(() => { entry.pending = undefined; this.host.modelDiscoveries.delete(discovery); });
					entry.pending = discovery; this.host.modelDiscoveries.add(discovery); void discovery.catch(() => {});
				}
				const models = cached.models ?? await cached.pending!;
				const matches = query ? models.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(query.toLowerCase())) : models;
				return { models: matches.slice(0, 100), total: matches.length, accounts: accounts.map(({ id, name }) => ({ id, name })) };
			},
			list: query => this.host.store.getOverview().tasks.filter(task => (task.id === parentId || task.delegation?.parentTaskId === parentId) && (!query || task.title.toLowerCase().includes(query.toLowerCase()))).slice(0, 50).map(summary),
			read: id => { scoped(id); const task = this.host.store.getTaskView(id); return { thread: summary(task), messages: task.messages.slice(-30).map(({ role, text, createdAt }) => ({ role, text: text.slice(0, 8000), createdAt })), truncated: (task.conversationCounts?.messages ?? task.messages.length) > 30 || task.messages.some(message => message.text.length > 8000) }; },
			delegate: async request => {
				request = validateDelegate(request);
				if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
				let parent = scoped(parentId);
				if (parent.archived || parent.status === "interrupted") throw new Error("This parent chat is not accepting delegated work.");
				let depth = 0, ancestor = parent;
				while (ancestor.delegation) { if (++depth >= 3) throw new Error("Maximum delegation depth reached."); ancestor = this.host.store.getTask(ancestor.delegation.parentTaskId); }
				const children = this.host.store.getOverview().tasks.filter(task => task.parentId === parentId);
				const retry = children.find(task => task.delegation?.requestId === request.requestId);
				if (retry) return summary(this.host.store.getTask(retry.id));
				if (children.filter(task => ["idle", "running", "waiting"].includes(task.status)).length >= 4) throw new Error("Wait for an existing child before starting another.");
				const harness = request.harness ?? parent.harness;
				const model = request.model ?? (harness === parent.harness ? parent.model : undefined);
				if (!model || model === "default") throw new Error("Choose an explicit model for delegated work.");
				this.host.assertHarnessAvailable(harness);
				const accountId = request.accountId ?? (harness === parent.harness ? parent.accountId : undefined);
				if (this.host.discoverModels) {
					const catalog = await this.forThread(parentId).models!(harness, accountId, model);
					if (!catalog.models.some(value => value.id === model)) throw new Error("This model is not available for the selected account.");
				}
				parent = scoped(parentId);
				if (this.host.isClosing() || parent.archived || parent.status === "interrupted") throw new Error("This parent chat is no longer accepting delegated work.");
				const active = this.host.store.getOverview().tasks.filter(task => task.delegation && ["idle", "running", "waiting"].includes(task.status));
				if (active.length >= 32 || active.filter(task => task.delegation?.parentTaskId === parentId).length >= 4) throw new Error("Wait for existing delegated work to finish.");
				if (parent.projectId) this.host.assertProjectAvailable(parent.projectId);
				const child = this.host.store.createDelegatedTask({ type: "create-task", harness, model, accountId, agentId: harness === parent.harness ? parent.agentId : undefined, projectId: parent.projectId, mode: parent.mode, permissionMode: parent.permissionMode, reasoningEffort: harness === parent.harness ? parent.reasoningEffort : undefined, modelOptions: harness === parent.harness && model === parent.model ? parent.modelOptions : undefined }, { parentTaskId: parentId, requestId: request.requestId, background: request.background, role: request.role }, request.role ? `Role: ${request.role}\n\n${request.prompt}` : request.prompt, request.title);
				this.host.broadcast(); this.host.start(child.id); return summary(child);
			},
			wait: async (id, timeoutMs = 60000) => {
				if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) throw new Error("Invalid wait timeout.");
				scoped(id, true);
				return new Promise(resolve => {
					const check = (timedOut = false) => {
						const child = scoped(id, true), parent = this.host.store.getTask(parentId);
						if (!timedOut && !this.host.isClosing() && parent.status !== "interrupted" && ["idle", "running", "waiting"].includes(child.status)) return;
						if (timer) clearTimeout(timer); this.listeners.delete(listener);
						resolve({ thread: summary(child), timedOut, result: child.status === "completed" ? child.messages.findLast(message => message.role === "assistant")?.text.slice(0, 32000) : undefined });
					};
					const listener = () => check(); this.listeners.add(listener);
					const timer = setTimeout(() => check(true), timeoutMs); check();
				});
			},
			interrupt: async id => { scoped(id, true); await this.host.command({ type: "cancel", id }); return summary(scoped(id, true)); },
		};
	}
}

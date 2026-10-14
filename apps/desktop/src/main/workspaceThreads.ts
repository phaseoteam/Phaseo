import type { Account, Harness, ModelOption, Task, WorkspaceCommand } from "../shared/workspace";
import { agentLimitMessage, type AgentCatalog, type AgentCatalogAccount, type AgentCatalogModel, type ThreadTools, waitDefaultMs, waitMaximumMs } from "../shared/orchestration";
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
	/** Same installation check as the composer; harnesses missing from the list are treated as installed. */
	discoverInstallations?: () => Promise<{ harness: Harness; installed: boolean; error?: string }[]>;
	modelDiscoveries: Set<Promise<unknown>>;
};

const active = (status: Task["status"]) => status === "idle" || status === "running" || status === "waiting";
const modeRank: Record<Task["mode"], number> = { chat: 0, plan: 1, code: 2 };
const permissionRank = (value?: Task["permissionMode"]) => value === "full-access" ? 1 : 0;
/** T3's privilege ceiling: a child can be narrower than its parent, never broader. Chat has no tools, plan reads, code writes. */
export function childPrivileges(parent: Pick<Task, "mode" | "permissionMode">, request: { mode?: Task["mode"]; permissionMode?: Task["permissionMode"] } = {}) {
	if (request.mode && modeRank[request.mode] > modeRank[parent.mode]) throw new Error(`A child of a ${parent.mode} chat cannot use ${request.mode} mode.`);
	if (request.permissionMode && permissionRank(request.permissionMode) > permissionRank(parent.permissionMode)) throw new Error("A child cannot have broader permissions than this chat.");
	return { mode: request.mode ?? parent.mode, permissionMode: request.permissionMode ?? parent.permissionMode };
}
/** Harnesses an agent can target by name; ACP agents need a configured agent and are only reachable by inheritance. */
const delegationHarnesses = ["phaseo", "codex", "claude", "opencode", "pi", "cursor", "grok"] as const satisfies readonly Harness[];
const accountRequired = (harness: Harness) => harness === "phaseo" || harness === "cursor";
const harnessName: Partial<Record<Harness, string>> = { phaseo: "Phaseo", cursor: "Cursor" };
const catalogBytes = 60000;

export class WorkspaceThreads {
	private readonly listeners = new Set<() => void>();
	private readonly modelCache = new Map<string, { models?: ModelOption[]; checkedAt: number; pending?: Promise<ModelOption[]> }>();
	private installations?: { checkedAt: number; value: Promise<{ harness: Harness; installed: boolean; error?: string }[]> };
	constructor(private readonly host: Host, private readonly maxActiveAgents: () => number = () => 32) {}
	changed() { for (const listener of [...this.listeners]) listener(); }
	/** Called when a parent's turn ends: foreground children it can no longer wait for deliver their results instead. */
	releaseForeground(parentId: string) {
		for (const task of this.host.store.getOverview().tasks) if (task.delegation?.parentTaskId === parentId && !task.delegation.background && active(task.status)) this.host.store.requestDelegationWake(task.id);
	}
	private usableAccounts(harness: Harness): Account[] {
		return this.host.store.getAccounts().filter(account => account.harness === harness && account.configured && !account.archived && !(account.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()));
	}
	/** Explicit, then the parent's own account on the same harness, then the single usable account. Phaseo and Cursor require one. */
	private pickAccount(harness: Harness, parent: Task, requested?: string, required = false) {
		if (requested) return requested;
		if (harness === parent.harness && parent.accountId) return parent.accountId;
		const accounts = this.usableAccounts(harness);
		if (accounts.length === 1) return accounts[0].id;
		if (required && accountRequired(harness)) throw new Error(accounts.length ? `Several ${harnessName[harness]} accounts are connected. Pass accountId: ${accounts.map(account => `${account.id} (${account.name})`).join(", ")}.` : `No usable ${harnessName[harness]} account is connected. Ask the user to connect or renew one in Settings → Accounts.`);
		return undefined;
	}
	private assertCapacity() { const count = this.host.store.activeAgentCount(), maximum = this.maxActiveAgents(); if (count >= maximum) throw new Error(agentLimitMessage(count, maximum)); }
	private async discover(parent: Task, harness: Harness, accountId?: string, query?: string) {
		if (this.host.isClosing() || !this.host.discoverModels) throw new Error("Model discovery is unavailable.");
		this.host.assertHarnessAvailable(harness);
		const accounts = this.host.store.getAccounts().filter(account => account.harness === harness && account.configured && !account.archived);
		accountId = this.pickAccount(harness, parent, accountId);
		const account = accountId ? accounts.find(account => account.id === accountId) : undefined;
		if (accountId && !account) throw new Error("Choose a connected account for this harness.");
		if (account?.oauthExpiresAt && Date.parse(account.oauthExpiresAt) <= Date.now()) throw new Error("Sign in again to renew this account.");
		if (accountRequired(harness) && !accountId) return { models: [], total: 0, accounts: accounts.map(({ id, name }) => ({ id, name })) };
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
		return { models: matches.slice(0, 100), total: matches.length, accounts: accounts.map(({ id, name }) => ({ id, name })), accountId };
	}
	private installed() {
		if (!this.host.discoverInstallations) return Promise.resolve([]);
		if (!this.installations || Date.now() - this.installations.checkedAt > 300000) {
			const value = this.host.discoverInstallations(); this.installations = { checkedAt: Date.now(), value };
			this.host.modelDiscoveries.add(value); void value.finally(() => this.host.modelDiscoveries.delete(value)).catch(() => { if (this.installations?.value === value) this.installations = undefined; });
		}
		return this.installations.value;
	}
	/** orchestrator_capabilities: every usable harness with its accounts and models in one bounded response. */
	private async catalog(parent: Task, filter: { harness?: Harness; query?: string }): Promise<AgentCatalog> {
		if (this.host.isClosing() || !this.host.discoverModels) throw new Error("Agent discovery is unavailable.");
		const installations = await this.installed().catch(() => []);
		const unavailable: AgentCatalog["unavailable"] = [];
		const targets: { harness: Harness; account?: Account }[] = [];
		for (const harness of filter.harness ? [filter.harness] : delegationHarnesses) {
			const installation = installations.find(value => value.harness === harness);
			const accounts = this.usableAccounts(harness);
			try { this.host.assertHarnessAvailable(harness); } catch (error) { unavailable.push({ harness, reason: error instanceof Error ? error.message : "Unavailable." }); continue; }
			if (!(delegationHarnesses as readonly Harness[]).includes(harness)) unavailable.push({ harness, reason: "Agents can only delegate to this harness by inheriting it from this chat." });
			else if (installation && !installation.installed) unavailable.push({ harness, reason: installation.error ?? "Not installed." });
			else if (harness === "grok" && parent.mode === "chat") unavailable.push({ harness, reason: "Grok supports Code and Plan; children of this Chat run in Chat mode." });
			else if (accountRequired(harness) && !accounts.length) unavailable.push({ harness, reason: "No usable account is connected." });
			else for (const account of accountRequired(harness) || accounts.length ? accounts : [undefined]) targets.push({ harness, account });
		}
		const discovered: { harness: Harness; account: AgentCatalogAccount }[] = [];
		// Native discovery spawns processes; keep it to two at a time.
		for (let index = 0; index < targets.length; index += 2) discovered.push(...await Promise.all(targets.slice(index, index + 2).map(async ({ harness, account }) => {
			const name = account?.name ?? "Default sign-in";
			try {
				const result = await this.discover(parent, harness, account?.id, filter.query);
				const ranked = filter.query ? result.models : [...result.models.filter(model => !model.legacy), ...result.models.filter(model => model.legacy)];
				return { harness, account: { ...(account ? { id: account.id } : {}), name, total: result.total, models: ranked.map((model): AgentCatalogModel => ({ id: model.id, name: model.name, ...(model.legacy ? { legacy: true } : {}), ...(model.default ? { default: true } : {}), ...(model.options?.length ? { options: model.options.map(option => option.type === "select" ? { ...option, options: option.options.slice(0, 16).map(({ id, label, isDefault }) => ({ id, label, ...(isDefault ? { isDefault } : {}) })) } : option) } : {}) })) } };
			} catch (error) { return { harness, account: { ...(account ? { id: account.id } : {}), name, total: 0, models: [], error: error instanceof Error ? error.message.slice(0, 300) : "Discovery failed." } }; }
		})));
		const build = (perAccount: number, options: boolean): AgentCatalog => {
			const harnesses = new Map<Harness, AgentCatalog["harnesses"][number]>();
			for (const { harness, account } of discovered) {
				const entry = harnesses.get(harness) ?? { harness, accountRequired: accountRequired(harness), accounts: [] }; harnesses.set(harness, entry);
				entry.accounts.push({ ...account, models: account.models.slice(0, perAccount).map(model => options ? model : { ...model, options: undefined }) });
			}
			const truncated = !options || discovered.some(({ account }) => account.total > perAccount);
			return { harnesses: [...harnesses.values()], unavailable, limits: { activeAgents: this.host.store.activeAgentCount(), maxActiveAgents: this.maxActiveAgents() }, ...(truncated ? { truncated: true } : {}) };
		};
		for (const [perAccount, options] of [[40, true], [40, false], [20, false], [8, false]] as const) { const value = build(perAccount, options); if (JSON.stringify(value).length <= catalogBytes) return value; }
		return build(3, false);
	}
	forThread(parentId: string): ThreadTools {
		const summary = (task: Pick<Task, "id" | "title" | "harness" | "model" | "status" | "parentId"> & { error?: string }) => ({ id: task.id, title: task.title, harness: task.harness, model: task.model, status: task.status, parentId: task.parentId, error: task.error });
		const scoped = (id: string, childOnly = false) => {
			const task = this.host.store.getTask(id);
			if ((childOnly || id !== parentId) && task.delegation?.parentTaskId !== parentId && (childOnly || !this.host.store.getTask(parentId).messages.some(message => message.role === "user" && message.threadReferences?.includes(id)))) throw new Error("This chat is outside this agent's scope.");
			return task;
		};
		const retry = (requestId: string) => this.host.store.getOverview().tasks.find(task => task.delegation?.parentTaskId === parentId && task.delegation.requestId === requestId);
		return {
			handoff: async (id, request) => {
				scoped(id); const parent = scoped(parentId);
				if (this.host.isClosing() || parent.archived || parent.status === "interrupted") throw new Error("This parent is not accepting work.");
				if (!request.requestId.trim() || request.requestId.length > 100 || !request.model.trim() || request.model === "default") throw new Error("Choose an explicit model and retry identifier.");
				const existing = retry(request.requestId);
				if (existing) return summary(this.host.store.getTaskView(existing.id));
				this.host.assertHarnessAvailable(request.harness);
				request = { ...request, accountId: this.pickAccount(request.harness, parent, request.accountId, true) };
				if (parent.projectId) this.host.assertProjectAvailable(parent.projectId);
				this.assertCapacity();
				if (this.host.discoverModels && !(await this.discover(parent, request.harness, request.accountId, request.model)).models.some(model => model.id === request.model)) throw new Error("This model is not available for the selected account.");
				if (this.host.isClosing()) throw new Error("Workspace is shutting down.");
				// The store copies this parent's mode and permission mode onto the continuation.
				const child = this.host.store.handoffDelegatedTask(parentId, id, request.requestId, request, this.maxActiveAgents());
				this.host.broadcast(); return summary(child);
			},
			rename: async (id, title) => { scoped(id, true); if (!title.trim() || title.length > 100) throw new Error("Invalid chat title."); await this.host.command({ type: "update-task", id, title }); return summary(scoped(id, true)); },
			steer: async (id, text) => { scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting work."); if (!text.trim() || text.length > 100000) throw new Error("Invalid child prompt."); await this.host.command({ type: "steer", id, text }); return summary(scoped(id, true)); },
			queue: id => scoped(id, true).queue.map(({ id, text, createdAt }) => ({ id, text: text.slice(0, 8000), createdAt })),
			editQueue: async (id, messageId, text) => { const child = scoped(id, true); if (!child.queue.some(message => message.id === messageId)) throw new Error("Queued message was not found."); if (text !== undefined && (!text.trim() || text.length > 100000)) throw new Error("Invalid queued prompt."); await this.host.command(text === undefined ? { type: "queue-remove", id, messageId } : { type: "queue-edit", id, messageId, text }); return summary(scoped(id, true)); },
			fork: async (id, requestId, messageId) => {
				scoped(id); if (this.host.isClosing()) throw new Error("Workspace is shutting down.");
				const parent = this.host.store.getTask(parentId); if (parent.delegation) throw new Error("Fork from the parent chat to keep ownership explicit.");
				const existing = retry(requestId); if (existing) return summary(this.host.store.getTaskView(existing.id));
				// The store copies this parent's mode and permission mode onto the fork.
				const child = this.host.store.forkDelegatedTask(parentId, id, requestId, messageId, this.maxActiveAgents()); this.host.broadcast(); return summary(child);
			},
			send: async (id, text) => {
				const child = scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting work."); if (!text.trim() || text.length > 100000) throw new Error("Invalid child prompt.");
				// Sending to a stopped child starts it, so it needs a free slot.
				if (!["running", "waiting"].includes(child.status) && !child.queue.length) this.assertCapacity();
				await this.host.command({ type: "send", id, text }); return summary(scoped(id, true));
			},
			merge: async (id, requestId) => { scoped(id, true); if (this.host.isClosing() || this.host.store.getTask(parentId).status === "interrupted") throw new Error("This parent is no longer accepting results."); const parent = this.host.store.mergeThreadContext(parentId, id, requestId); this.host.broadcast(); if (!parent.archived && ["idle", "completed"].includes(parent.status)) this.host.start(parentId); return summary(parent); },
			models: async (harness, accountId, query) => { const { models, total, accounts } = await this.discover(this.host.store.getTask(parentId), harness, accountId, query); return { models, total, accounts }; },
			agents: async (filter = {}) => this.catalog(this.host.store.getTask(parentId), filter),
			list: query => this.host.store.getOverview().tasks.filter(task => (task.id === parentId || task.delegation?.parentTaskId === parentId) && (!query || task.title.toLowerCase().includes(query.toLowerCase()))).slice(0, 50).map(summary),
			read: id => { scoped(id); const task = this.host.store.getTaskView(id); return { thread: summary(task), messages: task.messages.slice(-30).map(({ role, text, createdAt }) => ({ role, text: text.slice(0, 8000), createdAt })), truncated: (task.conversationCounts?.messages ?? task.messages.length) > 30 || task.messages.some(message => message.text.length > 8000) }; },
			delegate: async raw => {
				const request = validateDelegate(raw);
				if (this.host.isClosing()) throw new Error("The workspace is shutting down.");
				let parent = scoped(parentId);
				if (parent.archived || parent.status === "interrupted") throw new Error("This parent chat is not accepting delegated work.");
				const existing = retry(request.requestId);
				if (existing) return summary(this.host.store.getTask(existing.id));
				const harness = request.harness ?? parent.harness;
				const model = request.model ?? (harness === parent.harness ? parent.model : undefined);
				if (!model || model === "default") throw new Error("Choose an explicit model for delegated work (see list_agents).");
				const { mode, permissionMode } = childPrivileges(parent, request);
				this.host.assertHarnessAvailable(harness);
				const accountId = this.pickAccount(harness, parent, request.accountId, true);
				this.assertCapacity();
				let modelOptions = harness === parent.harness && model === parent.model ? parent.modelOptions : undefined;
				if (this.host.discoverModels) {
					const catalog = await this.discover(parent, harness, accountId, model);
					const selected = catalog.models.find(value => value.id === model);
					if (!selected) throw new Error("This model is not available for the selected account.");
					if (request.modelOptions) {
						for (const [id, value] of Object.entries(request.modelOptions)) {
							const option = selected.options?.find(option => option.id === id);
							if (!option || (option.type === "boolean" ? typeof value !== "boolean" : typeof value !== "string" || !option.options.some(choice => choice.id === value))) throw new Error(`This model does not offer ${id}=${String(value)}. Use the settings list_agents returns.`);
						}
						modelOptions = Object.keys(request.modelOptions).length ? request.modelOptions : undefined;
					}
				} else if (request.modelOptions) throw new Error("Model settings cannot be checked right now; omit modelOptions.");
				parent = scoped(parentId);
				if (this.host.isClosing() || parent.archived || parent.status === "interrupted") throw new Error("This parent chat is no longer accepting delegated work.");
				if (parent.projectId) this.host.assertProjectAvailable(parent.projectId);
				const child = this.host.store.createDelegatedTask({ type: "create-task", harness, model, accountId, agentId: harness === parent.harness ? parent.agentId : undefined, projectId: parent.projectId, mode, permissionMode, reasoningEffort: harness === parent.harness ? parent.reasoningEffort : undefined, modelOptions }, { parentTaskId: parentId, requestId: request.requestId, background: request.background, role: request.role }, request.role ? `Role: ${request.role}\n\n${request.prompt}` : request.prompt, request.title, this.maxActiveAgents());
				this.host.broadcast(); this.host.start(child.id); return summary(child);
			},
			wait: async (id, timeoutMs = waitDefaultMs, signal) => {
				if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > waitMaximumMs) throw new Error("Invalid wait timeout.");
				scoped(id, true);
				return new Promise(resolve => {
					const check = (abandoned = false) => {
						const child = scoped(id, true), parent = this.host.store.getTask(parentId);
						if (!abandoned && !this.host.isClosing() && parent.status !== "interrupted" && active(child.status)) return;
						clearTimeout(timer); this.listeners.delete(listener); signal?.removeEventListener("abort", abort);
						// Mirror T3's upgrade-to-always-wake: nobody is waiting any more, so the result is delivered as a message.
						const deliveryQueued = abandoned && active(child.status) && !this.host.isClosing();
						if (deliveryQueued && !child.delegation?.background) this.host.store.requestDelegationWake(id);
						resolve({ thread: summary(child), timedOut: abandoned, result: child.status === "completed" ? child.messages.findLast(message => message.role === "assistant")?.text.slice(0, 32000) : undefined, ...(deliveryQueued ? { deliveryQueued } : {}) });
					};
					const listener = () => check(); const abort = () => check(true);
					const timer = setTimeout(abort, timeoutMs);
					this.listeners.add(listener); signal?.addEventListener("abort", abort, { once: true });
					if (signal?.aborted) abort(); else check();
				});
			},
			interrupt: async id => { scoped(id, true); await this.host.command({ type: "cancel", id }); return summary(scoped(id, true)); },
		};
	}
}

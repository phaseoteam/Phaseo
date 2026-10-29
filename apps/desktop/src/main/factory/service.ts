import path from "node:path";
import { stageLabel, stagesFor } from "../../shared/factory/stages";
import type { AgentProfile, FactorySnapshot, StageId, WorkItem } from "../../shared/factory/types";
import type { FactoryAgentTools, WorkItemFilter, WorkItemRead, WorkItemSummary } from "../../shared/orchestration";
import type { WorkspaceRuntime } from "../workspaceRuntime";
import { discoverAgents } from "./agents";
import { factoryPersistence, importLegacyOnce } from "./persistence";
import { StageThreads } from "./stageThreads";
import { FactoryStore } from "./store";

/** Discovery starts processes: the agent list is kept this long between looks. */
const AGENTS_FOR = 2 * 60_000;
const STAGES: StageId[] = ["triage", "reproduce", "fix", "review", "verify"];

/**
 * Code ▸ Factory in the main process: Factory's store, running its stages as desktop threads on the desktop's accounts,
 * saving to the desktop's database. `dataDir` holds attachments and worktrees; `legacyFolder` is the old Factory app's
 * data folder, read once.
 */
export class FactoryService {
	readonly store: FactoryStore;
	private readonly threads: StageThreads;
	private agents?: { at: number; list: Promise<AgentProfile[]> };
	private started?: Promise<void>;
	/** Set once saved state is loaded: shutting down before that has nothing of its own to save. */
	private loaded = false;

	constructor(private readonly runtime: WorkspaceRuntime, private readonly options: { dataDir: string; legacyFolder: string; demo: boolean; broadcast: (snapshot: FactorySnapshot) => void }) {
		this.threads = new StageThreads(runtime, { get: (itemId) => this.store.threadOf(itemId), set: (itemId, threadId) => this.store.setThread(itemId, threadId) });
		this.store = new FactoryStore({
			dataDir: options.dataDir,
			demo: options.demo,
			broadcast: options.broadcast,
			persistence: factoryPersistence(runtime.store),
			agents: () => this.discover(),
			threads: this.threads,
			capacity: () => {
				const maximum = runtime.store.getPreferences().maxActiveAgents, active = runtime.store.activeAgentCount();
				return active >= maximum ? `All ${maximum} agent slots are busy` : undefined;
			},
		});
	}

	/** Imports the old app's state the first time, then loads and reads GitHub. The window can ask for a snapshot meanwhile. */
	start(): Promise<void> {
		this.started ??= (async () => {
			if (!this.options.demo) await importLegacyOnce(this.runtime.store, this.options.legacyFolder, () => this.discover(), this.options.dataDir).catch(() => undefined);
			await this.store.load();
			this.loaded = true;
			void this.store.start().catch(() => undefined);
		})();
		return this.started;
	}

	/** Runs going are saved as interrupted, to carry on at the next start; call before the runtime closes. */
	async shutdown() {
		this.threads.close();
		if (this.loaded) await this.store.shutdown();
	}

	/** The agents on the desktop's accounts, looked for again at most every two minutes. */
	private discover(): Promise<AgentProfile[]> {
		if (!this.agents || Date.now() - this.agents.at > AGENTS_FOR) {
			const list = discoverAgents({ accounts: () => this.runtime.store.getAccounts(), discoverModels: this.runtime.discoverThreadModels, discoverInstallations: this.runtime.discoverInstallations });
			this.agents = { at: Date.now(), list };
			void list.catch(() => { this.agents = undefined; });
		}
		return this.agents.list;
	}

	/** list_work_items, read_work_item and run_stage for one thread's agent. Starting a stage needs full access outside Plan mode. */
	agentTools(threadId: string): FactoryAgentTools {
		const summary = (item: WorkItem): WorkItemSummary => {
			const stage = stagesFor(item).find((definition) => item.stages[definition.id].status !== "done" && item.stages[definition.id].status !== "skipped") ?? stagesFor(item).at(-1);
			return { id: item.id, repository: item.repo, number: item.number, kind: item.kind, state: item.state, title: item.title, url: item.url, labels: item.labels, priority: item.priority, stage: stage?.id ?? null, stageStatus: stage ? item.stages[stage.id].status : null, autopilot: Boolean(item.autopilot), threadId: this.store.threadOf(item.id) ?? null };
		};
		const item = (itemId: string) => {
			const found = this.store.get().items.find((candidate) => candidate.id.toLowerCase() === itemId.trim().toLowerCase());
			if (!found) throw new Error("No such work item. list_work_items gives their ids (owner/repo#number).");
			return found;
		};
		return {
			list: async (filter: WorkItemFilter) => {
				const query = filter.query?.toLowerCase();
				const matches = this.store.get().items.filter((candidate) => {
					if (filter.repository && candidate.repo.toLowerCase() !== filter.repository.toLowerCase()) return false;
					if (filter.kind && candidate.kind !== filter.kind) return false;
					if (query && !candidate.title.toLowerCase().includes(query) && !`#${candidate.number}`.includes(query)) return false;
					const statuses = STAGES.map((stage) => candidate.stages[stage].status);
					const open = candidate.state === "open" || candidate.state === "draft";
					switch (filter.status) {
						case "open": return open;
						case "closed": return !open;
						case "running": return statuses.some((status) => status === "running" || status === "queued");
						case "needs-you": return statuses.some((status) => status === "needs-you" || status === "failed" || status === "waiting");
						case "done": return open && stagesFor(candidate).every((definition) => ["done", "skipped"].includes(candidate.stages[definition.id].status));
						default: return true;
					}
				});
				return { items: matches.slice(0, filter.limit ?? 30).map(summary), total: matches.length };
			},
			read: async (itemId: string): Promise<WorkItemRead> => {
				const found = item(itemId), runs = this.store.get().runs;
				return {
					...summary(found),
					author: found.author.login,
					body: this.store.itemBody(found.id).slice(0, 20_000),
					linked: found.linked ?? null,
					branch: found.branch ?? null,
					assigneeId: found.assigneeId ?? null,
					stages: stagesFor(found).map((definition) => {
						const state = found.stages[definition.id];
						const run = runs.find((candidate) => candidate.id === state.runId) ?? runs.find((candidate) => candidate.itemId === found.id && candidate.stage === definition.id);
						return { id: definition.id, label: definition.label, status: state.status, summary: state.summary ?? null, agentId: state.agentId ?? null, run: run ? { id: run.id, status: run.status, summary: run.summary?.slice(0, 2_000) ?? null, verdict: run.report?.verdict ?? null, threadId: run.threadId ?? null, startedAt: new Date(run.startedAt).toISOString(), finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null } : null };
					}),
					agents: this.store.get().agents.slice(0, 60).map((agent) => ({ id: agent.id, label: agent.label, harness: agent.harness, accountName: agent.accountName ?? null })),
				};
			},
			runStage: async (itemId: string, stage: string, agentId?: string) => {
				await this.start();
				const caller = this.runtime.store.getTask(threadId);
				if (caller.permissionMode !== "full-access" || caller.mode === "plan") throw new Error("Running a Factory stage needs this chat to have full access outside Plan mode. Ask the user to change its permissions.");
				const found = item(itemId);
				// A pull request's Fix answers its Review or Verify findings, the same as "Fix the findings" on the item.
				const fixesPull = found.kind === "pull" && stage === "fix";
				const definition = fixesPull ? { id: "fix" as const } : stagesFor(found).find((candidate) => candidate.id === stage);
				if (!definition) throw new Error(`${found.kind === "pull" ? "Pull requests" : "Issues"} have no ${stage} stage here; use one of ${stagesFor(found).map((candidate) => candidate.id).join(", ")}.`);
				if (agentId && !this.store.get().agents.some((agent) => agent.id === agentId)) throw new Error("Unknown agentId: use one of read_work_item's agents.");
				const before = new Set(this.store.get().runs.map((run) => run.id));
				await this.store.act(found.id, fixesPull ? { id: "fix-findings", label: "Fix the findings", ...(agentId ? { agentId } : {}) } : { id: "run", stage: definition.id, label: `Run ${stageLabel(definition.id)}`, ...(agentId ? { agentId } : {}) });
				const run = this.store.get().runs.find((candidate) => !before.has(candidate.id) && candidate.itemId === found.id);
				if (!run) throw new Error(`${stageLabel(definition.id)} didn't start: ${found.stages[definition.id].summary ?? "no agent is available"}`);
				return { runId: run.id, itemId: found.id, stage: definition.id, agentId: run.agentId, threadId: run.threadId ?? null };
			},
		};
	}
}

export const factoryDataFolder = (workspaceDirectory: string) => path.join(workspaceDirectory, "factory");

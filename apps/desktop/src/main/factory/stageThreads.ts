import path from "node:path";
import { parseReport } from "../../shared/factory/report";
import { stageDefinition, stageLabel } from "../../shared/factory/stages";
import type { AgentProfile, LogLine, Run, WorkItem } from "../../shared/factory/types";
import type { AgentActivity, Message, Task, WorkspaceCommand } from "../../shared/workspace";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import type { WorkspaceStore } from "../workspaceStore";
import { effortSettings } from "./agents";
import type { AgentProcess, RunHandlers, StageStart, StageWorkspace } from "./runner";
import type { FactoryThreads } from "./store";
import { changedFiles, collectProof, git } from "./worktrees";

/**
 * Factory's stages run as desktop threads. Each work item has one thread of its own (a Code thread with full access, in
 * the item's worktree, linked to its pull request), and each stage run is a child of it: made with the desktop's
 * delegation as `kind: "stage"`, so it shows under the item's thread and never delivers its result into it. What the
 * child does becomes the run's log; its last answer is the run's report.
 */

type CreateTask = Extract<WorkspaceCommand, { type: "create-task" }>;

/** What Factory needs from the desktop's runtime (WorkspaceRuntime), so tests can pass a real one or their own. */
export interface StageThreadHost {
	readonly store: Pick<WorkspaceStore, "getTask" | "getTaskTail" | "getOverview" | "getProjects" | "addProject" | "saveProject">;
	command(command: WorkspaceCommand): Promise<WorkspaceOverview>;
	/** A thread made for Factory, not started. */
	createThread(command: CreateTask, title: string): Task;
	/** A stage's child thread of `parentId`, started now. */
	startStageThread(parentId: string, command: CreateTask, requestId: string, prompt: string, title: string): Task;
	/** Called after every change to the workspace's threads; returns a function that stops listening. */
	onThreadsChange(listener: () => void): () => void;
}

/** Where Factory remembers each item's thread (FactoryStore.setThread / threadOf). */
export interface ParentThreads {
	get(itemId: string): string | undefined;
	set(itemId: string, threadId: string): void;
}

interface Watch {
	runId: string;
	threadId: string;
	/** The message that started this run in the thread: everything after it is the run's. */
	startId: string;
	stage: StageStart["stage"];
	cwd: string;
	proof: string;
	changedBefore: string[];
	handlers: RunHandlers;
	/** Activities and answers already in the log. */
	logged: Set<string>;
	revision?: number;
	/** The thread's revision once the brief was queued: a thread that failed before then failed in an earlier run. */
	queuedRevision?: number;
	/** When the brief was sent: a stop after this is this run's, one before it an earlier run's. */
	queuedAt: number;
	stopping: boolean;
	ending: boolean;
	/** The thread's usage when the run started, so a thread carried on counts only this run's. */
	baseUsage: { tokens: number; costNanos: number };
}

const same = (a: string, b: string) => path.relative(path.resolve(a), path.resolve(b)) === "";
const firstLine = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";

/** A finished activity as a log line; reasoning and usage stay in the thread. */
export function activityLine(activity: AgentActivity, at = Date.now()): LogLine | undefined {
	if (activity.type === "usage" || activity.type === "reasoning") return undefined;
	if (activity.type === "compaction") return { at, kind: "info", text: "Compacted its conversation" };
	if (activity.type === "plan") return { at, kind: "info", text: activity.title || "Updated its plan" };
	const detail = firstLine(activity.text).slice(0, 160);
	return { at, kind: activity.status === "failed" ? "error" : "tool", text: [activity.title, detail].filter(Boolean).join(" ").slice(0, 300) };
}

export class StageThreads implements FactoryThreads {
	private readonly watches = new Map<string, Watch>();
	private readonly unsubscribe: () => void;
	/** Parents being made, by item, so two stages starting together share one. */
	private readonly making = new Map<string, Promise<string>>();

	constructor(private readonly host: StageThreadHost, private readonly parents: ParentThreads) {
		this.unsubscribe = host.onThreadsChange(() => this.checkAll());
	}

	close() {
		this.unsubscribe();
		this.watches.clear();
	}

	ensureParent(item: WorkItem, agent: AgentProfile | undefined, workspace: StageWorkspace | undefined): Promise<string> {
		const pending = this.making.get(item.id);
		if (pending) return pending;
		const making = this.makeParent(item, agent, workspace).finally(() => this.making.delete(item.id));
		this.making.set(item.id, making);
		return making;
	}

	private async makeParent(item: WorkItem, agent: AgentProfile | undefined, workspace: StageWorkspace | undefined): Promise<string> {
		const known = this.parents.get(item.id);
		if (known) {
			try {
				this.host.store.getTask(known);
				return known;
			} catch {
				// Deleted: the item gets a new one.
			}
		}
		if (!agent) throw new Error("Connect an account in Settings → Accounts first: Factory's agents run on the desktop's accounts.");
		const projectId = workspace ? await this.worktreeProject(workspace) : undefined;
		const thread = this.host.createThread({ type: "create-task", harness: agent.harness, accountId: agent.accountId, model: agent.model, mode: "code", permissionMode: "full-access", projectId }, `#${item.number} ${item.title}`.slice(0, 100));
		this.parents.set(item.id, thread.id);
		await this.linkItem(thread.id, item);
		return thread.id;
	}

	/** The thread links its issue or pull request, and the pull request that fixes its issue, so their state shows beside it. */
	async linkItem(threadId: string, item: WorkItem) {
		const pull = item.kind === "pull" ? item.url : item.linked ? `https://github.com/${item.repo}/pull/${item.linked}` : undefined;
		if (pull) await this.host.command({ type: "link-pull-request", id: threadId, reference: pull, source: "agent" }).catch(() => undefined);
		if (item.kind === "issue") await this.host.command({ type: "link-issue", id: threadId, reference: item.url, source: "agent" }).catch(() => undefined);
	}

	/** The worktree as a desktop worktree project of the clone's project (made if the clone isn't a project yet). */
	async worktreeProject(workspace: StageWorkspace): Promise<string> {
		const projects = this.host.store.getProjects();
		const existing = projects.find((project) => same(project.directory, workspace.dir) && !project.worktree?.removedAt);
		if (existing) {
			if (existing.worktree && existing.worktree.branch !== workspace.branch) {
				existing.worktree = { ...existing.worktree, branch: workspace.branch };
				this.host.store.saveProject(existing);
			}
			return existing.id;
		}
		const source = projects.find((project) => same(project.directory, workspace.clone) && !project.worktree) ?? this.host.store.addProject(path.resolve(workspace.clone));
		const baseCommit = await git(workspace.dir, ["rev-parse", "HEAD"]).catch(() => "");
		const project = this.host.store.addProject(path.resolve(workspace.dir));
		// Named after the clone: the branch shows beside it wherever the project does.
		project.name = source.name;
		project.worktree = { sourceProjectId: source.id, branch: workspace.branch, baseCommit };
		this.host.store.saveProject(project);
		return project.id;
	}

	async start(input: StageStart): Promise<AgentProcess> {
		const { item, agent, stage, workspace, prompt, handlers } = input;
		const parentId = await this.ensureParent(item, agent, workspace);
		const projectId = await this.worktreeProject(workspace);
		const title = `${stageLabel(stage)} · #${item.number}`;
		let threadId: string, startId: string | undefined, baseUsage = { tokens: 0, costNanos: 0 };
		const queuedAt = Date.now();
		const previous = input.resume ? this.reusable(input.resume, agent) : undefined;
		if (previous) {
			// A reply, or carrying on after an interruption: the same conversation goes on.
			threadId = previous.id;
			baseUsage = previous.usageTotals ?? baseUsage;
			// The effort may have changed since the thread last ran: the carried-on turn uses the one chosen now.
			const effort = effortSettings(agent);
			if (effort.reasoningEffort || effort.modelOptions) await this.host.command({ type: "update-task", id: threadId, ...(effort.reasoningEffort ? { reasoningEffort: effort.reasoningEffort } : {}), ...(effort.modelOptions ? { modelOptions: { ...previous.modelOptions, ...effort.modelOptions } } : {}) });
			await this.host.command({ type: "send", id: threadId, text: prompt });
			startId = this.host.store.getTask(threadId).queue.findLast((message) => message.text === prompt)?.id
				?? this.host.store.getTask(threadId).messages.findLast((message) => message.role === "user" && message.text === prompt)?.id;
		} else {
			const child = this.host.startStageThread(parentId, { type: "create-task", harness: agent.harness, accountId: agent.accountId, model: agent.model, mode: "code", permissionMode: "full-access", projectId, ...effortSettings(agent) }, input.runId, prompt, title);
			threadId = child.id;
			startId = child.queue[0]?.id ?? child.messages.find((message) => message.role === "user")?.id;
		}
		if (!startId) throw new Error("The stage's thread didn't take its brief");
		const watch: Watch = { runId: input.runId, threadId, startId, stage, cwd: workspace.dir, proof: input.proof, changedBefore: input.changedBefore, handlers, logged: new Set(), stopping: false, ending: false, baseUsage, queuedAt };
		watch.queuedRevision = this.revisionOf(threadId);
		this.watches.set(input.runId, watch);
		handlers.session(threadId);
		handlers.log({ at: Date.now(), kind: "info", text: previous ? `Carrying on in its thread, "${previous.title}"` : `Working in a thread of its own, "${title}", under the item's thread` });
		this.check(watch);
		return {
			send: (text) => {
				void this.deliver(threadId, text);
				return true;
			},
			stop: () => {
				watch.stopping = true;
				void this.host.command({ type: "cancel", id: threadId }).catch(() => undefined).finally(() => this.check(watch));
			},
		};
	}

	canResume(threadId: string, agent: AgentProfile) {
		return Boolean(this.reusable(threadId, agent));
	}

	/** The run's thread, when it can carry on: still there, not archived, and on the same harness and account. */
	private reusable(threadId: string, agent: AgentProfile): Task | undefined {
		try {
			const task = this.host.store.getTask(threadId);
			if (task.archived || task.harness !== agent.harness || (task.accountId ?? undefined) !== (agent.accountId ?? undefined) || task.model !== agent.model) return undefined;
			if (task.status === "running" || task.status === "waiting") return undefined;
			return task;
		} catch {
			return undefined;
		}
	}

	/** Steered into the running turn where the harness can; otherwise it goes in after it. */
	private async deliver(threadId: string, text: string) {
		let status: Task["status"] | undefined;
		try {
			status = this.host.store.getTask(threadId).status;
		} catch {
			return;
		}
		if (status === "running" || status === "waiting") {
			const steered = await this.host.command({ type: "steer", id: threadId, text }).then(() => true, () => false);
			if (steered) return;
		}
		await this.host.command({ type: "send", id: threadId, text }).catch(() => undefined);
	}

	private revisionOf(threadId: string) {
		return this.host.store.getOverview().tasks.find((task) => task.id === threadId)?.revision;
	}

	private checkAll() {
		if (!this.watches.size) return;
		const revisions = new Map(this.host.store.getOverview().tasks.map((task) => [task.id, task.revision]));
		for (const watch of [...this.watches.values()]) {
			if (!revisions.has(watch.threadId)) {
				this.end(watch, { status: watch.stopping ? "cancelled" : "failed", summary: watch.stopping ? undefined : "Its thread was deleted" });
				continue;
			}
			if (revisions.get(watch.threadId) === watch.revision) continue;
			this.check(watch);
		}
	}

	/** Logs what the thread did since the last look, and ends the run once the thread has stopped. */
	private check(watch: Watch) {
		if (watch.ending || !this.watches.has(watch.runId)) return;
		let task: Task;
		try {
			task = this.host.store.getTaskTail(watch.threadId, watch.startId);
		} catch {
			this.end(watch, { status: watch.stopping ? "cancelled" : "failed", summary: watch.stopping ? undefined : "Its thread was deleted" });
			return;
		}
		watch.revision = task.revision;
		const settled = !["running", "waiting"].includes(task.status) && !(task.queue.length && ["idle", "completed"].includes(task.status));
		const start = task.messages.findIndex((message) => message.id === watch.startId);
		if (start < 0) {
			// Not started yet; or stopped, or failed, before it could. A thread carried on still shows its last run's failure or
			// interruption until it starts, so only a failure after the brief was queued, or a stop since it was sent, ends a queued run.
			const queued = task.queue.some((message) => message.id === watch.startId);
			const stoppedSince = task.status === "interrupted" && Date.parse(task.interruptedAt ?? "") >= watch.queuedAt;
			if (queued && !watch.stopping && !stoppedSince && !(["failed", "limited"].includes(task.status) && (task.revision ?? 0) > (watch.queuedRevision ?? 0))) return;
			if (settled) void this.finish(watch, task, []);
			return;
		}
		const messages = task.messages.slice(start + 1);
		const entries: ({ order: number; message: Message } | { order: number; activity: AgentActivity })[] = [
			...messages.filter((message) => message.role === "assistant").map((message) => ({ order: message.timelineOrder ?? 0, message })),
			...(task.activities ?? []).map((activity) => ({ order: activity.timelineOrder ?? 0, activity })),
		].sort((a, b) => a.order - b.order);
		entries.forEach((entry, index) => {
			const key = "message" in entry ? `m:${entry.message.id}` : `a:${entry.activity.id}`;
			if (watch.logged.has(key)) return;
			if ("message" in entry) {
				// An answer is logged once it's whole: something came after it, or the thread stopped.
				if (index === entries.length - 1 && !settled) return;
				watch.logged.add(key);
				const text = entry.message.text.trim();
				if (text) watch.handlers.log({ at: Date.now(), kind: "text", text });
				return;
			}
			if (entry.activity.status === "running" && !settled) return;
			watch.logged.add(key);
			const line = activityLine(entry.activity);
			if (line) watch.handlers.log(line);
		});
		if (settled) void this.finish(watch, task, messages);
	}

	private async finish(watch: Watch, task: Task, messages: Message[]) {
		if (watch.ending) return;
		watch.ending = true;
		const last = messages.findLast((message) => message.role === "assistant")?.text;
		const used = task.usageTotals ? { tokens: task.usageTotals.tokens - watch.baseUsage.tokens, costNanos: task.usageTotals.costNanos - watch.baseUsage.costNanos } : undefined;
		const usage: Run["usage"] = used && used.tokens > 0 ? { inputTokens: used.tokens, outputTokens: 0, costUsd: used.costNanos / 1e9 } : undefined;
		if (watch.stopping || task.status === "interrupted") return this.end(watch, { status: "cancelled", usage });
		const report = parseReport(last, await collectProof(watch.proof));
		if (task.status !== "completed") {
			const why = task.status === "limited" ? `It reached a usage limit${task.error ? `: ${task.error}` : ""}` : task.error ?? "The agent stopped without saying why";
			watch.handlers.log({ at: Date.now(), kind: "error", text: why.slice(0, 2_000) });
			// A failure carries on by itself (twice at most); a usage limit would only fail again.
			return this.end(watch, { status: "failed", summary: why.slice(0, 240), usage, report, crashed: task.status === "failed" && !report.verdict });
		}
		// Stages that shouldn't edit code are held to it, whatever the harness allowed.
		if (stageDefinition(watch.stage).access !== "write") {
			const changed = (await changedFiles(watch.cwd)).filter((file) => !watch.changedBefore.includes(file));
			if (changed.length) return this.end(watch, { status: "failed", summary: `Changed files it shouldn't have: ${changed.slice(0, 5).join(", ")}`, usage, report });
		}
		this.end(watch, { status: "succeeded", summary: report.summary ?? last?.slice(0, 240), usage, report });
	}

	private end(watch: Watch, result: Parameters<RunHandlers["finish"]>[0]) {
		if (!this.watches.delete(watch.runId)) return;
		watch.ending = true;
		watch.handlers.finish(result);
	}
}

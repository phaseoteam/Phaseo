import { randomUUID } from "node:crypto";
import type { Task, WorkspaceCommand } from "../shared/workspace";
import type { TaskOverview } from "../shared/workspaceOverview";
import { chatSpend } from "../shared/chatSpend";
import { formatSpend } from "../shared/usageAmounts";
import { afterEventTurn, deliverySummary, deliveryText, newOperatorState, operatorDefaults, recordWake, triage, validateSubscription, wakeBudget, type OperatorEvent, type OperatorEventKind, type OperatorPause, type OperatorState } from "../shared/operator";
import type { WorkspaceStore } from "./workspaceStore";

export type OperatorHost = {
	store: WorkspaceStore;
	isClosing: () => boolean;
	broadcast: () => void;
	/** Starts the chat soon if it is idle, sharing the runtime's wake coalescing. */
	wake: (id: string) => void;
	cancel: (id: string) => Promise<unknown>;
	/** Records an activity in the chat outside a turn: the operator's own action log. */
	note: (id: string, title: string, text: string) => void;
	createThread: (command: Extract<WorkspaceCommand, { type: "create-task" }>, title: string) => Task;
};

/** The operator's tools: subscribe_events, unsubscribe_events and list_subscriptions. */
export type OperatorTools = {
	subscribe: (raw: unknown) => { id: string; subscriptions: number };
	unsubscribe: (id: string) => { id: string; removed: boolean };
	list: () => { subscriptions: OperatorState["subscriptions"]; held: number; paused?: OperatorPause; wakesLeftThisHour: number; spend: string; cap: string };
};

const needsYou = new Set(["Approval needed", "Answer needed", "Review pending instruction", "Autopilot needs you", "Spend cap reached", "Waiting for you"]);
const busy = (status: string) => status === "running" || status === "waiting";

/**
 * The operator chat's events and safety. It turns changes it sees in the overview (and watch notices it is handed) into
 * events, delivers those its subscriptions match as one queued message per burst, and pauses the operator at its spend
 * cap or when its event wakes stop needing action.
 */
export class OperatorService {
	private seen?: Map<string, { status: string; attention?: string }>;
	private buffer: OperatorEvent[] = [];
	private bufferTimer?: ReturnType<typeof setTimeout>;
	private budgetTimer?: ReturnType<typeof setTimeout>;
	private observeTimer?: ReturnType<typeof setTimeout>;
	private readonly judged = new Map<string, string>();
	constructor(private readonly host: OperatorHost, private readonly now: () => number = Date.now) {}

	/** The live operator chat, if there is one. */
	operatorId(tasks: readonly Pick<TaskOverview, "id" | "archived" | "operator">[] = this.host.store.getOverview().tasks) {
		return tasks.find(task => task.operator && !task.archived)?.id;
	}
	private state(id: string) { const task = this.host.store.getTask(id); return { task, state: task.operator ?? newOperatorState() }; }
	private save(task: Task, state: OperatorState) { task.operator = state; this.host.store.saveTask(task, true); this.host.broadcast(); }

	/**
	 * Opens the operator, creating it the first time: a projectless Code chat with full access, pinned, on the harness,
	 * account and model of the person's most recent top-level chat.
	 */
	open(): { threadId: string; created: boolean } {
		const tasks = this.host.store.getOverview().tasks, existing = this.operatorId(tasks);
		if (existing) return { threadId: existing, created: false };
		const template = tasks.filter(task => !task.delegation && !task.archived && task.harness !== "acp").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
		if (!template) throw new Error("Start a chat first, so the operator knows which agent and model to use.");
		const task = this.host.createThread({ type: "create-task", harness: template.harness, ...template.accountId ? { accountId: template.accountId } : {}, model: template.model, mode: "code", permissionMode: "full-access" }, "Operator");
		task.pinned = true; task.operator = newOperatorState();
		this.host.store.saveTask(task); this.host.broadcast();
		this.host.note(task.id, "Operator ready", "Ask it to watch your chats, pull requests and schedules. It subscribes to the events it needs and acts on them. Pause it from the command palette or the notice in this chat.");
		return { threadId: task.id, created: true };
	}

	pause(reason: OperatorPause["reason"], summary: string, id = this.operatorId()) {
		if (!id) throw new Error("There is no operator yet.");
		const { task, state } = this.state(id);
		if (state.paused?.reason === reason) return { paused: state.paused };
		const paused = { reason, summary, at: new Date(this.now()).toISOString() };
		this.save(task, { ...state, paused });
		this.host.note(id, "Operator paused", summary);
		// Stopping cascades to its agents. Deferred, so a pause the operator asks for itself can finish its tool call.
		setTimeout(() => { if (!this.host.isClosing()) for (const value of this.host.store.getOverview().tasks.filter(item => (item.id === id || item.delegation?.parentTaskId === id) && (busy(item.status) || item.status === "idle"))) void this.host.cancel(value.id).catch(() => {}); }, 0);
		return { paused };
	}
	resume(id = this.operatorId()) {
		if (!id) throw new Error("There is no operator yet.");
		const { task, state } = this.state(id);
		if (!state.paused) return { resumed: false };
		if (state.paused.reason === "cap" && this.spent(id) >= state.capNanos) throw new Error(`The operator has spent ${formatSpend(this.spent(id))} of its ${formatSpend(state.capNanos)} cap. Raise the cap first.`);
		this.save(task, { ...state, paused: undefined, quietWakes: 0 });
		this.host.note(id, "Operator resumed", state.held.length ? `${state.held.length} held ${state.held.length === 1 ? "event" : "events"} will be delivered.` : "Events wake it again.");
		this.deliver(id, []);
		return { resumed: true };
	}
	raiseCap(id = this.operatorId()) {
		if (!id) throw new Error("There is no operator yet.");
		const { task, state } = this.state(id), capNanos = state.capNanos + 5_000_000_000;
		this.save(task, { ...state, capNanos });
		this.host.note(id, "Operator spend cap raised", `The cap is now ${formatSpend(capNanos)}.`);
		return { cap: formatSpend(capNanos) };
	}
	private spent(id: string, tasks: readonly TaskOverview[] = this.host.store.getOverview().tasks) { const { own, agents } = chatSpend(tasks, id); return (own?.costNanos ?? 0) + agents.costNanos; }

	tools(id: string): OperatorTools {
		return {
			subscribe: raw => {
				const { task, state } = this.state(id);
				if (state.subscriptions.length >= operatorDefaults.maxSubscriptions) throw new Error(`The operator has ${operatorDefaults.maxSubscriptions} subscriptions; remove some first.`);
				const subscription = { id: randomUUID().slice(0, 8), ...validateSubscription(raw), createdAt: new Date(this.now()).toISOString() };
				this.save(task, { ...state, subscriptions: [...state.subscriptions, subscription] });
				return { id: subscription.id, subscriptions: state.subscriptions.length + 1 };
			},
			unsubscribe: subscriptionId => {
				const { task, state } = this.state(id), subscriptions = state.subscriptions.filter(value => value.id !== subscriptionId);
				if (subscriptions.length !== state.subscriptions.length) this.save(task, { ...state, subscriptions });
				return { id: subscriptionId, removed: subscriptions.length !== state.subscriptions.length };
			},
			list: () => {
				const { state } = this.state(id);
				return { subscriptions: state.subscriptions, held: state.held.length, ...state.paused ? { paused: state.paused } : {}, wakesLeftThisHour: wakeBudget(state, this.now()).remaining, spend: formatSpend(this.spent(id)), cap: formatSpend(state.capNanos) };
			},
		};
	}

	/** Called after every workspace change; the overview is read at most once a second. */
	changed() {
		if (this.observeTimer || this.host.isClosing()) return;
		this.observeTimer = setTimeout(() => { this.observeTimer = undefined; if (!this.host.isClosing()) this.observe(this.host.store.getOverview().tasks); }, 1000);
		this.observeTimer.unref?.();
	}
	/** Turns status changes of top-level chats into events. The first look only records what each chat is doing. */
	observe(tasks: readonly TaskOverview[]) {
		const operator = this.operatorId(tasks);
		if (operator) this.enforceCap(operator, tasks);
		const next = new Map<string, { status: string; attention?: string }>(), events: OperatorEvent[] = [], at = new Date(this.now()).toISOString();
		for (const task of tasks) {
			// The operator's own agents report to it already; other agents report to their own chats.
			if (task.delegation || task.archived || task.id === operator) continue;
			const now = { status: task.status, attention: task.attentionReason };
			next.set(task.id, now);
			const before = this.seen?.get(task.id);
			if (!this.seen || (before?.status === now.status && before.attention === now.attention)) continue;
			const event = (kind: OperatorEventKind, summary: string) => events.push({ id: randomUUID(), kind, at, threadId: task.id, ...task.projectId ? { projectId: task.projectId } : {}, ...task.missionId ? { scheduled: true } : {}, title: task.title, summary, sender: { kind: "app" } });
			if (now.status !== before?.status && now.status === "completed") event("thread.completed", "finished its turn");
			else if (now.status !== before?.status && now.status === "failed") event("thread.failed", "failed");
			else if (now.status !== before?.status && now.status === "limited") event("thread.limited", "stopped at a usage limit");
			else if (now.attention && now.attention !== before?.attention && needsYou.has(now.attention)) event("thread.needs-you", now.attention);
		}
		this.seen = next;
		if (events.length) this.emit(events);
	}
	/** A watched pull request or issue changed for some chat; the operator hears the summary the app wrote, never comment text. */
	watchNotice(kind: "pull-request.update" | "issue.update", threadId: string, summary: string) {
		let task; try { task = this.host.store.getTask(threadId); } catch { return; }
		if (task.operator) return;
		this.emit([{ id: randomUUID(), kind, at: new Date(this.now()).toISOString(), threadId, ...task.projectId ? { projectId: task.projectId } : {}, title: task.title, summary, sender: { kind: "app" } }]);
	}
	/** Events wait a moment, so a burst becomes one delivery. */
	emit(events: OperatorEvent[]) {
		if (this.host.isClosing()) return;
		this.buffer.push(...events);
		if (this.bufferTimer) return;
		this.bufferTimer = setTimeout(() => { this.bufferTimer = undefined; this.flush(); }, operatorDefaults.bufferMs);
		this.bufferTimer.unref?.();
	}
	flush() {
		const events = this.buffer; this.buffer = [];
		const id = this.operatorId();
		if (id && !this.host.isClosing()) this.deliver(id, events);
	}
	private deliver(id: string, events: OperatorEvent[]) {
		const { task, state } = this.state(id), now = this.now();
		const result = triage(state, events, now);
		let next: OperatorState = { ...state, held: result.held, heldWake: result.heldWake || undefined };
		if (result.deliver.length) {
			// Joins a delivery still waiting in the queue, so the operator reads one message for everything since its last turn.
			const waiting = state.queued && task.queue.find(item => item.id === state.queued!.messageId);
			const all = waiting ? [...state.queued!.events, ...result.deliver] : result.deliver;
			const message = { text: deliveryText(all, state.trustedSenders), notice: { kind: "event" as const, summary: deliverySummary(all), outcome: all.some(event => event.kind === "thread.failed") ? "failed" as const : "updated" as const } };
			if (waiting) Object.assign(waiting, message);
			else task.queue.push({ id: randomUUID(), ...message, createdAt: new Date(now).toISOString() });
			next = { ...waiting ? next : recordWake(next, now), queued: { messageId: waiting?.id ?? task.queue.at(-1)!.id, events: all } };
		}
		this.save(task, next);
		if (result.deliver.length) this.host.wake(id);
		else if (next.heldWake && !next.paused) this.retryWhenBudgetFrees(next);
	}
	private retryWhenBudgetFrees(state: OperatorState) {
		const at = wakeBudget(state, this.now()).nextAt;
		if (!at || this.budgetTimer) return;
		this.budgetTimer = setTimeout(() => { this.budgetTimer = undefined; const id = this.operatorId(); if (id && !this.host.isClosing()) this.deliver(id, []); }, Math.max(1000, at - this.now()));
		this.budgetTimer.unref?.();
	}
	/** Reads the overview, not the chat: it runs on every look at the workspace. */
	private enforceCap(id: string, tasks: readonly TaskOverview[] = this.host.store.getOverview().tasks) {
		const summary = tasks.find(task => task.id === id)?.operator;
		if (!summary || summary.paused || this.spent(id, tasks) < summary.capNanos) return;
		this.pause("cap", `The operator paused at its ${formatSpend(summary.capNanos)} spend cap. Raise the cap, then resume it.`, id);
	}
	/** After the operator's turn: an event wake whose turn called no tool counts towards the no-progress pause. */
	afterTurn(id: string) {
		// Every chat's turn ends here; only the operator's needs its conversation read.
		if (!this.host.store.getOverview().tasks.some(value => value.id === id && value.operator)) return;
		let task; try { task = this.host.store.getTask(id); } catch { return; }
		if (!task.operator || task.status !== "completed") return;
		this.enforceCap(id);
		const last = task.messages.findLast(message => message.role === "user");
		if (!last || last.notice?.kind !== "event" || this.judged.get(id) === last.id) return;
		this.judged.set(id, last.id);
		const usedTools = (task.activities ?? []).some(activity => activity.id.startsWith(`${last.id}:`) && activity.type === "tool");
		const state = this.state(id).state, next = afterEventTurn(state, usedTools, this.now());
		this.save(this.host.store.getTask(id), next);
		if (next.paused && !state.paused) this.host.note(id, "Operator paused", next.paused.summary);
	}
	close() { for (const timer of [this.bufferTimer, this.budgetTimer, this.observeTimer]) if (timer) clearTimeout(timer); }
}

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { AgentActivity, AgentConnection, Workspace, WorkspaceCommand } from "../shared/workspace";
import { CodexAdapter } from "./codexAdapter";
import { WorkspaceStore } from "./workspaceStore";
import { ClaudeAdapter } from "./claudeAdapter";
import type { AgentAdapter } from "./agentAdapter";
import type { Harness } from "../shared/workspace";
import type { SecretVault } from "./secretVault";
import { PhaseoAdapter } from "./phaseoAdapter";
import { PhaseoCodingAdapter } from "./phaseoCodingAdapter";
import { OpenCodeAdapter } from "./openCodeAdapter";
import { AcpAdapter } from "./acpAdapter";
import { PiAdapter } from "./piAdapter";
import { handoffPrompt } from "./handoffPrompt";
import { AttachmentService } from "./attachments";
import type { FormAnswer } from "../shared/agentForms";
import { formAnswerError } from "../shared/agentForms";
import { OpenCodeService } from "./openCodeService";

const hasRequests = (task: { approvals?: unknown[]; questions?: unknown[]; forms?: unknown[] }) => Boolean(task.approvals?.length || task.questions?.length || task.forms?.length);

function createAdapter(harness: Harness, agent?: AgentConnection, openCode?: OpenCodeService): AgentAdapter {
	if (harness === "codex") return new CodexAdapter();
	if (harness === "claude") return new ClaudeAdapter();
	if (harness === "opencode") return new OpenCodeAdapter(openCode ? signal => openCode.connect(signal) : undefined);
	if (harness === "pi") return new PiAdapter();
	if (harness === "acp" && agent) return new AcpAdapter(agent);
	throw new Error(`${harness} execution is not connected yet. Your message remains queued.`);
}

export class WorkspaceRuntime {
	readonly store: WorkspaceStore;
	readonly attachments: AttachmentService;
	readonly openCode: OpenCodeService;
	private readonly running = new Map<string, AgentAdapter>();
	private readonly approvals = new Map<string, { taskId: string; resolve: (decision: "accept" | "decline") => void }>();
	private readonly questions = new Map<string, { taskId: string; resolve: (answers: Record<string, string[]>) => void }>();
	private readonly forms = new Map<string, { taskId: string; resolve: (answer: FormAnswer | null) => void }>();
	private readonly executions = new Map<string, Promise<void>>();
	private closing = false;
	onChange: (workspace: Workspace) => void = () => {};
	constructor(private readonly directory: string, private readonly adapterFactory = createAdapter, private readonly vault?: SecretVault) {
		mkdirSync(directory, { recursive: true });
		this.store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		this.attachments = new AttachmentService(path.join(directory, "attachments"), this.store);
		this.openCode = new OpenCodeService(directory);
	}
	private broadcast() { this.onChange(this.store.get()); }
	async command(command: WorkspaceCommand): Promise<Workspace> {
		if (this.closing) throw new Error("The workspace is shutting down.");
		if (command.type === "add-agent") {
			this.store.saveAgent({ id: randomUUID(), name: command.name, executable: command.executable, arguments: command.arguments });
			this.broadcast(); return this.store.get();
		}
		if (command.type === "add-account") {
			const id = randomUUID();
			if (command.kind === "api") {
				if (!this.vault || !command.apiKey) throw new Error("Secure credential storage is unavailable.");
				this.vault.set(id, command.apiKey);
			}
			const configDirectory = command.kind === "native" ? path.join(this.directory, "accounts", id) : undefined;
			if (configDirectory) mkdirSync(configDirectory, { recursive: true });
			this.store.saveAccount({ id, name: command.name, harness: command.harness, kind: command.kind, endpoint: command.endpoint, configDirectory, configured: command.kind === "api" });
			this.broadcast(); return this.store.get();
		}
		if (command.type === "approval") {
			const pending = this.approvals.get(command.approvalId);
			if (!pending || pending.taskId !== command.id) throw new Error("This approval is no longer pending.");
			const task = this.store.getTask(command.id); task.approvals = task.approvals?.filter(value => value.id !== command.approvalId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast();
			this.approvals.delete(command.approvalId); pending.resolve(command.decision);
			return this.store.get();
		}
		if (command.type === "answer") {
			const pending = this.questions.get(command.requestId);
			const task = this.store.getTask(command.id);
			const request = task.questions?.find(value => value.id === command.requestId);
			if (!pending || pending.taskId !== task.id || !request) throw new Error("This question is no longer pending.");
			if (request.questions.some(question => !command.answers[question.id]?.length)) throw new Error("Answer every question.");
			task.questions = task.questions?.filter(value => value.id !== command.requestId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast(); this.questions.delete(command.requestId); pending.resolve(command.answers); return this.store.get();
		}
		if (command.type === "form-answer") {
			const pending = this.forms.get(command.requestId); const task = this.store.getTask(command.id);
			const request = task.forms?.find(value => value.id === command.requestId);
			if (!pending || pending.taskId !== task.id || !request) throw new Error("This form is no longer pending.");
			if (command.answer !== null) { const error = formAnswerError(request.form, command.answer); if (error) throw new Error(error); }
			task.forms = task.forms?.filter(value => value.id !== command.requestId); task.status = hasRequests(task) ? "waiting" : "running";
			this.store.saveTask(task); this.broadcast(); this.forms.delete(command.requestId); pending.resolve(command.answer); return this.store.get();
		}
		if (command.type === "cancel") {
			this.store.apply(command);
			for (const [id, pending] of this.approvals) if (pending.taskId === command.id) { pending.resolve("decline"); this.approvals.delete(id); }
			for (const [id, pending] of this.questions) if (pending.taskId === command.id) { pending.resolve({}); this.questions.delete(id); }
			for (const [id, pending] of this.forms) if (pending.taskId === command.id) { pending.resolve(null); this.forms.delete(id); }
			await this.running.get(command.id)?.cancel();
		}
		const task = this.store.apply(command);
		this.broadcast();
		if (command.type === "send" || command.type === "resume") this.start(task.id);
		return this.store.get();
	}
	private start(id: string) {
		if (this.closing || this.executions.has(id)) return;
		const execution = this.drain(id).finally(() => {
			this.executions.delete(id);
			if (!this.closing && this.store.getTask(id).status === "completed" && this.store.getTask(id).queue.length) this.start(id);
		});
		this.executions.set(id, execution);
		// Failures outside provider execution must be visible rather than unhandled.
		void execution.catch(error => {
			if (this.closing) return;
			const task = this.store.getTask(id); task.status = "failed";
			task.error = error instanceof Error ? error.message : "Workspace execution failed.";
			this.store.saveTask(task); this.broadcast();
		});
	}
	private async drain(id: string) {
		if (this.running.has(id)) return;
		const task = this.store.getTask(id);
		if (!task.queue.length) return;
		let adapter: AgentAdapter;
		try {
			const credential = (accountId: string) => { if (!this.vault) throw new Error("Credential storage is unavailable."); return this.vault.get(accountId); };
			adapter = task.harness === "phaseo" ? task.mode === "chat" ? new PhaseoAdapter(credential) : new PhaseoCodingAdapter(credential, this.store) : this.adapterFactory(task.harness, this.store.get().agents.find(agent => agent.id === task.agentId), this.openCode);
		}
		catch (error) {
			task.status = "failed"; task.error = error instanceof Error ? error.message : "Harness unavailable.";
			this.store.saveTask(task); this.broadcast(); return;
		}
		this.running.set(id, adapter);
		const message = task.queue.shift()!;
		task.messages.push({ ...message, role: "user" }); task.status = "running"; task.error = undefined;
		this.store.saveTask(task); this.broadcast();
		const project = this.store.get().projects.find(value => value.id === task.projectId);
		const cwd = project?.directory ?? path.join(this.directory, "tasks", id);
		const deltas = new Map<string, string>();
		let activities: (AgentActivity & { append?: boolean })[] = [];
		let flushTimer: ReturnType<typeof setTimeout> | undefined;
		let streamError: unknown;
		const flush = () => {
			if (flushTimer) clearTimeout(flushTimer); flushTimer = undefined;
			if (!deltas.size && !activities.length) return;
			const current = this.store.getTask(id);
			for (const [itemId, text] of deltas) {
				const messageId = `${message.id}:${itemId}`;
				const existing = current.messages.find(value => value.id === messageId);
				if (existing) existing.text += text;
				else current.messages.push({ id: messageId, text, role: "assistant", createdAt: new Date().toISOString() });
			}
			for (const activity of activities) {
				current.activities ??= [];
				const activityId = `${message.id}:${activity.id}`;
				const existing = current.activities.find(value => value.id === activityId);
				if (existing) { existing.text = activity.append ? existing.text + activity.text : activity.text; existing.status = activity.status; existing.title = activity.title; }
				else current.activities.push({ id: activityId, type: activity.type, title: activity.title, text: activity.text, status: activity.status });
			}
			this.store.saveTask(current); deltas.clear(); activities = []; this.broadcast();
		};
		const scheduleFlush = () => {
			flushTimer ??= setTimeout(() => { try { flush(); } catch (error) { streamError = error; void adapter.cancel().catch(() => {}); } }, 40);
		};
		try {
			mkdirSync(cwd, { recursive: true });
			const selectedAttachments = task.harness === "phaseo" || (task.handoffFrom && !task.nativeSessionId) ? task.messages.flatMap(message => message.attachments ?? []) : message.attachments ?? [];
			if (selectedAttachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			const attachmentIds = selectedAttachments.map(attachment => attachment.id);
			const attachments = await Promise.all([...new Set(attachmentIds)].map(id => this.attachments.read(id)));
			if (attachments.reduce((total, attachment) => total + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This conversation exceeds the 100 MB attachment limit. Start a new task with fewer files.");
			await adapter.run(task, cwd, handoffPrompt(task, message.text), {
				onSession: nativeSessionId => { const current = this.store.getTask(id); if (current.nativeSessionId === nativeSessionId) return; current.nativeSessionId = nativeSessionId; this.store.saveTask(current); this.broadcast(); },
				onDelta: (itemId, text) => {
					deltas.set(itemId, (deltas.get(itemId) ?? "") + text); scheduleFlush();
				},
				onActivity: activity => { activities.push(activity); scheduleFlush(); },
				onApproval: (method, description) => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve("decline"); return; }
					const approvalId = randomUUID(); this.approvals.set(approvalId, { taskId: id, resolve });
					const current = this.store.getTask(id); current.status = "waiting"; current.approvals ??= []; current.approvals.push({ id: approvalId, method, description });
					this.store.saveTask(current); this.broadcast();
				}),
				onForm: (form, signal) => new Promise(resolve => {
					flush();
					if (this.closing || signal?.aborted || this.store.getTask(id).status === "interrupted") { resolve(null); return; }
					if (!form.fields.length || form.fields.length > 100 || new Set(form.fields.map(field => field.key)).size !== form.fields.length) throw new Error("The agent returned an invalid form.");
					const requestId = randomUUID();
					const complete = (answer: FormAnswer | null) => { signal?.removeEventListener("abort", abort); resolve(answer); };
					const abort = () => {
						this.forms.delete(requestId); const current = this.store.getTask(id);
						current.forms = current.forms?.filter(value => value.id !== requestId);
						if (current.status === "waiting") current.status = hasRequests(current) ? "waiting" : "running";
						this.store.saveTask(current); this.broadcast(); complete(null);
					};
					this.forms.set(requestId, { taskId: id, resolve: complete });
					const current = this.store.getTask(id); current.status = "waiting"; current.forms ??= []; current.forms.push({ id: requestId, form });
					this.store.saveTask(current); this.broadcast(); signal?.addEventListener("abort", abort, { once: true });
				}),
				onQuestion: questions => new Promise(resolve => {
					flush();
					if (this.closing || this.store.getTask(id).status === "interrupted") { resolve({}); return; }
					const requestId = randomUUID(); this.questions.set(requestId, { taskId: id, resolve });
					const current = this.store.getTask(id); current.status = "waiting"; current.questions ??= []; current.questions.push({ id: requestId, questions });
					this.store.saveTask(current); this.broadcast();
				}),
			}, this.store.get().accounts.find(account => account.id === task.accountId), attachments);
			flush(); if (streamError) throw streamError;
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "completed";
			current.approvals = []; current.questions = []; current.forms = [];
			this.store.saveTask(current);
		} catch (error) {
			flush();
			const current = this.store.getTask(id);
			if (current.status !== "interrupted") current.status = "failed";
			current.error = error instanceof Error ? error.message : "Agent execution failed.";
			current.approvals = []; current.questions = []; current.forms = []; this.store.saveTask(current);
		} finally {
			if (flushTimer) clearTimeout(flushTimer);
			this.running.delete(id);
			for (const [approvalId, pending] of this.approvals) if (pending.taskId === id) { pending.resolve("decline"); this.approvals.delete(approvalId); }
			for (const [requestId, pending] of this.questions) if (pending.taskId === id) { pending.resolve({}); this.questions.delete(requestId); }
			for (const [requestId, pending] of this.forms) if (pending.taskId === id) { pending.resolve(null); this.forms.delete(requestId); }
			this.broadcast();
		}
	}
	async close() {
		this.closing = true;
		for (const id of this.running.keys()) this.store.apply({ type: "cancel", id });
		for (const pending of this.approvals.values()) pending.resolve("decline");
		for (const pending of this.questions.values()) pending.resolve({});
		for (const pending of this.forms.values()) pending.resolve(null);
		await Promise.allSettled([...this.running.values()].map(adapter => adapter.cancel()));
		await Promise.allSettled([...this.executions.values()]);
		await this.openCode.close();
		this.store.close();
	}
}

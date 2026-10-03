import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Account, AgentQuestion, QueuedMessage, Task } from "../shared/workspace";
import { JsonRpc, JsonRpcResponseError } from "./jsonRpc";
import { spawnNative } from "./nativeProcess";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { AgentInputRejectedError } from "./agentAdapter";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
import { readCodexModels } from "./modelCatalog";
import type { McpConnection } from "../shared/mcp";
import { codexMcpConfig, waitCodexMcp } from "./codexMcp";

type CodexEvent = { threadId?: string; itemId?: string; delta?: string; item?: { id: string; type: string; text?: string; command?: string; aggregatedOutput?: string; summary?: string[]; content?: string[]; status?: string; [key: string]: unknown }; explanation?: string; plan?: unknown[]; tokenUsage?: unknown; turn?: { id: string; status: string; error?: { message: string } } };
export class CodexAdapter implements AgentAdapter {
	private child?: ChildProcessWithoutNullStreams;
	private rpc?: JsonRpc;
	private turnId?: string;
	private threadId?: string;
	private rejectTurn?: (error: Error) => void;
	private canceled = false;
	private readonly controller = new AbortController();
	constructor(private readonly mcp: McpConnection[] = []) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = []): Promise<void> {
		this.child = await spawnNative("codex", ["app-server", "--stdio"], cwd, "@openai/codex/bin/codex.js", nativeAccountEnvironment(account));
		if (this.canceled) { this.child.kill(); throw new Error("Task stopped."); }
		const rpc = this.rpc = new JsonRpc(this.child.stdout, this.child.stdin);
		rpc.onClose = error => this.rejectTurn?.(error);
		this.child.on("error", error => { rpc.close(error); this.rejectTurn?.(error); });
		this.child.on("exit", () => { rpc.close(); this.rejectTurn?.(new Error("Codex stopped before completing the turn.")); });
		// Consume diagnostics without sending credentials or arbitrary stderr to the renderer.
		this.child.stderr.resume();
		rpc.onRequest = async (method, params) => {
			if (method === "item/tool/requestUserInput") {
				if (!callbacks.onQuestion) throw new Error("User questions are unavailable.");
				const input = params as { threadId: string; questions: AgentQuestion[] };
				if (input.threadId !== this.threadId) throw new Error("Question belongs to another task.");
				const answers = await callbacks.onQuestion(input.questions);
				return { answers: Object.fromEntries(Object.entries(answers).map(([id, values]) => [id, { answers: values }])) };
			}
			if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
				const input = params as { threadId?: string; command?: string; reason?: string };
				if (input.threadId !== this.threadId) throw new Error("Approval belongs to another task.");
				return { decision: await callbacks.onApproval(method, input.command ?? input.reason ?? "Allow this agent action?") };
			}
			throw new Error(`Unsupported Codex request: ${method}`);
		};
		try {
			await rpc.request("initialize", { clientInfo: { name: "phaseo_desktop", title: "Phaseo", version: "0.1.0" }, capabilities: { experimentalApi: true } });
			rpc.notify("initialized");
			let effort = task.reasoningEffort;
			if (effort !== undefined) {
				const models = await readCodexModels(rpc); const model = models.find(value => task.model === "default" ? value.default : value.id === task.model);
				effort ||= model?.defaultReasoningEffort;
				if (!effort || !model?.reasoningEfforts?.some(value => value.id === effort)) throw new AgentInputRejectedError("The selected model does not support this reasoning effort. Update the task settings.");
			}
			const settings = { cwd, model: task.model === "default" ? null : task.model, approvalPolicy: "untrusted", sandbox: task.mode === "code" ? "workspace-write" : "read-only", ...(this.mcp.length ? { config: codexMcpConfig(this.mcp, task) } : {}) };
			const sourceId = task.nativeSessionId ?? task.nativeForkFrom;
			const result = await rpc.request<{ thread: { id: string } }>(task.nativeSessionId ? "thread/resume" : task.nativeForkFrom ? "thread/fork" : "thread/start", { ...settings, ...(sourceId ? { threadId: sourceId } : {}) });
			this.threadId = result.thread.id; callbacks.onSession(result.thread.id);
			try { await waitCodexMcp(rpc, result.thread.id, this.mcp.filter(connection => task.mode !== "chat" && connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === task.projectId)), this.controller.signal); }
			catch (error) { throw new AgentInputRejectedError(error instanceof Error ? error.message : "MCP setup failed.", { cause: error }); }
			await new Promise<void>((resolve, reject) => {
				this.rejectTurn = reject;
				rpc.onNotification = (method, raw) => {
					const event = raw as CodexEvent;
					if (event.threadId !== this.threadId) return;
					if (method === "turn/started" && event.turn) this.turnId = event.turn.id;
					if (method === "item/agentMessage/delta" && typeof event.delta === "string") callbacks.onDelta(event.itemId ?? "assistant", event.delta);
					if ((method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") && typeof event.delta === "string") callbacks.onActivity?.({ id: event.itemId ?? "reasoning", type: "reasoning", title: "Reasoning", text: event.delta, append: true });
					if (method === "turn/plan/updated") callbacks.onActivity?.({ id: "plan", type: "plan", title: "Plan", text: `${event.explanation ?? ""}\n${JSON.stringify(event.plan, null, 2)}` });
					if (method === "thread/tokenUsage/updated") callbacks.onActivity?.({ id: "usage", type: "usage", title: "Context usage", text: JSON.stringify(event.tokenUsage, null, 2) });
					if ((method === "item/started" || method === "item/completed") && event.item && event.item.type !== "agentMessage" && event.item.type !== "userMessage") {
						const item = event.item;
						const type = item.type === "reasoning" ? "reasoning" : item.type === "plan" ? "plan" : "tool";
						callbacks.onActivity?.({ id: item.id, type, title: item.command ?? item.type, text: item.type === "reasoning" ? [...(item.summary ?? []), ...(item.content ?? [])].join("\n") : item.text ?? item.aggregatedOutput ?? JSON.stringify(item, null, 2), status: method === "item/started" ? "running" : item.status === "failed" ? "failed" : "completed" });
					}
					if (method === "turn/completed" && event.turn) {
						this.rejectTurn = undefined; this.turnId = undefined;
						if (event.turn.status === "completed") resolve(); else reject(new Error(event.turn.error?.message ?? `Codex turn ${event.turn.status}.`));
					}
				};
				void rpc.request<{ turn: { id: string } }>("turn/start", {
					threadId: this.threadId,
					effort: effort ?? null,
					input: [{ type: "text", text: attachmentPrompt(text, attachments), text_elements: [] }, ...attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ type: "localImage", path: attachment.filePath }))],
				}).then(response => { if (this.rejectTurn) this.turnId = response.turn.id; }, reject);
			});
		} finally { this.rejectTurn = undefined; this.turnId = undefined; rpc.close(); this.child.kill(); }
	}
	async steer(message: QueuedMessage, attachments: AttachmentContent[]) {
		if (this.canceled || !this.rpc || !this.threadId || !this.turnId || !this.rejectTurn) throw new AgentInputRejectedError("Codex is not ready for steering. Queue this message instead.");
		try {
			await this.rpc.request("turn/steer", { threadId: this.threadId, expectedTurnId: this.turnId, clientUserMessageId: message.id, input: [{ type: "text", text: attachmentPrompt(message.text, attachments), text_elements: [] }, ...attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ type: "localImage", path: attachment.filePath }))] });
		} catch (error) { if (error instanceof JsonRpcResponseError) throw new AgentInputRejectedError(error.message, { cause: error }); throw error; }
	}
	async cancel() {
		this.canceled = true; this.controller.abort();
		try {
			if (this.rpc && this.threadId && this.turnId) await this.rpc.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId }, 5000);
		} finally { this.rejectTurn?.(new Error("Task stopped.")); this.child?.kill(); }
	}
}

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Account, QueuedMessage, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import { spawnNative } from "./nativeProcess";
import { PiCommandRejectedError, PiRpc } from "./piRpc";
import type { PiRecord } from "./piRpc";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";

export const piEntries = ["@earendil-works/pi-coding-agent/dist/bundle/cli.js", "@earendil-works/pi-coding-agent/dist/cli.js", "@mariozechner/pi-coding-agent/dist/cli.js"];
const record = (value: unknown): PiRecord => value && typeof value === "object" && !Array.isArray(value) ? value as PiRecord : {};
export class PiAdapter implements AgentAdapter {
	private child?: ChildProcessWithoutNullStreams;
	private rpc?: PiRpc;
	private cancelled = false;
	private acceptingInput = false;
	private inputGeneration = 0;
	private readonly inputs = new Set<Promise<void>>();
	steer(message: QueuedMessage, attachments: AttachmentContent[]): Promise<void> {
		if (!this.rpc || !this.acceptingInput || this.cancelled) return Promise.reject(new AgentInputRejectedError("Pi is not accepting live instructions."));
		this.inputGeneration++;
		const sending = this.rpc.request({ type: "steer", message: attachmentPrompt(message.text, attachments), images: attachments.filter(file => file.kind === "image").map(file => ({ type: "image", data: file.dataUrl!.split(",")[1], mimeType: file.mimeType })) }).then(() => {}, error => { if (error instanceof PiCommandRejectedError) throw new AgentInputRejectedError(error.message); throw error; });
		this.inputs.add(sending); void sending.finally(() => this.inputs.delete(sending)).catch(() => {}); return sending;
	}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, _account?: Account, attachments: AttachmentContent[] = []) {
		if (task.mode === "code" && await callbacks.onApproval("Pi native tools", "Allow Pi to run its configured tools for this turn? Its native extensions and policies control individual tool actions.") !== "accept") throw new Error("Pi execution declined.");
		if (this.cancelled) throw new Error("Task stopped.");
		const args = ["--mode", "rpc"];
		if (task.nativeSessionId) args.push("--session", task.nativeSessionId);
		else if (task.nativeForkFrom) args.push("--fork", task.nativeForkFrom);
		if (task.mode === "chat") args.push("--no-tools");
		if (task.mode === "plan") args.push("--tools", "read,grep,find,ls");
		const child = this.child = await spawnNative("pi", args, cwd, piEntries); child.stderr.resume();
		const rpc = this.rpc = new PiRpc(child.stdout, child.stdin);
		let resolveTurn!: () => void; let rejectTurn!: (error: Error) => void;
		const turn = new Promise<void>((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
		void turn.catch(() => {});
		let receiving = false; let failure: string | undefined; let probe: ReturnType<typeof setTimeout> | undefined; let probing = false;
		const probeIdle = async () => {
			if (probing || this.cancelled) return; probing = true;
			try {
				const generation = this.inputGeneration; const hadPending = this.inputs.size > 0;
				await Promise.allSettled([...this.inputs]);
				const state = await rpc.request<PiRecord>({ type: "get_state" });
				if (!hadPending && generation === this.inputGeneration && this.inputs.size === 0 && state.isStreaming === false && state.isCompacting !== true && Number(state.pendingMessageCount ?? state.queuedMessageCount ?? 0) === 0) { this.acceptingInput = false; if (failure) rejectTurn(new Error(failure)); else resolveTurn(); }
				else probe = setTimeout(() => { void probeIdle(); }, 100);
			} catch (error) { rejectTurn(error instanceof Error ? error : new Error("Pi state check failed.")); }
			finally { probing = false; }
		};
		const dialog = async (event: PiRecord) => {
			if (typeof event.id !== "string") return;
			const title = typeof event.title === "string" ? event.title : "Pi extension";
			if (event.method === "confirm") {
				const decision = await callbacks.onApproval(title, typeof event.message === "string" ? event.message : title);
				if (!this.cancelled) rpc.send({ type: "extension_ui_response", id: event.id, confirmed: decision === "accept" });
			} else if (["select", "input", "editor"].includes(String(event.method))) {
				const options = Array.isArray(event.options) ? event.options.filter((option): option is string => typeof option === "string").map(label => ({ label })) : undefined;
				const answers = await callbacks.onQuestion?.([{ id: event.id, header: title, question: title, options, isOther: event.method !== "select" }]);
				const value = answers?.[event.id]?.[0];
				if (!this.cancelled) rpc.send({ type: "extension_ui_response", id: event.id, ...(value ? { value } : { cancelled: true }) });
			} else callbacks.onActivity?.({ id: event.id, type: "tool", title, text: String(event.message ?? event.text ?? ""), status: "completed" });
		};
		rpc.onClose = rejectTurn;
		rpc.onEvent = event => {
			if (event.type === "extension_ui_request") { void dialog(event).catch(error => rpc.close(error instanceof Error ? error : new Error("Pi dialog failed."))); return; }
			if (!receiving) return;
			if (event.type === "message_update") {
				const update = record(event.assistantMessageEvent);
				if (typeof update.delta === "string" && update.type === "text_delta") callbacks.onDelta("assistant", update.delta);
				if (typeof update.delta === "string" && update.type === "thinking_delta") callbacks.onActivity?.({ id: "reasoning", type: "reasoning", title: "Reasoning", text: update.delta, append: true });
			}
			if (event.type === "message_end") { const message = record(event.message); if (message.stopReason === "error" || message.stopReason === "aborted") failure = String(message.errorMessage ?? "Pi turn failed."); }
			if (event.type === "auto_retry_end" && event.success === true) failure = undefined;
			if (["tool_execution_start", "tool_execution_update", "tool_execution_end"].includes(String(event.type))) callbacks.onActivity?.({ id: String(event.toolCallId), type: "tool", title: String(event.toolName ?? "Pi tool"), text: JSON.stringify(event.result ?? event.partialResult ?? event.args ?? {}, null, 2), status: event.type === "tool_execution_end" ? event.isError ? "failed" : "completed" : "running" });
			if (event.type === "agent_settled") void probeIdle();
		};
		child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close(new Error("Pi process stopped.")));
		try {
			if (this.cancelled) throw new Error("Task stopped.");
			if (task.model !== "default") {
				const separator = task.model.indexOf("/");
				if (separator < 1 || separator === task.model.length - 1) throw new Error("Pi models use provider/model names.");
				await rpc.request({ type: "set_model", provider: task.model.slice(0, separator), modelId: task.model.slice(separator + 1) });
			}
			const state = await rpc.request<PiRecord>({ type: "get_state" });
			if (typeof state.sessionFile !== "string" || !state.sessionFile) throw new Error("Pi did not create a persisted session.");
			callbacks.onSession(state.sessionFile); receiving = true; this.acceptingInput = true;
			const response = await rpc.request<PiRecord | undefined>({ type: "prompt", message: attachmentPrompt(text, attachments), images: attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ type: "image", data: attachment.dataUrl!.split(",")[1], mimeType: attachment.mimeType })) }, 0);
			if (response?.disposition === "handled") await probeIdle();
			await turn;
		} finally { this.acceptingInput = false; clearTimeout(probe); rpc.close(); child.stdin.end(); child.kill(); }
	}
	async cancel() {
		this.cancelled = true; this.acceptingInput = false;
		try { try { await this.rpc?.request({ type: "clear_queue" }, 1000); } finally { await this.rpc?.request({ type: "abort" }, 1000); } }
		finally { this.rpc?.close(new Error("Task stopped.")); this.child?.kill(); }
	}
}

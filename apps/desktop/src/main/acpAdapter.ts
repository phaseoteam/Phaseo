import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import { client, ndJsonStream, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { ClientConnection, NewSessionResponse, PromptRequest, ToolCallUpdate } from "@agentclientprotocol/sdk";
import type { Account, AgentConnection, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { readProjectFile } from "./projectFiles";
import { contentHash, writeProjectFile } from "./projectEdits";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { AcpTerminals } from "./acpTerminals";

export class AcpAdapter implements AgentAdapter {
	private child?: ChildProcessWithoutNullStreams;
	private connection?: ClientConnection;
	private sessionId?: string;
	private cancelled = false;
	private terminals?: AcpTerminals;
	constructor(private readonly agent: AgentConnection) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, _account?: Account, attachments: AttachmentContent[] = []) {
		if (this.cancelled) throw new Error("Task stopped.");
		const child = this.child = spawn(this.agent.executable, this.agent.arguments, { cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] }); child.stderr.resume();
		let receiving = false;
		const tools = new Map<string, ToolCallUpdate>();
		const terminals = this.terminals = new AcpTerminals(cwd, callbacks);
		const checkSession = (sessionId: string) => { if (this.cancelled || sessionId !== this.sessionId) throw new Error("Agent request belongs to an inactive session."); };
		const app = client({ name: "phaseo-desktop" })
			.onRequest("terminal/create", async ({ params }) => { checkSession(params.sessionId); if (task.mode !== "code") throw new Error("Terminal commands require Code mode."); return terminals.create(params); })
			.onRequest("terminal/output", ({ params }) => { checkSession(params.sessionId); return terminals.output(params.terminalId); })
			.onRequest("terminal/wait_for_exit", ({ params }) => { checkSession(params.sessionId); return terminals.wait(params.terminalId); })
			.onRequest("terminal/kill", ({ params }) => { checkSession(params.sessionId); return terminals.kill(params.terminalId); })
			.onRequest("terminal/release", ({ params }) => { checkSession(params.sessionId); return terminals.release(params.terminalId); })
			.onRequest("session/request_permission", async ({ params }) => {
				checkSession(params.sessionId);
				if (task.mode !== "code" && ["edit", "execute", "delete", "move"].includes(params.toolCall.kind ?? "")) return { outcome: { outcome: "cancelled" } };
				const decision = await callbacks.onApproval(params.toolCall.title ?? "Agent action", JSON.stringify(params.toolCall, null, 2));
				if (this.cancelled) return { outcome: { outcome: "cancelled" } };
				const option = params.options.find(option => option.kind === (decision === "accept" ? "allow_once" : "reject_once"));
				return option ? { outcome: { outcome: "selected", optionId: option.optionId } } : { outcome: { outcome: "cancelled" } };
			})
			.onRequest("fs/read_text_file", async ({ params }) => {
				checkSession(params.sessionId); if (task.mode === "chat") throw new Error("File access is unavailable in Chat mode.");
				const content = await readProjectFile(cwd, path.relative(cwd, params.path));
				const first = params.line ?? 1; const limit = params.limit;
				if (!Number.isInteger(first) || first < 1 || (limit !== undefined && limit !== null && (!Number.isInteger(limit) || limit < 1))) throw new Error("Invalid file line range.");
				return { content: content.split("\n").slice(first - 1, limit ? first - 1 + limit : undefined).join("\n") };
			})
			.onRequest("fs/write_text_file", async ({ params }) => {
				checkSession(params.sessionId); if (task.mode !== "code") throw new Error("File writes require Code mode.");
				const filename = path.relative(cwd, params.path);
				let expected = "new";
				try { expected = contentHash(await readProjectFile(cwd, filename)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
				if (await callbacks.onApproval("Write file", `${filename}\n\n${params.content}`) !== "accept" || this.cancelled) throw new Error("File edit declined.");
				await writeProjectFile(cwd, filename, params.content, expected); return {};
			})
			.onNotification("session/update", ({ params }) => {
				if (!receiving || params.sessionId !== this.sessionId) return;
				const update = params.update;
				if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") callbacks.onDelta("assistant", update.content.text);
				if (update.sessionUpdate === "agent_thought_chunk" && update.content.type === "text") callbacks.onActivity?.({ id: "reasoning", type: "reasoning", title: "Reasoning", text: update.content.text, append: true });
				if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
					const tool = { ...tools.get(update.toolCallId), ...update }; tools.set(update.toolCallId, tool);
					callbacks.onActivity?.({ id: tool.toolCallId, type: "tool", title: tool.title ?? "Tool", text: JSON.stringify(tool.rawOutput ?? tool.content ?? tool.rawInput ?? {}, null, 2), status: tool.status === "completed" ? "completed" : tool.status === "failed" ? "failed" : "running" });
				}
				if (update.sessionUpdate === "plan") callbacks.onActivity?.({ id: "plan", type: "plan", title: "Plan", text: JSON.stringify(update.entries, null, 2) });
				if (update.sessionUpdate === "usage_update") callbacks.onActivity?.({ id: "usage", type: "usage", title: "Context usage", text: JSON.stringify(update, null, 2) });
			});
		const connection = this.connection = app.connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
		child.on("error", error => connection.close(error)); child.on("exit", () => connection.close(new Error("ACP agent stopped.")));
		const startup = setTimeout(() => connection.close(new Error("ACP initialization timed out.")), 30000);
		try {
			const initialized = await connection.agent.request("initialize", { protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "phaseo-desktop", version: "0.1.0" }, clientCapabilities: { fs: { readTextFile: task.mode !== "chat", writeTextFile: task.mode === "code" }, terminal: task.mode === "code" } });
			clearTimeout(startup);
			if (attachments.some(attachment => attachment.kind === "image") && !initialized.agentCapabilities?.promptCapabilities?.image) throw new Error("This ACP agent does not support image attachments.");
			const openSession = async (): Promise<NewSessionResponse> => {
				const timeout = setTimeout(() => connection.close(new Error("ACP session startup timed out.")), 30000);
				try {
					if (task.nativeSessionId) {
						if (!initialized.agentCapabilities?.loadSession) throw new Error("This agent cannot resume sessions. Start a new task.");
						this.sessionId = task.nativeSessionId;
						return { ...await connection.agent.request("session/load", { sessionId: task.nativeSessionId, cwd, mcpServers: [] }), sessionId: task.nativeSessionId };
					} else if (task.nativeForkFrom) {
						if (!initialized.agentCapabilities?.sessionCapabilities?.fork) throw new Error("This agent does not support native session forks.");
						return await connection.agent.request("session/fork", { sessionId: task.nativeForkFrom, cwd });
					} else return await connection.agent.request("session/new", { cwd, mcpServers: [] });
				} finally { clearTimeout(timeout); }
			};
			let session: NewSessionResponse;
			try { session = await openSession(); }
			catch (error) {
				if (!(error instanceof RequestError) || error.code !== RequestError.authRequired().code) throw error;
				const methods = (initialized.authMethods ?? []).filter(method => !("type" in method) || method.type !== "terminal");
				if (!methods.length || !callbacks.onQuestion) throw new Error("Authenticate this agent using its native application, then resume the task.", { cause: error });
				const options = methods.map(method => ({ label: `${method.name} (${method.id})`, description: method.description ?? undefined }));
				const answers = await callbacks.onQuestion([{ id: "auth-method", header: "Sign in to agent", question: `Choose a native sign-in method for ${this.agent.name}.`, options }]);
				const index = options.findIndex(option => option.label === answers["auth-method"]?.[0]);
				if (index < 0 || this.cancelled) throw new Error("Agent sign-in cancelled.", { cause: error });
				await connection.agent.request("authenticate", { methodId: methods[index].id });
				if (this.cancelled) throw new Error("Task stopped.", { cause: error });
				session = await openSession();
			}
			this.sessionId = session.sessionId; callbacks.onSession(session.sessionId);
			const mode = session.modes?.availableModes.find(mode => mode.id === task.mode);
			if (mode) await connection.agent.request("session/set_mode", { sessionId: session.sessionId, modeId: mode.id });
			if (task.model !== "default") {
				const option = session.configOptions?.find(option => option.category === "model" && option.type === "select");
				if (!option) throw new Error("This agent does not expose model selection. Use its native default.");
				await connection.agent.request("session/set_config_option", { sessionId: session.sessionId, configId: option.id, value: task.model });
			}
			clearTimeout(startup); receiving = true;
			const prompt: PromptRequest = { sessionId: session.sessionId, prompt: [{ type: "text", text: attachmentPrompt(text, attachments) }, ...attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ type: "image" as const, data: attachment.dataUrl!.split(",")[1], mimeType: attachment.mimeType }))] };
			const result = await connection.agent.request("session/prompt", prompt);
			if (result.stopReason !== "end_turn") throw new Error(`ACP turn stopped: ${result.stopReason}.`);
		} finally { clearTimeout(startup); connection.close(); child.kill(); await terminals.close(); }
	}
	async cancel() {
		this.cancelled = true;
		try { if (this.connection && this.sessionId) await this.connection.agent.notify("session/cancel", { sessionId: this.sessionId }); }
		finally { this.connection?.close(new Error("Task stopped.")); this.child?.kill(); await this.terminals?.close(); }
	}
}

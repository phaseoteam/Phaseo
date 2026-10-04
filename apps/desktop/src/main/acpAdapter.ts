import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import { client, ndJsonStream, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { ClientConnection, NewSessionResponse, PromptRequest, ToolCallUpdate } from "@agentclientprotocol/sdk";
import type { Account, AgentConnection, ModelOption, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { readProjectFile } from "./projectFiles";
import { contentHash, writeProjectFile } from "./projectEdits";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { AcpTerminals } from "./acpTerminals";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import { acpModels, acpModes } from "./acpModels";
import { AgentInputRejectedError } from "./agentAdapter";
import { GrokCompletion, grokCompletionMethods } from "./grokCompletion";
import { grokPlanMethods, grokPlanRequest, grokPlanReview, grokPlanReviewResponse, grokQuestionMethods, grokQuestionRequest, grokQuestionResponse } from "./grokInteraction";
import { grokModels, grokModelStream } from "./grokModels";

export class AcpAdapter implements AgentAdapter {
	private child?: ChildProcessWithoutNullStreams;
	private connection?: ClientConnection;
	private sessionId?: string;
	private cancelled = false;
	private readonly controller = new AbortController();
	private terminals?: AcpTerminals;
	private grok = false;
	constructor(private readonly agent: AgentConnection, private readonly mcp: McpConnection[] = [], private readonly environment?: NodeJS.ProcessEnv) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, _account?: Account, attachments: AttachmentContent[] = []) {
		if (this.cancelled) throw new Error("Task stopped.");
		this.grok = task.harness === "grok";
		const child = this.child = spawn(this.agent.executable, this.agent.arguments, { cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...this.environment } }); child.stderr.resume();
		let receiving = false; let promptSubmitted = false; let modesViaConfig = false; let nativeModes: ReturnType<typeof acpModes> = [];
		const tools = new Map<string, ToolCallUpdate>();
		const completion = new GrokCompletion();
		let nativeGrokModels: ModelOption[] = [];
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
				if (typeof params._meta?.promptId === "string" && params._meta.promptId.startsWith("task-completed-")) return;
				const update = params.update;
				if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") callbacks.onDelta("assistant", update.content.text);
				if (update.sessionUpdate === "agent_thought_chunk" && update.content.type === "text") callbacks.onActivity?.({ id: "reasoning", type: "reasoning", title: "Reasoning", text: update.content.text, append: true });
				if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
					const tool = { ...tools.get(update.toolCallId), ...update }; tools.set(update.toolCallId, tool);
					callbacks.onActivity?.({ id: tool.toolCallId, type: "tool", title: tool.title ?? "Tool", text: JSON.stringify(tool.rawOutput ?? tool.content ?? tool.rawInput ?? {}, null, 2), status: tool.status === "completed" ? "completed" : tool.status === "failed" ? "failed" : "running" });
				}
				if (update.sessionUpdate === "plan") callbacks.onActivity?.({ id: "plan", type: "plan", title: "Plan", text: JSON.stringify(update.entries, null, 2) });
				if (update.sessionUpdate === "usage_update") callbacks.onActivity?.({ id: "usage", type: "usage", title: "Context usage", text: JSON.stringify(update, null, 2) });
				if (update.sessionUpdate === "config_option_update") { callbacks.onModels?.(update.configOptions.some(option => option.category === "model" && option.type === "select") ? acpModels(update.configOptions) : nativeGrokModels); if (modesViaConfig) { nativeModes = acpModes(undefined, update.configOptions); callbacks.onModes?.(nativeModes); } }
				if (update.sessionUpdate === "current_mode_update" && !modesViaConfig) { nativeModes = nativeModes.map(mode => ({ ...mode, default: mode.id === update.currentModeId })); callbacks.onModes?.(nativeModes); }
			});
		for (const method of grokCompletionMethods) app.onNotification(method, (value: unknown) => value, ({ params }) => completion.notify(params));
		for (const method of grokQuestionMethods) app.onRequest(method, grokQuestionRequest, async ({ params }) => {
			checkSession(params.sessionId);
			if (!receiving || !callbacks.onQuestion) return { outcome: "cancelled" };
			const answers = await callbacks.onQuestion(params.questions);
			if (this.cancelled) return { outcome: "cancelled" };
			return grokQuestionResponse(params.questions, answers);
		});
		for (const method of grokPlanMethods) app.onRequest(method, grokPlanRequest, async ({ params }) => {
			checkSession(params.sessionId);
			if (!receiving || !params.plan) return { outcome: "abandoned", feedback: "Provide the proposed plan before requesting implementation." };
			callbacks.onActivity?.({ id: params.toolCallId, type: "plan", title: "Proposed plan", text: params.plan });
			if (task.mode !== "code") return { outcome: "abandoned", feedback: "The plan is captured. Wait for a later implementation instruction in Code mode." };
			if (callbacks.onQuestion) {
				const answers = await callbacks.onQuestion([grokPlanReview(params.plan)]);
				return this.cancelled ? { outcome: "abandoned" } : grokPlanReviewResponse(answers);
			}
			const decision = await callbacks.onApproval("Implement plan", params.plan);
			return { outcome: !this.cancelled && decision === "accept" ? "approved" : "abandoned" };
		});
		const connection = this.connection = app.connect(grokModelStream(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>)));
		child.on("error", error => connection.close(error)); child.on("exit", () => connection.close(new Error("ACP agent stopped.")));
		const startup = setTimeout(() => connection.close(new Error("ACP initialization timed out.")), 30000);
		try {
			const initialized = await connection.agent.request("initialize", { protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "phaseo-desktop", version: "0.1.0" }, ...(this.grok ? { _meta: { clientType: "extension" } } : {}), clientCapabilities: { fs: { readTextFile: task.mode !== "chat", writeTextFile: task.mode === "code" }, terminal: task.mode === "code", auth: { terminal: Boolean(callbacks.onTerminalAuth) } } });
			clearTimeout(startup);
			if (initialized.protocolVersion !== PROTOCOL_VERSION) throw new Error("This agent uses an unsupported ACP protocol version.");
			const servers = task.mode === "chat" ? [] : this.mcp;
			if (servers.some(server => server.transport === "http") && !initialized.agentCapabilities?.mcpCapabilities?.http) throw new Error("This ACP agent does not support HTTP MCP connections.");
			const mcpServers = servers.map(server => server.transport === "stdio" ? { name: nativeMcpName(server), command: server.executable, args: server.arguments, env: [{ name: "ELECTRON_RUN_AS_NODE", value: "1" }] } : { type: "http" as const, name: nativeMcpName(server), url: server.url, headers: [] });
			if (attachments.some(attachment => attachment.kind === "image") && !initialized.agentCapabilities?.promptCapabilities?.image) throw new Error("This ACP agent does not support image attachments.");
			const openSession = async (): Promise<NewSessionResponse> => {
				const timeout = setTimeout(() => connection.close(new Error("ACP session startup timed out.")), 30000);
				try {
					if (task.nativeSessionId) {
						if (!initialized.agentCapabilities?.loadSession) throw new Error("This agent cannot resume sessions. Start a new task.");
						this.sessionId = task.nativeSessionId;
						return { ...await connection.agent.request("session/load", { sessionId: task.nativeSessionId, cwd, mcpServers }), sessionId: task.nativeSessionId };
					} else if (task.nativeForkFrom) {
						if (!initialized.agentCapabilities?.sessionCapabilities?.fork) throw new Error("This agent does not support native session forks.");
						return await connection.agent.request("session/fork", { sessionId: task.nativeForkFrom, cwd, mcpServers });
					} else return await connection.agent.request("session/new", { cwd, mcpServers });
				} finally { clearTimeout(timeout); }
			};
			let session: NewSessionResponse;
			try { session = await openSession(); }
			catch (error) {
				if (!(error instanceof RequestError) || error.code !== RequestError.authRequired().code) throw error;
				const methods = (initialized.authMethods ?? []).filter(method => !("type" in method) || method.type !== "terminal" || callbacks.onTerminalAuth);
				if (!methods.length || !callbacks.onQuestion) throw new Error("Authenticate this agent using its native application, then resume the task.", { cause: error });
				const options = methods.map(method => ({ label: `${method.name} (${method.id})`, description: method.description ?? undefined }));
				const answers = await callbacks.onQuestion([{ id: "auth-method", header: "Sign in to agent", question: `Choose a native sign-in method for ${this.agent.name}.`, options }]);
				const index = options.findIndex(option => option.label === answers["auth-method"]?.[0]);
				if (index < 0 || this.cancelled) throw new Error("Agent sign-in cancelled.", { cause: error });
				const method = methods[index];
				if ("type" in method && method.type === "terminal") await callbacks.onTerminalAuth!(method.args ?? [], method.env ?? {}, `Sign in: ${this.agent.name} · ${method.name}`, this.controller.signal);
				else await connection.agent.request("authenticate", { methodId: method.id });
				if (this.cancelled) throw new Error("Task stopped.", { cause: error });
				session = await openSession();
			}
			this.sessionId = session.sessionId; callbacks.onSession(session.sessionId);
			let configOptions = session.configOptions;
			const grok = initialized._meta?.grokShell === true;
			nativeGrokModels = grok ? grokModels(session._meta?.modelState ?? initialized._meta?.modelState) : [];
			const hasModelConfig = () => Boolean(configOptions?.some(option => option.category === "model" && option.type === "select"));
			let models = hasModelConfig() ? acpModels(configOptions) : nativeGrokModels; callbacks.onModels?.(models);
			modesViaConfig = Boolean(configOptions?.some(option => option.category === "mode" && option.type === "select")) || !session.modes;
			nativeModes = acpModes(session.modes, configOptions); callbacks.onModes?.(nativeModes);
			const modeId = task.nativeMode || task.mode; const mode = nativeModes.find(mode => mode.id === modeId);
			if (task.nativeMode && !mode) throw new AgentInputRejectedError("This agent no longer offers the selected mode. Update the task settings.");
			if (mode && !mode.default) {
				if (!modesViaConfig) {
					await connection.agent.request("session/set_mode", { sessionId: session.sessionId, modeId });
					nativeModes = nativeModes.map(value => ({ ...value, default: value.id === modeId }));
				} else {
					const option = configOptions?.find(option => option.category === "mode" && option.type === "select");
					if (option) {
						const result = await connection.agent.request("session/set_config_option", { sessionId: session.sessionId, configId: option.id, value: modeId });
						configOptions = result.configOptions;
						models = hasModelConfig() ? acpModels(configOptions) : nativeGrokModels; callbacks.onModels?.(models);
						nativeModes = acpModes(undefined, configOptions);
						if (!nativeModes.some(value => value.id === modeId && value.default)) throw new AgentInputRejectedError("The agent did not apply the selected mode. Update the task settings.");
					}
				}
				callbacks.onModes?.(nativeModes);
			}
			if (!hasModelConfig() && grok && (task.model !== "default" || task.reasoningEffort)) {
				const selected = models.find(model => task.model === "default" ? model.default : model.id === task.model);
				if (!selected) throw new AgentInputRejectedError("Grok no longer offers the selected model. Update the task settings.");
				if (task.reasoningEffort && !selected.reasoningEfforts?.some(effort => effort.id === task.reasoningEffort)) throw new AgentInputRejectedError("Grok no longer offers the selected reasoning effort. Update the task settings.");
				await connection.agent.request("session/set_model", { sessionId: session.sessionId, modelId: selected.id, ...(task.reasoningEffort ? { _meta: { reasoningEffort: task.reasoningEffort } } : {}) });
				models = models.map(model => ({ ...model, default: model.id === selected.id, ...(model.id === selected.id && task.reasoningEffort ? { defaultReasoningEffort: task.reasoningEffort } : {}) })); nativeGrokModels = models; callbacks.onModels?.(models);
			} else if (task.model !== "default") {
				const option = configOptions?.find(option => option.category === "model" && option.type === "select");
				if (!option) throw new AgentInputRejectedError("This agent does not expose model selection. Use its native default.");
				if (!models.some(model => model.id === task.model)) throw new AgentInputRejectedError("This agent no longer offers the selected model. Update the task settings.");
				const result = await connection.agent.request("session/set_config_option", { sessionId: session.sessionId, configId: option.id, value: task.model }); callbacks.onModels?.(acpModels(result.configOptions));
				if (modesViaConfig) { nativeModes = acpModes(undefined, result.configOptions); callbacks.onModes?.(nativeModes); }
			}
			if (task.reasoningEffort && (!grok || hasModelConfig())) throw new AgentInputRejectedError("This ACP agent does not expose native reasoning selection yet.");
			clearTimeout(startup); receiving = true;
			const promptId = randomUUID();
			const prompt: PromptRequest = { sessionId: session.sessionId, _meta: { promptId, requestId: promptId }, prompt: [{ type: "text", text: attachmentPrompt(text, attachments) }, ...attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ type: "image" as const, data: attachment.dataUrl!.split(",")[1], mimeType: attachment.mimeType }))] };
			promptSubmitted = true;
			const result = await completion.run(session.sessionId, promptId, () => connection.agent.request("session/prompt", prompt), this.controller.signal);
			if (result.stopReason !== "end_turn") throw new Error(`ACP turn stopped: ${result.stopReason}.`);
		} catch (error) { if (!promptSubmitted && !(error instanceof AgentInputRejectedError)) throw new AgentInputRejectedError(error instanceof Error ? error.message : "ACP setup failed.", { cause: error }); throw error; }
		finally { clearTimeout(startup); connection.close(); child.kill(); await terminals.close(); }
	}
	async cancel() {
		this.cancelled = true;
		this.controller.abort();
		try { if (this.connection && this.sessionId) await this.connection.agent.notify("session/cancel", { sessionId: this.sessionId, ...(this.grok ? { _meta: { cancelTrigger: "ctrl_c" } } : {}) }); }
		catch { /* Prompt cancellation can close the connection before the notification flushes. */ }
		finally { this.connection?.close(new Error("Task stopped.")); this.child?.kill(); await this.terminals?.close(); }
	}
}

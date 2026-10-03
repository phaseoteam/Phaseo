import path from "node:path";
import { Agent, JsonlLocalAgentStore } from "@cursor/sdk";
import type { AgentOptions, McpServerConfig, Run, SDKAgent } from "@cursor/sdk";
import type { Account, QueuedMessage, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { handoffPrompt } from "./handoffPrompt";
import { nativeMcpName } from "../shared/mcp";
import type { McpConnection } from "../shared/mcp";

export function assertCursorBackend() {
	const backend = process.env.CURSOR_BACKEND_URL;
	if (backend && backend !== "https://api2.cursor.sh" && backend !== "https://api2.cursor.sh/") throw new AgentInputRejectedError("Remove the custom CURSOR_BACKEND_URL before using a managed Cursor account.");
}
export function cursorOptions(task: Task, cwd: string, apiKey: string, store: JsonlLocalAgentStore, connections: McpConnection[]): AgentOptions {
	const mcpServers: Record<string, McpServerConfig> = {};
	if (task.mode === "code") for (const connection of connections) if (connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === task.projectId)) mcpServers[nativeMcpName(connection)] = connection.transport === "stdio" ? { command: connection.executable, args: connection.arguments, cwd } : { url: connection.url };
	return { apiKey, model: { id: task.model === "default" ? "auto" : task.model }, name: `Phaseo ${task.id}`, mode: task.mode === "plan" ? "plan" : "agent", ...(task.mode === "chat" ? { tools: [] } : task.mode === "plan" ? { tools: ["read", "grep", "glob", "ls", "readLints", "semSearch", "webSearch", "webFetch", "readTodos", "updateTodos"] } : {}), mcpServers, local: { cwd, store, autoReview: true, enableAgentRetries: false, settingSources: task.mode === "code" ? ["project", "user", "team", "mdm", "plugins"] : [] } };
}
export class CursorAdapter implements AgentAdapter {
	private agent?: SDKAgent;
	private activeRun?: Run;
	private stopped = false;
	private readonly steering = new Set<Promise<void>>();
	constructor(private readonly directory: string, private readonly credential: (id: string) => string, private readonly connections: McpConnection[] = []) {}
	private async dispose(agent: SDKAgent | undefined, failed: boolean) {
		try { await agent?.[Symbol.asyncDispose](); } catch (error) { if (!failed) throw error; }
	}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = []) {
		let submitted = false; let hadText = false; let failed = false;
		try {
			assertCursorBackend(); if (!account || account.harness !== "cursor" || !account.configured || account.archived) throw new Error("Choose a connected Cursor account.");
			const apiKey = this.credential(account.id);
			if (task.mode === "code" && await callbacks.onApproval("Cursor native tools", "Allow Cursor to read and change files, run commands, use configured MCP servers and access the network for this turn? Cursor's SDK has no per-tool prompts; native policies and Auto-review apply.") !== "accept") throw new Error("Cursor native execution was declined. Choose Chat or Plan, or retry with approval.");
			if (this.stopped) throw new Error("Cursor task stopped.");
			const prompt = attachmentPrompt(task.nativeForkFrom && !task.nativeSessionId ? handoffPrompt({ ...task, handoffFrom: "cursor", nativeForkFrom: undefined }, text) : text, attachments);
			const options = cursorOptions(task, cwd, apiKey, new JsonlLocalAgentStore(path.join(this.directory, "native", "cursor", account.id)), this.connections);
			this.agent = task.nativeSessionId ? await Agent.resume(task.nativeSessionId, options) : await Agent.create(options);
			callbacks.onSession(this.agent.agentId); if (this.stopped) throw new Error("Cursor task stopped.");
			submitted = true;
			this.activeRun = await this.agent.send({ text: prompt, images: attachments.filter(value => value.kind === "image").map(value => ({ data: value.dataUrl!.split(",", 2)[1], mimeType: value.mimeType })) }, { model: options.model, mode: options.mode, mcpServers: options.mcpServers, onDelta: ({ update }) => { if (update.type === "text-delta") { hadText = true; callbacks.onDelta("cursor-response", update.text); } } });
			if (this.stopped) await this.activeRun.cancel();
			for await (const event of this.activeRun.stream()) {
				if (event.type === "thinking") callbacks.onActivity?.({ id: `${event.run_id}:thinking`, type: "reasoning", title: "Reasoning", text: event.text, append: true });
				if (event.type === "tool_call") callbacks.onActivity?.({ id: event.call_id, type: "tool", title: event.name, text: JSON.stringify({ args: event.args, result: event.result }).slice(0, 100000), status: event.status === "error" ? "failed" : event.status });
				if (event.type === "usage") callbacks.onActivity?.({ id: `${event.run_id}:usage`, type: "usage", title: "Token usage", text: JSON.stringify(event.usage) });
				if (event.type === "task") callbacks.onActivity?.({ id: `${event.run_id}:task`, type: "tool", title: "Native task", text: event.text ?? event.status ?? "" });
			}
			while (this.steering.size) await Promise.allSettled([...this.steering]);
			const result = await this.activeRun.wait(); if (!hadText && result.result) callbacks.onDelta("cursor-response", result.result);
			if (result.status !== "finished") throw new Error(result.error?.message ?? (result.status === "cancelled" ? "Cursor task cancelled." : "Cursor task failed."));
		} catch (error) { failed = true; if (!submitted) throw new AgentInputRejectedError(error instanceof Error ? error.message : "Cursor setup failed."); throw error; }
		finally {
			this.activeRun = undefined; const agent = this.agent; this.agent = undefined;
			await this.dispose(agent, failed);
		}
	}
	async steer(message: QueuedMessage, attachments: AttachmentContent[]) {
		if (this.stopped || !this.activeRun?.steer || this.activeRun.status !== "running") throw new AgentInputRejectedError("Cursor is not ready for steering. Queue this instruction instead.");
		if (attachments.some(value => value.kind === "image")) throw new AgentInputRejectedError("Cursor live steering accepts text documents. Queue images for the next turn.");
		const run = this.activeRun; const delivery = (async () => { if (await run.steer!(attachmentPrompt(message.text, attachments)) !== "complete_delivered") throw new AgentInputRejectedError("Cursor did not append this instruction. Queue it for the next turn."); })(); this.steering.add(delivery);
		try { await delivery; } finally { this.steering.delete(delivery); }
	}
	async cancel() { this.stopped = true; this.agent?.close(); await this.activeRun?.cancel(); }
}

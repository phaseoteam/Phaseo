import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Account, Task } from "../shared/workspace";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { resolveNativeCommand } from "./nativeProcess";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import { waitClaudeMcp } from "./claudeMcp";
import { AgentInputRejectedError } from "./agentAdapter";
import { respondMcpElicitation } from "./mcpElicitation";

export class ClaudeAdapter implements AgentAdapter {
	private controller = new AbortController();
	constructor(private readonly mcp: McpConnection[] = []) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = []): Promise<void> {
		const command = await resolveNativeCommand("claude");
		const images = attachments.filter(attachment => attachment.kind === "image");
		const content: SDKUserMessage["message"]["content"] = [{ type: "text", text: attachmentPrompt(text, attachments) }, ...images.map(attachment => ({ type: "image" as const, source: { type: "base64" as const, media_type: attachment.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: attachment.dataUrl!.split(",")[1] } }))];
		const managedMcp = task.mode === "chat" ? [] : this.mcp; let promptAllowed = !managedMcp.length; let releasePrompt!: () => void;
		const gate = managedMcp.length ? new Promise<void>(resolve => { releasePrompt = resolve; }) : Promise.resolve(); const signal = this.controller.signal;
		async function* prompt(): AsyncGenerator<SDKUserMessage> { await gate; if (promptAllowed && !signal.aborted) yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: "" }; }
		const execution = query({ prompt: images.length || managedMcp.length ? prompt() : attachmentPrompt(text, attachments), options: {
			cwd,
			mcpServers: Object.fromEntries(managedMcp.map(server => [nativeMcpName(server), server.transport === "stdio" ? { command: server.executable, args: server.arguments, env: { ELECTRON_RUN_AS_NODE: "1" } } : { type: "http" as const, url: server.url }])),
			...(task.mode === "chat" ? { strictMcpConfig: true } : {}),
			...(account?.configDirectory ? { env: { ...process.env, ...nativeAccountEnvironment(account) } } : {}),
			pathToClaudeCodeExecutable: command.executable,
			abortController: this.controller,
			...(task.model === "default" ? {} : { model: task.model }),
			...(task.nativeSessionId ? { resume: task.nativeSessionId } : task.nativeForkFrom ? { resume: task.nativeForkFrom, forkSession: true } : {}),
			permissionMode: task.mode === "plan" ? "plan" : "default",
			...(task.mode === "chat" ? { tools: [] } : {}),
			includePartialMessages: true,
			onElicitation: (request, options) => task.mode === "chat" ? Promise.resolve({ action: "decline" as const }) : respondMcpElicitation(request, callbacks, options.signal),
			settingSources: ["user", "project", "local"],
			canUseTool: async (toolName, input) => {
				if (task.mode === "chat") return { behavior: "deny", message: "Tools are unavailable in Chat mode." };
				if (toolName === "AskUserQuestion" && callbacks.onQuestion && Array.isArray(input.questions)) {
					const questions = input.questions as { question: string; header: string; multiSelect?: boolean; options?: { label: string; description?: string }[] }[];
					const answers = await callbacks.onQuestion(questions.map((question, index) => ({ ...question, id: String(index), isOther: true })));
					if (this.controller.signal.aborted) return { behavior: "deny", message: "Task stopped." };
					return { behavior: "allow", updatedInput: { ...input, answers: Object.fromEntries(questions.map((question, index) => [question.question, (answers[String(index)] ?? []).join(", ")])) } };
				}
				const decision = await callbacks.onApproval(toolName, JSON.stringify(input, null, 2));
				return decision === "accept" ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: "The user declined this action." };
			},
		} });
		let completed = false;
		let messageId = "assistant";
		const streamed = new Set<string>();
		try {
			if (managedMcp.length) { try { await waitClaudeMcp(execution, managedMcp, signal); } catch (error) { throw new AgentInputRejectedError(error instanceof Error ? error.message : "MCP setup failed.", { cause: error }); } promptAllowed = true; releasePrompt(); }
			for await (const message of execution) {
				if ("session_id" in message && message.session_id) callbacks.onSession(message.session_id);
				if (message.type === "stream_event" && !message.parent_tool_use_id) {
					if (message.event.type === "message_start") messageId = message.event.message.id;
					if (message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") {
						streamed.add(messageId); callbacks.onDelta(messageId, message.event.delta.text);
					}
					if (message.event.type === "content_block_delta" && message.event.delta.type === "thinking_delta") callbacks.onActivity?.({ id: `${messageId}:reasoning`, type: "reasoning", title: "Reasoning", text: message.event.delta.thinking, append: true });
				}
				if (message.type === "assistant") for (const block of message.message.content) {
					if (block.type === "tool_use") callbacks.onActivity?.({ id: block.id, type: "tool", title: block.name, text: JSON.stringify(block.input, null, 2), status: "running" });
					if (block.type === "thinking") callbacks.onActivity?.({ id: `${message.message.id}:reasoning`, type: "reasoning", title: "Reasoning", text: block.thinking, status: "completed" });
				}
				if (message.type === "user" && Array.isArray(message.message.content)) for (const block of message.message.content) {
					if (block.type === "tool_result") callbacks.onActivity?.({ id: block.tool_use_id, type: "tool", title: "Tool result", text: typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2), status: block.is_error ? "failed" : "completed" });
				}
				if (message.type === "assistant" && !message.parent_tool_use_id && !streamed.has(message.message.id)) {
					for (const block of message.message.content) if (block.type === "text") callbacks.onDelta(message.message.id, block.text);
				}
				if (message.type === "result") {
					if (message.subtype !== "success") throw new Error(message.errors.join("\n"));
					if (message.is_error) throw new Error(message.result);
					completed = true;
				}
			}
			if (!completed) throw new Error("Claude stopped before completing the turn.");
		} finally { execution.close(); releasePrompt?.(); }
	}
	async cancel() { this.controller.abort(); }
}

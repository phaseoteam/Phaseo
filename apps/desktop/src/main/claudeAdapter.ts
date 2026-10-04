import { parsePlanSteps, type PlanStep } from "../shared/planSteps";
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
		const manualCompact = !attachments.length && text.trim() === "/compact";
		if (manualCompact) text = "/compact";
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
		const todos = new Map<string, { steps: PlanStep[]; text: string }>();
		let sessionId = task.nativeSessionId;
		let compaction: { id: string; title: string } | undefined;
		let compactBoundary = false; let compactFailed = false; let compactFailure: string | undefined;
		const compactOutput: string[] = []; let compactCommandOutput: string | undefined;
		const compactEvents = new Set<string>();
		try {
			if (managedMcp.length) { try { await waitClaudeMcp(execution, managedMcp, signal); } catch (error) { throw new AgentInputRejectedError(error instanceof Error ? error.message : "MCP setup failed.", { cause: error }); } promptAllowed = true; releasePrompt(); }
			for await (const message of execution) {
				const compactEvent = message.type === "system" && (message.subtype === "compact_boundary" || message.subtype === "status");
				if ((compactEvent || manualCompact) && "session_id" in message && sessionId && message.session_id !== sessionId) continue;
				if ("session_id" in message && message.session_id) {
					if (!sessionId || (message.type === "system" && message.subtype === "init")) sessionId = message.session_id;
					callbacks.onSession(message.session_id);
				}
				if (manualCompact && message.type === "system" && message.subtype === "local_command_output") compactCommandOutput = message.content;
				if (compactEvent) {
					if (compactEvents.has(message.uuid)) continue;
					compactEvents.add(message.uuid);
					if (message.subtype === "status" && message.status === "compacting" && !compaction) {
						compaction = { id: `compaction:${message.uuid}`, title: "Context compaction" };
						callbacks.onActivity?.({ ...compaction, type: "compaction", text: "", status: "running" });
					}
					if (message.subtype === "status" && message.compact_result === "failed") {
						callbacks.onActivity?.({ ...(compaction ?? { id: `compaction:${message.uuid}`, title: "Context compaction" }), type: "compaction", text: message.compact_error ?? "Native compaction failed.", status: "failed" });
						compaction = undefined; compactFailed = true; compactFailure = message.compact_error;
					}
					if (message.subtype === "compact_boundary") {
						compactBoundary = true;
						const metadata = message.compact_metadata;
						const compactionInfo = Number.isSafeInteger(metadata.pre_tokens) && metadata.pre_tokens >= 0 ? { beforeTokens: metadata.pre_tokens, ...(Number.isSafeInteger(metadata.post_tokens) && metadata.post_tokens! >= 0 ? { afterTokens: metadata.post_tokens } : {}), ...(Number.isFinite(metadata.duration_ms) && metadata.duration_ms! >= 0 ? { durationMs: metadata.duration_ms } : {}) } : undefined;
						callbacks.onActivity?.({ id: compaction?.id ?? `compaction:${message.uuid}`, type: "compaction", title: message.compact_metadata.trigger === "auto" ? "Automatic context compaction" : "Context compaction", text: JSON.stringify(message.compact_metadata, null, 2), status: "completed", compaction: compactionInfo });
						compaction = undefined;
					}
				}
				if (message.type === "stream_event" && !message.parent_tool_use_id) {
					if (message.event.type === "message_start") messageId = message.event.message.id;
					if (message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") {
						streamed.add(messageId); if (manualCompact) compactOutput.push(message.event.delta.text); callbacks.onDelta(messageId, message.event.delta.text);
					}
					if (message.event.type === "content_block_delta" && message.event.delta.type === "thinking_delta") callbacks.onActivity?.({ id: `${messageId}:reasoning`, type: "reasoning", title: "Reasoning", text: message.event.delta.thinking, append: true });
				}
				if (message.type === "assistant") for (const block of message.message.content) {
					if (block.type === "tool_use") callbacks.onActivity?.({ id: block.id, type: "tool", title: block.name, text: JSON.stringify(block.input, null, 2), status: "running" });
					if (block.type === "tool_use" && block.name === "TodoWrite" && !message.parent_tool_use_id) {
						const steps = parsePlanSteps((block.input as { todos?: unknown } | null)?.todos, "claude");
						if (steps) todos.set(block.id, { steps, text: JSON.stringify(block.input, null, 2) });
					}
					if (block.type === "thinking") callbacks.onActivity?.({ id: `${message.message.id}:reasoning`, type: "reasoning", title: "Reasoning", text: block.thinking, status: "completed" });
				}
				if (message.type === "user" && Array.isArray(message.message.content)) for (const block of message.message.content) {
					if (block.type === "tool_result") callbacks.onActivity?.({ id: block.tool_use_id, type: "tool", title: "Tool result", text: typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2), status: block.is_error ? "failed" : "completed" });
					if (block.type === "tool_result" && !message.parent_tool_use_id) {
						const plan = todos.get(block.tool_use_id); todos.delete(block.tool_use_id);
						if (plan && !block.is_error) callbacks.onActivity?.({ id: "todo-plan", type: "plan", title: "Task progress", ...plan });
					}
				}
				if (message.type === "assistant" && !message.parent_tool_use_id && !streamed.has(message.message.id)) {
					for (const block of message.message.content) if (block.type === "text") { if (manualCompact) compactOutput.push(block.text); callbacks.onDelta(message.message.id, block.text); }
				}
				if (message.type === "result") {
					if (message.subtype !== "success") throw new Error(message.errors.join("\n"));
					if (message.is_error) throw new Error(message.result);
					if (manualCompact && compactFailed && !compactBoundary) throw new Error(compactFailure ?? "Native compaction failed.");
					if (manualCompact && !compactBoundary && !compactFailed) {
						callbacks.onActivity?.({ id: compaction?.id ?? `compaction-result:${message.uuid}`, type: "compaction", title: "Compaction result", text: message.result || compactCommandOutput || compactOutput.join("") || "The native command finished without confirming a compaction boundary.", status: "completed" });
						compaction = undefined;
					}
					completed = true;
				}
			}
			if (!completed) throw new Error("Claude stopped before completing the turn.");
		} finally {
			execution.close(); releasePrompt?.();
			if (compaction) callbacks.onActivity?.({ ...compaction, type: "compaction", title: "Compaction completion unconfirmed", text: "The native stream ended without confirming compaction completion.", status: "failed" });
		}
	}
	async cancel() { this.controller.abort(); }
}

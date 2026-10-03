import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Account, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { resolveNativeCommand } from "./nativeProcess";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";

export class ClaudeAdapter implements AgentAdapter {
	private controller = new AbortController();
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = []): Promise<void> {
		const command = await resolveNativeCommand("claude");
		const images = attachments.filter(attachment => attachment.kind === "image");
		const content: SDKUserMessage["message"]["content"] = [{ type: "text", text: attachmentPrompt(text, attachments) }, ...images.map(attachment => ({ type: "image" as const, source: { type: "base64" as const, media_type: attachment.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: attachment.dataUrl!.split(",")[1] } }))];
		async function* prompt(): AsyncGenerator<SDKUserMessage> { yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: "" }; }
		const execution = query({ prompt: images.length ? prompt() : attachmentPrompt(text, attachments), options: {
			cwd,
			...(account?.configDirectory ? { env: { ...process.env, CLAUDE_CONFIG_DIR: account.configDirectory, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, ANTHROPIC_BASE_URL: undefined } } : {}),
			pathToClaudeCodeExecutable: command.executable,
			abortController: this.controller,
			...(task.model === "default" ? {} : { model: task.model }),
			...(task.nativeSessionId ? { resume: task.nativeSessionId } : task.nativeForkFrom ? { resume: task.nativeForkFrom, forkSession: true } : {}),
			permissionMode: task.mode === "plan" ? "plan" : "default",
			...(task.mode === "chat" ? { tools: [] } : {}),
			includePartialMessages: true,
			settingSources: ["user", "project", "local"],
			canUseTool: async (toolName, input) => {
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
		} finally { execution.close(); }
	}
	async cancel() { this.controller.abort(); }
}

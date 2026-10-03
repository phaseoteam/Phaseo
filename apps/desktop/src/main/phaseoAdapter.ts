import type { Account, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";

/** Compatible inference transport. Tool execution is added through the harness tool layer. */
export class PhaseoAdapter implements AgentAdapter {
	private controller = new AbortController();
	constructor(private readonly credential: (id: string) => string, private readonly fetcher: typeof fetch = fetch) {}
	async run(task: Task, _cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = []): Promise<void> {
		if (!account || account.kind !== "api" || !account.endpoint) throw new Error("Connect an API account to use the Phaseo harness.");
		if (task.mode === "code") throw new Error("Use the Phaseo Agent SDK adapter for coding tasks.");
		if (task.model === "default") throw new Error("Select a model for this API account.");
		const endpoint = `${account.endpoint.replace(/\/$/, "")}/chat/completions`;
		const messages: { role: string; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }[] = task.messages.filter(message => message.role === "user" || message.role === "assistant").map(message => {
			const files = attachments.filter(attachment => message.attachments?.some(value => value.id === attachment.id));
			const images = files.filter(attachment => attachment.kind === "image");
			const content = attachmentPrompt(message.text, files);
			return { role: message.role, content: images.length ? [{ type: "text" as const, text: content }, ...images.map(attachment => ({ type: "image_url" as const, image_url: { url: attachment.dataUrl! } }))] : content };
		});
		// The runtime normally persists the user message before execution.
		if (task.messages.at(-1)?.role !== "user" || task.messages.at(-1)?.text !== text) messages.push({ role: "user", content: text });
		const response = await this.fetcher(endpoint, {
			method: "POST", signal: this.controller.signal, redirect: "error",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.credential(account.id)}` },
			body: JSON.stringify({ model: task.model, messages, stream: true }),
		});
		if (!response.ok) throw new Error(`The model provider returned HTTP ${response.status}.`);
		if (!response.body) throw new Error("The provider returned no response stream.");
		const reader = response.body.getReader(); const decoder = new TextDecoder();
		let buffer = ""; let finished = false;
		const consume = (block: string) => {
			const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
			if (!data) return;
			if (data === "[DONE]") { finished = true; return; }
			const packet = JSON.parse(data) as { error?: unknown; choices?: { delta?: { content?: string }; finish_reason?: string }[] };
			if (packet.error) throw new Error("The model provider reported an inference error.");
			for (const choice of packet.choices ?? []) {
				if (typeof choice.delta?.content === "string") callbacks.onDelta("assistant", choice.delta.content);
				if (choice.finish_reason) finished = true;
			}
		};
		try {
			while (true) {
				const { done, value } = await reader.read();
				buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
				if (buffer.length > 8 * 1024 * 1024) throw new Error("The provider stream exceeded the packet size limit.");
				let match: RegExpExecArray | null;
				while ((match = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length); }
				if (done) { if (buffer.trim()) consume(buffer); break; }
			}
			if (!finished) throw new Error("The provider stream ended before completion.");
		} finally { await reader.cancel(); reader.releaseLock(); }
	}
	async cancel() { this.controller.abort(); }
}

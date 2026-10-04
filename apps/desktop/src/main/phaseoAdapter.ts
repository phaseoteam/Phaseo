import path from "node:path";
import { readChatCompletion } from "./chatCompletionStream";
import { PhaseoSkills } from "./phaseoSkills";
import type { NativeAction } from "../shared/nativeActions";
import type { Account, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { ProjectInstructions } from "./projectInstructions";
import { AgentInputRejectedError } from "./agentAdapter";
import type { WorkspaceStore } from "./workspaceStore";
import { runPhaseoChat } from "./phaseoChatRun";

/** Compatible Chat inference, with durable skill execution when a run store is supplied. */
export class PhaseoAdapter implements AgentAdapter {
	private controller = new AbortController();
	constructor(private readonly credential: (id: string) => string | Promise<string>, private readonly fetcher: typeof fetch = fetch, private readonly globalInstructionsRoot?: string, private readonly store?: Pick<WorkspaceStore, "loadAgentRun" | "saveAgentRun">) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account?: Account, attachments: AttachmentContent[] = [], nativeAction?: NativeAction): Promise<void> {
		if (!account || account.kind !== "api" || !account.endpoint) throw new Error("Connect an API account to use the Phaseo harness.");
		if (task.mode === "code") throw new Error("Use the Phaseo Agent SDK adapter for coding tasks.");
		if (task.model === "default") throw new Error("Select a model for this API account.");
		if (this.store) return runPhaseoChat(task, cwd, text, callbacks, account, attachments, nativeAction, { store: this.store, globalRoot: this.globalInstructionsRoot, fetcher: this.fetcher, credential: this.credential, signal: this.controller.signal });
		const skills = this.globalInstructionsRoot ? new PhaseoSkills(path.dirname(this.globalInstructionsRoot), task.projectId ? cwd : undefined) : undefined;
		if (nativeAction && !skills) throw new AgentInputRejectedError("Phaseo skill storage is unavailable.");
		const approvedSkill = nativeAction ? await skills!.approve(nativeAction, callbacks, this.controller.signal) : undefined;
		if (approvedSkill) callbacks.onActivity?.({ id: "selected-skill", type: "tool", title: "Skill activated", text: approvedSkill.name, status: "completed" });
		const selectedSkill = approvedSkill ? skills!.instructionReader(approvedSkill, this.controller.signal) : undefined;
		let projectInstructions = "";
		{
			const instructions = new ProjectInstructions(cwd, undefined, this.globalInstructionsRoot, selectedSkill);
			try { if (task.projectId) await instructions.load(".", true); else await instructions.loadGlobal(); } catch (error) { throw new AgentInputRejectedError(`Project instructions were not loaded; your input was not submitted. ${error instanceof Error ? error.message : "Check AGENTS.md."}`, { cause: error }); }
			if (instructions.list().length) {
				projectInstructions = `Apply global guidance everywhere; project guidance takes precedence within its scope. Tools remain unavailable.\n${JSON.stringify(instructions.list())}`;
				callbacks.onActivity?.({ id: "project-instructions", type: "tool", title: "Project instructions", text: `Loaded ${instructions.list().map(file => file.path).join(", ")}`, status: "completed" });
			}
		}
		const endpoint = `${account.endpoint.replace(/\/$/, "")}/chat/completions`;
		const messages: { role: string; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }[] = task.messages.filter(message => message.role === "user" || message.role === "assistant").map(message => {
			const files = attachments.filter(attachment => message.attachments?.some(value => value.id === attachment.id));
			const images = files.filter(attachment => attachment.kind === "image");
			const content = attachmentPrompt(nativeAction && message === task.messages.at(-1) && message.role === "user" ? nativeAction.arguments : message.text, files);
			return { role: message.role, content: images.length ? [{ type: "text" as const, text: content }, ...images.map(attachment => ({ type: "image_url" as const, image_url: { url: attachment.dataUrl! } }))] : content };
		});
		// The runtime normally persists the user message before execution.
		if (task.messages.at(-1)?.role !== "user" || task.messages.at(-1)?.text !== text) messages.push({ role: "user", content: nativeAction ? nativeAction.arguments : text });
		if (projectInstructions) messages.unshift({ role: "system", content: projectInstructions });
		const response = await this.fetcher(endpoint, {
			method: "POST", signal: this.controller.signal, redirect: "error",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.credential(account.id)}` },
			body: JSON.stringify({ model: task.model, messages, stream: true }),
		});
		if (!response.ok) throw new Error(`The model provider returned HTTP ${response.status}.`);
		const completion = await readChatCompletion(response, delta => callbacks.onDelta("assistant", delta));
		if (completion.calls.length) throw new Error("The provider requested tools that are unavailable in this Chat transport.");
	}
	async cancel() { this.controller.abort(); }
}

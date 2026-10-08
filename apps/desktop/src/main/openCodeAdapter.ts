import { OpenCodeCommandOutput } from "./openCodeCommandOutput";
import { openCodeNativeActions } from "./openCodeNativeActions";
import type { NativeAction } from "../shared/nativeActions";
import { OpenCode, isConflictError, isForbiddenError, isInvalidRequestError, isSessionNotFoundError, isUnauthorizedError, isFormAlreadySettledError, isFormInvalidAnswerError, isFormNotFoundError, isCommandNotFoundError, isSkillNotFoundError } from "@opencode/client";
import type { OpenCodeClient } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { pathToFileURL } from "node:url";
import type { Account, QueuedMessage, Task } from "../shared/workspace";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import type { AgentForm } from "../shared/agentForms";
import type { Endpoint } from "@opencode/client/service";
import { openCodeForm } from "./openCodeForms";
import { AgentInputRejectedError } from "./agentAdapter";
import type { McpConnection } from "../shared/mcp";
import { OpenCodeMcp } from "./openCodeMcp";

export class OpenCodeAdapter implements AgentAdapter {
	private controller = new AbortController();
	private client?: OpenCodeClient;
	private sessionId?: string;
	private acceptingInput = false;
	private inputGeneration = 0;
	private readonly inputs = new Set<Promise<unknown>>();
	constructor(private readonly connect?: (signal: AbortSignal) => Promise<Endpoint>, private readonly mcp: McpConnection[] = [], private readonly mcpManager = new OpenCodeMcp()) {}
	async run(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, _account?: Account, attachments: AttachmentContent[] = [], nativeAction?: NativeAction): Promise<void> {
		const endpoint = this.connect ? await this.connect(this.controller.signal) : await Service.discover({ version: version => version.startsWith("2.") });
		if (!endpoint) throw new Error("Start an OpenCode 2 service before using this harness. OpenCode 1 is not supported by this adapter.");
		if (this.controller.signal.aborted) throw new Error("Task stopped.");
		const client = this.client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
		const model = task.model === "default" ? undefined : (() => {
			const separator = task.model.indexOf("/");
			if (separator < 1) throw new Error("Use provider/model for an OpenCode model.");
			return { providerID: task.model.slice(0, separator), id: task.model.slice(separator + 1) };
		})();
		const requestOptions = { signal: this.controller.signal };
		const confirmAction = async () => {
			if (!nativeAction) return;
			try { const catalog = await openCodeNativeActions(client, cwd, AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)])); if (!catalog.actions.some(action => action.kind === nativeAction.kind && action.id === nativeAction.id && action.name === nativeAction.name)) throw new Error("This native action is no longer available in this project."); }
			catch (error) { throw new AgentInputRejectedError("Native action was not submitted. " + (error instanceof Error ? error.message : "Check the native catalog."), { cause: error }); }
		};
		await confirmAction();
		if (nativeAction?.kind === "command") {
			if (await callbacks.onApproval("OpenCode command · " + nativeAction.name, "Run this registered native command? Its template can run shell code or change the native agent/model.\n\n" + nativeAction.arguments) !== "accept") throw new AgentInputRejectedError("Native command declined; your input was not submitted.");
			if (this.controller.signal.aborted) throw new AgentInputRejectedError("Native command cancelled before submission.");
			await confirmAction();
		}
		if (task.mode !== "chat") { try { await this.mcpManager.synchronize(client, endpoint.url, cwd, task.projectId, this.mcp, this.controller.signal); } catch (error) { throw new AgentInputRejectedError(error instanceof Error ? error.message : "MCP setup failed.", { cause: error }); } }
		const forms = new Map<string, AbortController>(); const seenForms = new Set<string>();
		const formJobs = new Map<string, Promise<void>>();
		const handleForm = async (form: AgentForm) => {
			if (seenForms.has(form.id)) return; seenForms.add(form.id);
			const controller = new AbortController(); forms.set(form.id, controller);
			const signal = AbortSignal.any([this.controller.signal, controller.signal]);
			let validationError: string | undefined;
			try {
				while (!signal.aborted) {
					const answer = await callbacks.onForm?.({ id: form.id, title: form.title, fields: form.fields, error: validationError }, signal) ?? null;
					if (signal.aborted) return;
					try {
						if (answer === null) await client.session.form.cancel({ sessionID: this.sessionId!, formID: form.id, message: "Cancelled in Phaseo." }, { signal });
						else await client.session.form.reply({ sessionID: this.sessionId!, formID: form.id, answer }, { signal });
						return;
					} catch (error) {
						if (isFormAlreadySettledError(error) || isFormNotFoundError(error) || signal.aborted) return;
						if (!isFormInvalidAnswerError(error)) throw error;
						validationError = error.message;
						callbacks.onActivity?.({ id: `form:${form.id}:validation`, type: "tool", title: form.title, text: error.message, status: "failed" });
					}
				}
			} finally { forms.delete(form.id); }
		};
		const requestForm = (form: AgentForm) => {
			const existing = formJobs.get(form.id); if (existing) return existing;
			const job = handleForm(form); formJobs.set(form.id, job); return job;
		};
		const session = task.nativeSessionId ? await client.session.get({ sessionID: task.nativeSessionId }, requestOptions) : task.nativeForkFrom ? await client.session.fork({ sessionID: task.nativeForkFrom }, requestOptions) : await client.session.create({
			location: { directory: cwd }, agent: task.mode === "plan" ? "plan" : "build", model,
			permissions: [{ action: "*", resource: "*", effect: task.mode === "chat" ? "deny" : "ask" }],
		}, requestOptions);
		this.sessionId = session.id; callbacks.onSession(session.id);
		if (task.nativeSessionId || task.nativeForkFrom) {
			await client.session.switchAgent({ sessionID: session.id, agent: task.mode === "plan" ? "plan" : "build" }, requestOptions);
			await client.session.update({ sessionID: session.id, permissions: [{ action: "*", resource: "*", effect: task.mode === "chat" ? "deny" : "ask" }] }, requestOptions);
			if (model) await client.session.switchModel({ sessionID: session.id, model }, requestOptions);
		}
		let readyResolve: () => void = () => {};
		const ready = new Promise<void>(resolve => { readyResolve = resolve; });
		let resolveTurn: () => void = () => {};
		let rejectTurn: (error: Error) => void = () => {};
		const turn = new Promise<void>((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
		void turn.catch(() => {});
		let prompted = false;
		let compaction: { id: string; title: string } | undefined;
		const compactionEvents = new Set<string>();
		let completion: Promise<void> | undefined;
		const commandOutput = nativeAction?.kind === "command" ? new OpenCodeCommandOutput(client, session.id, this.controller.signal, callbacks.onDelta) : undefined;
		try { await commandOutput?.start(); } catch (error) { throw new AgentInputRejectedError("Native command was not submitted because its output history could not be checked.", { cause: error }); }
		const settle = async () => {
			while (!this.controller.signal.aborted) {
				const generation = this.inputGeneration;
				const pendingInputs = this.inputs.size > 0;
				await client.session.wait({ sessionID: session.id }, requestOptions);
				await Promise.allSettled([...this.inputs]);
				if (!pendingInputs && generation === this.inputGeneration && !this.inputs.size) { this.acceptingInput = false; await commandOutput?.finish(); resolveTurn(); return; }
			}
		};
		const timeout = setTimeout(() => { rejectTurn(new Error("OpenCode event stream did not connect.")); this.controller.abort(); }, 30000);
		const events = (async () => {
			try {
				for await (const event of client.event.subscribe({ signal: this.controller.signal, onActivity: () => { readyResolve(); clearTimeout(timeout); } })) {
					if (event.type === "form.created" && event.data.form.sessionID === session.id) {
						void requestForm(event.data.form).catch(error => rejectTurn(error instanceof Error ? error : new Error("OpenCode form failed."))); continue;
					}
					if ((event.type === "form.replied" || event.type === "form.cancelled") && event.data.sessionID === session.id) { seenForms.add(event.data.id); forms.get(event.data.id)?.abort(); continue; }
					if (!("data" in event) || !("sessionID" in event.data) || event.data.sessionID !== session.id) continue;
					if (event.type === "session.compaction.started" || event.type === "session.compaction.ended" || event.type === "session.compaction.failed") {
						if (compactionEvents.has(event.id)) continue;
						compactionEvents.add(event.id);
						const activity = event.type !== "session.compaction.started" && compaction ? compaction : { id: `compaction:${event.id}`, title: event.data.reason === "auto" ? "Automatic context compaction" : "Context compaction" };
						if (event.type === "session.compaction.started") {
							if (compaction) callbacks.onActivity?.({ ...compaction, type: "compaction", title: "Compaction completion unconfirmed", text: "Another native compaction started without confirming this one's completion.", status: "failed" });
							compaction = activity;
							callbacks.onActivity?.({ ...activity, type: "compaction", text: "", status: "running" });
						} else {
							callbacks.onActivity?.({ ...activity, type: "compaction", text: event.type === "session.compaction.ended" ? event.data.text : JSON.stringify(event.data.error, null, 2), status: event.type === "session.compaction.ended" ? "completed" : "failed" });
							compaction = undefined;
						}
					}
					if (event.type === "session.text.delta") { if (commandOutput) commandOutput.stream(event.data.assistantMessageID, event.data.delta); else callbacks.onDelta(event.data.assistantMessageID, event.data.delta); }
					if (event.type === "session.reasoning.delta") callbacks.onActivity?.({ id: `${event.data.assistantMessageID}:reasoning:${event.data.ordinal}`, type: "reasoning", title: "Reasoning", text: event.data.delta, append: true });
					if (event.type === "session.tool.input.started") callbacks.onActivity?.({ id: event.data.id, type: "tool", title: event.data.name, text: "", status: "running" });
					if (event.type === "session.tool.called") callbacks.onActivity?.({ id: event.data.id, type: "tool", title: "Tool call", text: JSON.stringify(event.data.input, null, 2), status: "running" });
					if (event.type === "session.tool.success" || event.type === "session.tool.failed") callbacks.onActivity?.({ id: event.data.id, type: "tool", title: "Tool result", text: JSON.stringify(event.type === "session.tool.failed" ? event.data.error : event.data.content, null, 2), status: event.type === "session.tool.failed" ? "failed" : "completed" });
					if (event.type === "permission.asked") {
						const permission = event.data;
						void (async () => {
							const decision = task.mode === "chat" ? "decline" : await callbacks.onApproval(permission.action, permission.message ?? permission.resources.join("\n"));
							if (!this.controller.signal.aborted) await client.permission.reply({ sessionID: session.id, requestID: permission.id, decision: decision === "accept" ? "once" : "reject" }, requestOptions);
						})().catch(error => rejectTurn(error instanceof Error ? error : new Error("OpenCode permission reply failed.")));
					}
					if (prompted && event.type === "session.execution.succeeded") {
						// The session may have accepted another input before this event arrived.
						// Keep consuming permissions/forms while the native service settles.
						completion ??= settle().catch(rejectTurn); continue;
					}
					if (prompted && (event.type === "session.execution.failed" || event.type === "session.execution.interrupted")) { rejectTurn(new Error(`OpenCode execution ${event.type.endsWith("failed") ? "failed" : "was interrupted"}.`)); return; }
				}
				if (completion) await completion;
				else rejectTurn(new Error("OpenCode event stream disconnected."));
			} catch (error) { rejectTurn(error instanceof Error ? error : new Error("OpenCode event stream failed.")); }
		})();
		try {
			await Promise.race([ready, turn]);
			if (task.nativeSessionId) {
				const pending = await client.session.form.list({ sessionID: session.id }, requestOptions);
				await Promise.race([Promise.all(pending.filter(form => form.sessionID === session.id).map(form => requestForm(openCodeForm(form)))), turn]);
			}
			prompted = true;
			this.acceptingInput = true;
			if (nativeAction) {
				try {
					if (nativeAction.kind === "command") {
						await client.session.command({ sessionID: session.id, name: nativeAction.id, text: attachmentPrompt(nativeAction.arguments, attachments), files: attachments.filter(file => file.kind === "image").map(file => ({ uri: pathToFileURL(file.filePath).href, name: file.name })), delivery: "queue" }, requestOptions);
						// Some registered commands only change state and emit no execution event.
						completion ??= settle().catch(rejectTurn);
					} else {
						await client.session.skill({ sessionID: session.id, id: nativeAction.id, resume: false }, requestOptions);
						await client.session.prompt({ sessionID: session.id, text: attachmentPrompt(nativeAction.arguments || `Use the activated skill ${nativeAction.name} for this task.`, attachments), files: attachments.filter(file => file.kind === "image").map(file => ({ uri: pathToFileURL(file.filePath).href, name: file.name })) }, requestOptions);
					}
				} catch (error) { if (isCommandNotFoundError(error) || isSkillNotFoundError(error)) throw new AgentInputRejectedError("Native action was not submitted because it is no longer available.", { cause: error }); throw error; }
			} else if (!attachments.length && text.trim() === "/compact") await client.session.compact({ sessionID: session.id }, requestOptions);
			else await client.session.prompt({ sessionID: session.id, text: attachmentPrompt(text, attachments), files: attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ uri: pathToFileURL(attachment.filePath).href, name: attachment.name })) }, requestOptions);
			await turn;
		} finally {
			this.acceptingInput = false; clearTimeout(timeout); this.controller.abort(); await events;
			if (compaction) callbacks.onActivity?.({ ...compaction, type: "compaction", title: "Compaction completion unconfirmed", text: "The native stream ended without confirming compaction completion.", status: "failed" });
		}
	}
	async steer(message: QueuedMessage, attachments: AttachmentContent[]) {
		if (!this.acceptingInput || this.controller.signal.aborted || !this.client || !this.sessionId) throw new AgentInputRejectedError("OpenCode is not ready for steering. Queue this message instead.");
		this.inputGeneration++;
		const delivery = this.client.session.prompt({ sessionID: this.sessionId, id: `msg_phaseo${message.id.replaceAll("-", "")}`, delivery: "steer", text: attachmentPrompt(message.text, attachments), files: attachments.filter(attachment => attachment.kind === "image").map(attachment => ({ uri: pathToFileURL(attachment.filePath).href, name: attachment.name })) }, { signal: this.controller.signal });
		this.inputs.add(delivery);
		try { await delivery; }
		catch (error) {
			if (isInvalidRequestError(error) || isSessionNotFoundError(error) || isUnauthorizedError(error) || isForbiddenError(error) || isConflictError(error)) throw new AgentInputRejectedError(error.message, { cause: error });
			throw error;
		} finally { this.inputs.delete(delivery); }
	}
	async cancel() {
		this.controller.abort();
		if (this.client && this.sessionId) await this.client.session.interrupt({ sessionID: this.sessionId }, { signal: AbortSignal.timeout(5000) });
	}
}

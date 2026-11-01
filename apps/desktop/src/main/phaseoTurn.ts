import { createAgent, defineTool } from "@phaseo/agent-sdk";
import type { AgentEvent, AgentMessage, AgentModelClient, AgentPendingToolCall, AgentRunResult, AgentTool, AgentToolCall } from "@phaseo/agent-sdk";
import type { AgentCallbacks } from "./agentAdapter";
import type { ModelFacts, Task } from "../shared/workspace";
import type { WorkspaceStore } from "./workspaceStore";
import { publishPhaseoPlan } from "./phaseoPlanTools";
import { span } from "./diagnostics/tracer";

/** Steps one turn may take before it pauses; sending another message carries on from there. */
export const phaseoTurnStepLimit = 100;
/** About 10k tokens: the most of one tool's output the model sees, as Codex allows. */
export const phaseoToolOutputLimit = 40_000;
const activityTextLimit = 20_000;
/** Compaction starts when the history is estimated to fill this share of the model's context window. */
const compactAt = 0.8;
const fallbackContextTokens = 128_000;
/** The tool calls a turn can make without being offered every orchestration tool on every request. */
// draft_issue exists only in triage chats, where drafting the issue is the job, so it is never behind load_tools.
export const coreThreadToolIds = ["list_agents", "delegate_task", "wait_thread", "list_threads", "read_thread", "draft_issue"];
export const phaseoToolsets: Record<string, { description: string; match: (id: string) => boolean }> = {
	threads: { description: "manage chats: search, send, steer, fork, hand off, rename, queue, change their model or settings, merge, interrupt, organise, answer their questions, move this chat to a worktree, launch separate chats, list, add and clone projects, list models", match: id => /^(handoff|rename|steer|read|edit|fork|send|merge|interrupt|organize)_thread(_queue|_context)?$|^launch_threads?$|^list_(projects|models)$|^(add|clone)_project$|^edit_thread_queue$|^read_thread_queue$|^read_pending_questions$|^answer_question$|^move_to_worktree$|^configure_thread$|^search_threads$/.test(id) },
	pull_requests: { description: "link, watch and review pull requests", match: id => /pull_request/.test(id) },
	issues: { description: "link, read and watch GitHub issues", match: id => /(^|_)issues?(_|$)/.test(id) },
	scheduling: { description: "create and manage scheduled tasks", match: id => /scheduled_task|^schedule_task$/.test(id) },
	browser: { description: "open, read and use web pages in this chat's browser", match: id => id.startsWith("browser_") },
	html: { description: "show an HTML page (a chart, diagram or mockup) inline in this chat", match: id => id.startsWith("html_") },
	instructions: { description: "read or change the user's instructions for every chat", match: id => id.endsWith("_global_instructions") },
};

export type PhaseoReview =
	| { title: string; details: string; always?: { label: string; rule: string }; ask?: boolean }
	| { reject: string } | { output: unknown } | { approve: true };

export type PhaseoTurn = {
	task: Task; input: string; callbacks: AgentCallbacks; signal: AbortSignal;
	store: Pick<WorkspaceStore, "loadAgentRun" | "saveAgentRun">;
	client: AgentModelClient;
	tools: AgentTool[];
	instructions: (loaded: string[]) => Promise<string>;
	/** The conversation rebuilt from the transcript, for a fresh run. Its last message is the new input. */
	transcript: AgentMessage[];
	previous: AgentRunResult<unknown, string> | null;
	context: Record<string, unknown>;
	/** Context this turn sets over whatever the run saved, such as a newly selected skill. */
	overrides?: () => Record<string, unknown>;
	/** Adds adapter state (active skills) to what is saved. */
	decorate?: (result: AgentRunResult<unknown, string>) => AgentRunResult<unknown, string>;
	review: (entry: AgentPendingToolCall, rules: ReadonlySet<string>, pending: AgentPendingToolCall[]) => Promise<PhaseoReview>;
	/** Tools registered but not offered right now, such as edits in Plan mode before a plan is approved. */
	hidden?: () => ReadonlySet<string>;
	labels: Record<string, string>;
	facts?: ModelFacts;
	steering: AgentMessage[];
	/** The answer streamed before this step, for clients that stream outside the SDK. */
	streamed: Set<number>;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
export const estimateTokens = (value: unknown) => Math.ceil((typeof value === "string" ? value : JSON.stringify(value) ?? "").length / 3.5);
const clip = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit)}\n… (${(text.length - limit).toLocaleString("en-GB")} more characters)` : text;
export function activityText(value: unknown) { return clip(typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2) ?? "", activityTextLimit); }

/** Whether a finished run still describes this chat: the transcript can change underneath it, through edits or another harness. */
export function runMatchesTranscript(previous: AgentRunResult<unknown, string>, task: Task) {
	const answer = [...task.messages].reverse().find(message => message.role === "assistant");
	const last = [...previous.run.messages].reverse().find(message => message.role === "assistant" && typeof message.content === "string" && message.content.trim());
	return Boolean(answer && last && answer.text.trim() === String(last.content).trim());
}

/** Replaces images the model has already answered with a note: re-sending them costs every step. */
function dropOldImages(messages: AgentMessage[]) {
	const answered = messages.findLastIndex(message => message.role === "assistant" && typeof message.content === "string" && message.content.trim().length > 0);
	let changed = false;
	const next = messages.map((message, index) => {
		if (index >= answered || message.role !== "user" || !Array.isArray(message.content) || !message.content.some(part => part.type === "image_url")) return message;
		changed = true;
		return { ...message, content: message.content.map(part => part.type === "image_url" ? { type: "text" as const, text: "[An image was shown here earlier.]" } : part) };
	});
	return changed ? next : undefined;
}

function transcriptText(messages: AgentMessage[], budget: number) {
	const lines = messages.flatMap(message => {
		if (message.role === "system") return [];
		const text = typeof message.content === "string" ? message.content : message.content.map(part => part.type === "text" ? part.text : "[image]").join("\n");
		if (message.role === "tool") return [`Result of ${message.name}${message.isError ? " (error)" : ""}:\n${clip(text, 2000)}`];
		if (message.role === "assistant") return [...text.trim() ? [`Assistant:\n${text}`] : [], ...(message.toolCalls ?? []).map(call => `Assistant called ${call.name} ${clip(JSON.stringify(call.input), 600)}`)];
		return [`User:\n${clip(text, 8000)}`];
	});
	// The oldest lines go first when the transcript is too long for the summary request.
	let total = lines.reduce((sum, line) => sum + line.length, 0), from = 0;
	while (total > budget && from < lines.length - 1) total -= lines[from++].length;
	return (from ? `[${from} earlier entries left out]\n\n` : "") + lines.slice(from).join("\n\n");
}

const summaryInstructions = "You are compacting a coding agent's conversation so it can continue with less context. Write a summary another instance of the agent can rely on. Include: the user's goal and every explicit instruction or preference; decisions made; files read or changed, with the relevant details (paths, function names, line-level facts that matter); commands run and their outcomes; errors and how they were resolved; the current state; and the exact next steps. Be specific and complete but concise. Plain Markdown, no preamble.";

/** Summarises all but the latest part of the history into one message, keeping the tail verbatim so the current step can continue. */
export async function compactMessages(messages: AgentMessage[], options: { client: AgentModelClient; model: string; signal?: AbortSignal; contextTokens: number; onUsage?: (usage: Record<string, unknown>) => void }) {
	const body = messages.filter(message => message.role !== "system");
	const system = messages.filter(message => message.role === "system");
	// Keep a quarter of the window verbatim, starting at a message that is not a tool result.
	let tail = body.length, kept = 0;
	while (tail > 1 && kept + estimateTokens(body[tail - 1]) < options.contextTokens * 0.25) kept += estimateTokens(body[--tail]);
	while (tail < body.length && body[tail].role === "tool") tail++;
	if (tail <= 1) return undefined;
	const head = body.slice(0, tail);
	const request = [...head].reverse().find(message => message.role === "user" && typeof message.content === "string" && !message.content.startsWith("<conversation_summary>"));
	const response = await options.client.generate({ agentId: "phaseo-compaction", model: options.model, instructions: summaryInstructions, messages: [{ role: "user", content: `${transcriptText(head, options.contextTokens * 1.4)}${request ? `\n\nThe user's latest request was:\n${clip(String(request.content), 8000)}` : ""}\n\nWrite the summary now.` }], tools: [], context: undefined, signal: options.signal, maxOutputTokens: 6000 });
	// The summary is a billed request of its own, so its usage counts towards the chat.
	if (response.usage || response.cost !== undefined) options.onUsage?.({ ...response.usage, ...response.cost !== undefined ? { cost: response.cost } : {} });
	const summary = response.message.content.trim();
	if (!summary) throw new Error("The model returned an empty summary.");
	const rest = body.slice(tail);
	return [...system, { role: "user" as const, content: `<conversation_summary>\n${summary}\n</conversation_summary>\n\nEarlier messages were summarised above to save context. Continue from where the work left off.` }, ...(rest[0]?.role !== "assistant" ? [{ role: "assistant" as const, content: "Understood. I'll continue from the summary." }] : []), ...rest];
}

/** The tool that turns on an optional set of tools for the rest of the chat. */
function loadToolsTool(available: string[]) {
	return defineTool({
		id: "load_tools", onError: "return-to-model", parallelSafe: true,
		description: `Turn on more tools for this chat. Sets: ${available.map(name => `${name} (${phaseoToolsets[name].description})`).join("; ")}.`,
		parameters: { type: "object", properties: { sets: { type: "array", items: { type: "string", enum: available }, minItems: 1 } }, required: ["sets"], additionalProperties: false },
		execute(raw: unknown, context) {
			const sets = strings(record(raw).sets).filter(name => available.includes(name));
			if (!sets.length) throw new Error(`Choose from: ${available.join(", ")}.`);
			const current = record(context.context);
			context.setContext({ ...current, phaseoToolsets: [...new Set([...strings(current.phaseoToolsets), ...sets])] });
			return `Loaded: ${sets.join(", ")}. Their tools are available from your next step.`;
		},
	});
}

/**
 * Tool results reach the model as text, so an image a tool returns (browser_screenshot, html_preview) is shown to it in the next
 * message instead, as view_image does; the result keeps the image's details.
 */
export function imageResultsToMessages(tools: AgentTool[], steering: AgentMessage[]): AgentTool[] {
	return tools.map(tool => typeof tool.execute !== "function" ? tool : { ...tool, execute: async (input: unknown, context: Parameters<NonNullable<Exclude<AgentTool["execute"], false>>>[1]) => {
		const result = await (tool.execute as (input: unknown, context: unknown) => Promise<unknown>)(input, context);
		const image = record(record(result).image);
		if (typeof image.data !== "string" || (image.mimeType !== "image/png" && image.mimeType !== "image/jpeg")) return result;
		steering.push({ role: "user", content: [{ type: "text", text: `The image from ${tool.id}, as requested:` }, { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } }] });
		return { ...record(result), image: "Shown to you in the next message." };
	} });
}

export function activeToolIds(tools: AgentTool[], context: unknown) {
	const loaded = strings(record(context).phaseoToolsets);
	return tools.filter(tool => !Object.entries(phaseoToolsets).some(([name, set]) => set.match(tool.id) && !coreThreadToolIds.includes(tool.id) && !loaded.includes(name))).map(tool => tool.id);
}

/** One Phaseo turn: continue or start the chat's run, keep its history healthy and within the context window, and settle pending approvals. */
export async function runPhaseoTurn(turn: PhaseoTurn): Promise<AgentRunResult<unknown, string> | undefined> {
	const { task, callbacks, signal, store, previous } = turn;
	// A run is continued unless it finished and the transcript has moved on without it.
	const continuing = previous && previous.run.agentId === "phaseo-desktop" && (previous.run.status !== "completed" || runMatchesTranscript(previous, task)) ? previous : undefined;
	if (continuing && continuing.run.status !== "completed") publishPhaseoPlan(continuing.run.context, callbacks);
	const contextTokens = turn.facts?.contextTokens ?? fallbackContextTokens;
	const save = (result: AgentRunResult<unknown, string>) => { const value = turn.decorate?.(result) ?? result; (store.saveAgentRun as (result: AgentRunResult, taskId?: string) => void)(value as AgentRunResult, task.id); publishPhaseoPlan(value.run.context, callbacks); callbacks.onSession(value.run.id); };
	const compact = (messages: AgentMessage[], reason: string) => span("phaseo.compact", { reason }, async () => {
		const id = `compaction:${Date.now()}`, before = estimateTokens(messages), started = Date.now();
		callbacks.onActivity?.({ id, type: "compaction", title: "Compacting context", text: "", status: "running", compaction: { beforeTokens: before } });
		try {
			const next = await compactMessages(messages, { client: turn.client, model: task.model, signal, contextTokens, onUsage: usage => callbacks.onActivity?.({ id: `${id}:usage`, type: "usage", title: "Compaction usage", text: JSON.stringify(usage, null, 2) }) });
			callbacks.onActivity?.({ id, type: "compaction", title: next ? "Context compacted" : "Nothing to compact yet", text: "", status: "completed", compaction: { beforeTokens: before, ...next ? { afterTokens: estimateTokens(next) } : {}, durationMs: Date.now() - started } });
			return next;
		} catch (error) {
			signal.throwIfAborted();
			callbacks.onActivity?.({ id, type: "compaction", title: "Compaction failed", text: error instanceof Error ? error.message : "The summary could not be written.", status: "failed", compaction: { beforeTokens: before } });
			return undefined;
		}
	});

	if (turn.input.trim() === "/compact") {
		const run = continuing && !continuing.run.pause?.pendingToolCalls?.length ? continuing : undefined;
		const next = run ? await compact(run.run.messages, "manual") : undefined;
		if (!run) callbacks.onActivity?.({ id: "compaction:none", type: "compaction", title: "Nothing to compact yet", text: "", status: "completed", compaction: { beforeTokens: 0 } });
		if (run && next) save({ ...run, run: { ...run.run, messages: next }, messages: next });
		return run;
	}

	const optional = Object.keys(phaseoToolsets).filter(name => turn.tools.some(tool => phaseoToolsets[name].match(tool.id) && !coreThreadToolIds.includes(tool.id)));
	const tools = optional.length ? [...turn.tools, loadToolsTool(optional)] : turn.tools;
	const turnStart = continuing?.stepResults?.length ?? continuing?.run.stepCount ?? 0;
	let lastCompactedAt = 0;
	const agent = createAgent<string, unknown>({
		id: "phaseo-desktop", model: task.model, maxSteps: phaseoTurnStepLimit + 20, tools,
		toolExecution: { onError: "return-to-model", maxOutputChars: phaseoToolOutputLimit },
		modelRetry: { maxRetries: 3, backoffMs: 1000, maxBackoffMs: 20_000 },
		...(turn.facts?.outputTokens ? { maxOutputTokens: Math.min(turn.facts.outputTokens, 32_000) } : {}),
		instructions: async ({ context }) => turn.instructions(strings(record(context).phaseoToolsets)),
		activeTools: ({ context }) => { const hidden = turn.hidden?.(); return optional.length || hidden?.size ? activeToolIds(tools, context).filter(id => !hidden?.has(id)) : undefined; },
		stopWhen: ({ steps }) => steps.length - turnStart >= phaseoTurnStepLimit ? "step_limit" : false,
		prepareMessages: async (messages, info) => {
			const trimmed = dropOldImages(messages) ?? messages;
			const size = estimateTokens(trimmed);
			// After a compaction the history must grow again before another, so a summary that is still large cannot loop.
			if (info.reason === "overflow" || (size > contextTokens * compactAt && size > lastCompactedAt * 1.15)) {
				const next = await compact(trimmed, info.reason);
				if (next) { lastCompactedAt = estimateTokens(next); return next; }
				if (info.reason === "overflow") return undefined;
			}
			return trimmed === messages ? undefined : trimmed;
		},
	});

	let rules = new Set(strings(record(continuing?.run.context).phaseoAllowed));
	const context = () => ({ ...turn.context, ...record(continuing?.run.context), ...turn.overrides?.(), ...rules.size ? { phaseoAllowed: [...rules] } : {} });
	const onEvent = (event: AgentEvent) => {
		if (event.type === "response.output_text.delta") { turn.streamed.add(event.stepIndex); callbacks.onDelta(`step:${event.stepIndex}`, event.delta); }
		if (event.type === "response.item" && event.item.type === "message" && !turn.streamed.has(event.stepIndex)) { turn.streamed.add(event.stepIndex); callbacks.onDelta(`step:${event.stepIndex}`, event.item.content); }
		if (event.type === "response.reasoning.delta") callbacks.onActivity?.({ id: `reasoning:${event.stepIndex}`, type: "reasoning", title: "Reasoning", text: event.delta, append: true });
		if (event.type === "tool.started" || event.type === "tool.completed" || event.type === "tool.failed") callbacks.onActivity?.({ id: event.toolCallId, type: "tool", title: turn.labels[event.toolName] ?? event.toolName, text: event.error ?? activityText(event.output), status: event.type === "tool.started" ? "running" : event.type === "tool.failed" ? "failed" : "completed" });
		if (event.type === "step.completed" && event.usage) callbacks.onActivity?.({ id: `usage:${event.stepIndex}`, type: "usage", title: "Usage", text: JSON.stringify({ ...event.usage, contextTokens }, null, 2) });
		if (event.type === "model.retrying") callbacks.onActivity?.({ id: `retry:${event.stepIndex}`, type: "tool", title: "Retrying the model request", text: `${event.error ?? "The request failed."} Trying again in ${Math.max(1, Math.round((event.delayMs ?? 0) / 1000))} s (attempt ${(event.attempt ?? 1) + 1} of 4).`, status: "completed" });
		if (event.type === "history.repaired") callbacks.onActivity?.({ id: `repaired:${event.toolCallIds.join(",")}`.slice(0, 200), type: "tool", title: "Recovered the interrupted turn", text: `${event.toolCallIds.length} unfinished tool call${event.toolCallIds.length === 1 ? " was" : "s were"} marked as not run.`, status: "completed" });
	};
	const options = { client: turn.client, signal, onEvent, takeMessages: () => turn.steering.splice(0), state: { load: async (id: string) => store.loadAgentRun(id) as AgentRunResult<unknown, string> | null, save: async (result: AgentRunResult<unknown, string>) => save(result) } };

	const followUp = turn.transcript.slice(-1);
	let pendingFollowUp: AgentMessage[] | undefined = continuing ? followUp : undefined;
	let result = continuing?.run.pause?.pendingToolCalls?.length
		? continuing
		: continuing
		? await agent.continueStream({ ...options, context: context(), run: continuing, humanMessages: followUp })
		: await agent.stream({ ...options, context: turn.context, input: turn.input, messages: turn.transcript });
	if (continuing && result !== continuing) pendingFollowUp = undefined;
	// A steering message that arrives as the model gives its last answer starts one more round instead of being lost.
	while (result.run.status === "waiting_for_human" || result.run.pause?.pendingToolCalls?.length || (result.run.status === "completed" && turn.steering.length)) {
		signal.throwIfAborted();
		if (result.run.status === "completed") { result = await agent.continueStream({ ...options, context: { ...turn.context, ...record(result.run.context), ...turn.overrides?.() }, run: result, humanMessages: turn.steering.splice(0) }); continue; }
		const pending = result.run.pause?.pendingToolCalls ?? [];
		if (!pending.length) throw new Error("This run needs a human response that is not supported yet.");
		rules = new Set(strings(record(result.run.context).phaseoAllowed));
		const approvals: string[] = [], rejections: { toolCallId: string; reason?: string }[] = [], toolOutputs: { toolCallId: string; output: unknown }[] = [];
		for (const entry of pending) {
			const review = await turn.review(entry, rules, pending);
			if ("output" in review) { toolOutputs.push({ toolCallId: entry.call.id, output: review.output }); continue; }
			if ("reject" in review) { rejections.push({ toolCallId: entry.call.id, reason: review.reject }); continue; }
			if ("approve" in review) { approvals.push(entry.call.id); continue; }
			const decision = await callbacks.onApproval(review.title, (entry.executionStartedAt ? "This action started before the interruption and may already have completed. Check its effects before approving again.\n\n" : "") + review.details, review.always ? { always: review.always.label } : undefined, review.ask ? { ask: true } : undefined);
			if (decision === "always" && review.always) rules.add(review.always.rule);
			if (decision === "accept" || decision === "always") approvals.push(entry.call.id); else rejections.push({ toolCallId: entry.call.id, reason: "The person rejected this action. Do not retry it unless they ask." });
		}
		if (signal.aborted) throw new Error("Task stopped.");
		result = await agent.continueStream({ ...options, context: { ...turn.context, ...record(result.run.context), ...turn.overrides?.(), ...rules.size ? { phaseoAllowed: [...rules] } : {} }, run: result, approvals, rejections, toolOutputs, humanMessages: pendingFollowUp });
		pendingFollowUp = undefined;
	}
	if (result.run.status === "stopped" && result.run.stopReason === "step_limit") {
		callbacks.onActivity?.({ id: "step-limit", type: "tool", title: "Paused after many steps", text: `This turn used ${phaseoTurnStepLimit} steps. Send a message, such as "continue", to carry on from here.`, status: "completed" });
		return result;
	}
	if (result.run.status !== "completed") throw new Error(result.run.error ?? result.run.stopReason ?? `Agent run ${result.run.status}.`);
	return result;
}

/** The orchestration guidance: delegation always, the rest once its tools are loaded. */
export function phaseoOrchestrationPrompt(loaded: string[], full: string) {
	if (loaded.length) return full;
	const lines = full.split("\n");
	return [lines[0], "You can delegate work to other agents with list_agents, delegate_task, wait_thread, list_threads and read_thread.", ...lines.slice(2, 9), "- More tools are available through load_tools: managing and launching chats, pull requests, scheduled tasks, this chat's browser and HTML pages shown inline (charts, diagrams). Load a set only when the task needs it."].join("\n");
}

/** A chat's lasting permission for a tool call, used by "always allow". */
export function approvalRule(call: AgentToolCall, kind: "edit" | "command" | "tool"): { label: string; rule: string } {
	if (kind === "edit") return { label: "Allow file edits for the rest of this chat", rule: "edits" };
	if (kind === "tool") return { label: "Always allow this tool in this chat", rule: `tool:${call.name}` };
	const words = String(record(call.input).command ?? "").trim().split(/\s+/);
	// Package managers and git are allowed per subcommand, so allowing tests does not allow publishing.
	const prefix = words.slice(0, /^(npm|pnpm|yarn|bun|npx|git|cargo|go|dotnet|uv|pip|python|node)$/i.test(words[0] ?? "") ? 2 : 1).join(" ");
	return { label: `Always allow \`${prefix}\` commands in this chat`, rule: `command:${prefix}` };
}

/** Whether a command is covered by an allowed prefix. Chained commands never are, so an allowed prefix cannot smuggle another command. */
export function commandAllowed(command: string, rules: ReadonlySet<string>) {
	const text = command.trim();
	if (/[;&|`\n]|\$\(/.test(text)) return false;
	return [...rules].some(rule => rule.startsWith("command:") && (text === rule.slice(8) || text.startsWith(`${rule.slice(8)} `)));
}

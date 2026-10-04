import path from "node:path";
import { createAgent } from "@phaseo/agent-sdk";
import type { AgentEvent, AgentMessage, AgentModelClient, AgentRunResult } from "@phaseo/agent-sdk";
import type { Account, Task } from "../shared/workspace";
import type { NativeAction } from "../shared/nativeActions";
import type { AgentCallbacks } from "./agentAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import type { WorkspaceStore } from "./workspaceStore";
import type { AttachmentContent } from "./attachments";
import { attachmentPrompt } from "./attachmentPrompt";
import { PhaseoSkills, restoredPhaseoSkill } from "./phaseoSkills";
import { PhaseoSkillTools } from "./phaseoSkillTools";
import { ProjectInstructions } from "./projectInstructions";
import { readChatCompletion } from "./chatCompletionStream";

export async function runPhaseoChat(task: Task, cwd: string, text: string, callbacks: AgentCallbacks, account: Account, attachments: AttachmentContent[], nativeAction: NativeAction | undefined, dependencies: { store: Pick<WorkspaceStore, "loadAgentRun" | "saveAgentRun">; globalRoot?: string; fetcher: typeof fetch; credential: (id: string) => string | Promise<string>; signal: AbortSignal }) {
 const { store, globalRoot, fetcher, credential, signal } = dependencies;
 const previous = task.nativeSessionId ? store.loadAgentRun(task.nativeSessionId) as AgentRunResult<unknown, string> | null : null;
 const continuing = previous && previous.run.status !== "completed" ? previous : undefined;
 const requested = nativeAction;
 if (!nativeAction && continuing) nativeAction = restoredPhaseoSkill(continuing.run.context, text);
 const skills = globalRoot ? new PhaseoSkills(path.dirname(globalRoot), task.projectId ? cwd : undefined) : undefined;
 const toolkit = skills ? new PhaseoSkillTools(skills, signal) : undefined;
 if (continuing?.run.pause?.pendingToolCalls?.some(entry => !["list_skills", "load_skill"].includes(entry.call.name))) throw new AgentInputRejectedError("This pending run requires tools unavailable in Chat. Resume it in its original mode.");
 if (!skills && (nativeAction || (continuing?.run.context && typeof continuing.run.context === "object" && "phaseoModelSkills" in continuing.run.context))) throw new AgentInputRejectedError("Phaseo skill storage is unavailable.");
 const approved = nativeAction ? await skills!.approve(nativeAction, callbacks, signal) : undefined;
 if (approved) callbacks.onActivity?.({ id: "selected-skill", type: "tool", title: "Skill activated", text: approved.name, status: "completed" });
 const selected = approved ? skills!.instructionReader(approved, signal) : undefined;
 try { if (continuing) await toolkit?.restore(continuing.run.context, callbacks); } catch (error) { throw new AgentInputRejectedError("Active Phaseo skills could not be restored; input was not submitted.", { cause: error }); }
 const instructions = new ProjectInstructions(cwd, files => callbacks.onActivity?.({ id: "project-instructions", type: "tool", title: "Project instructions", text: `Loaded ${files.join(", ")}`, status: "completed" }), globalRoot, async () => [...selected ? [await selected()] : [], ...await toolkit?.instructions() ?? []]);
 const refresh = () => task.projectId ? instructions.load(".", true) : instructions.loadGlobal();
 try { await refresh(); } catch (error) { throw new AgentInputRejectedError("Chat instructions could not be loaded; input was not submitted.", { cause: error }); }
 const messages: AgentMessage[] = task.messages.filter(message => message.role === "user" || message.role === "assistant").map(message => {
  const files = attachments.filter(file => message.attachments?.some(value => value.id === file.id));
  const content = attachmentPrompt(requested && message === task.messages.at(-1) && message.role === "user" ? requested.arguments : message.text, files);
  if (message.role === "assistant") return { role: "assistant", content };
  const images = files.filter(file => file.kind === "image");
  return { role: "user", content: images.length ? [{ type: "text", text: content }, ...images.map(file => ({ type: "image_url" as const, image_url: { url: file.dataUrl! } }))] : content };
 });
 if (task.messages.at(-1)?.role !== "user" || task.messages.at(-1)?.text !== text) messages.push({ role: "user", content: requested ? requested.arguments : text });
 let followUp = continuing ? messages.slice(-1) : undefined;
 let step = continuing?.run.stepCount ?? 0;
 const client: AgentModelClient = { generate: async request => {
  const id = `step:${step++}`;
  const wire = request.messages.map(message => message.role === "tool" ? { role: "tool", content: message.content, tool_call_id: message.toolCallId } : message.role === "assistant" ? { role: "assistant", content: message.content, ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map(call => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) } : {}) } : message);
  if (request.instructions) wire.unshift({ role: "system", content: request.instructions });
  const response = await fetcher(`${account.endpoint!.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal, redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await credential(account.id)}` }, body: JSON.stringify({ model: task.model, messages: wire, stream: true, ...(request.tools.length ? { tools: request.tools.map(tool => ({ type: "function", function: { name: tool.id, description: tool.description, parameters: tool.parameters } })) } : {}) }) });
  if (!response.ok) throw new Error(`The model provider returned HTTP ${response.status}.`);
  const completion = await readChatCompletion(response, delta => callbacks.onDelta(id, delta));
  return { message: { role: "assistant", content: completion.text, toolCalls: completion.calls } };
 } };
 const agent = createAgent<string, unknown>({ id: "phaseo-desktop", model: task.model, maxSteps: 40, tools: toolkit?.tools() ?? [], instructions: async () => { await refresh(); return `Help the user with their work. Apply global guidance everywhere; project guidance takes precedence within its scope. Only skill discovery and approved activation are available; filesystem, command and MCP tools are unavailable in Chat.\n${instructions.prompt()}`; } });
 const context = { ...(nativeAction ? { phaseoSkill: { id: nativeAction.id, name: nativeAction.name } } : {}), ...(toolkit?.snapshot().length ? { phaseoModelSkills: toolkit.snapshot() } : {}) };
 const options = { client, signal, context: context as unknown, onEvent: (event: AgentEvent) => { if (event.type === "tool.started" || event.type === "tool.completed" || event.type === "tool.failed") callbacks.onActivity?.({ id: event.toolCallId, type: "tool", title: event.toolName, text: event.error ?? JSON.stringify(event.output ?? "", null, 2), status: event.type === "tool.started" ? "running" : event.type === "tool.failed" ? "failed" : "completed" }); }, state: { load: async (id: string) => store.loadAgentRun(id) as AgentRunResult<unknown, string> | null, save: async (result: AgentRunResult<unknown, string>) => { const active = toolkit?.snapshot(); store.saveAgentRun(active?.length ? { ...result, run: { ...result.run, context: { ...(result.run.context && typeof result.run.context === "object" ? result.run.context : {}), phaseoModelSkills: active } } } : result); callbacks.onSession(result.run.id); } } };
 let result = continuing?.run.status === "waiting_for_human" && continuing.run.pause?.pendingToolCalls?.length ? continuing : continuing ? await agent.continueRun({ ...options, run: continuing, humanMessages: followUp }) : await agent.run({ ...options, input: requested ? requested.arguments : text, messages });
 if (continuing && result !== continuing) followUp = undefined;
 while (result.run.status === "waiting_for_human") {
  const pending = result.run.pause?.pendingToolCalls ?? []; if (!pending.length) throw new Error("This Chat run requires an unsupported human response.");
  const approvals: string[] = [], rejections: string[] = [];
  for (const entry of pending) {
   let review: { title: string; details: string };
   try { if (!toolkit || entry.call.name !== "load_skill") throw new Error("This tool is unavailable in Chat."); review = await toolkit.review(entry.call); }
   catch (error) { signal.throwIfAborted(); callbacks.onActivity?.({ id: entry.call.id, type: "tool", title: "Skill unavailable", text: error instanceof Error ? error.message : "Could not review skill.", status: "failed" }); rejections.push(entry.call.id); continue; }
   (await callbacks.onApproval(review.title, review.details) === "accept" ? approvals : rejections).push(entry.call.id);
  }
  if (signal.aborted) throw new Error("Task stopped.");
  result = await agent.continueRun({ ...options, context: { ...(result.run.context && typeof result.run.context === "object" ? result.run.context : {}), ...context, ...(toolkit?.snapshot().length ? { phaseoModelSkills: toolkit.snapshot() } : {}) }, run: result, approvals, rejections, humanMessages: followUp });
  followUp = undefined;
 }
 if (result.run.status !== "completed") throw new Error(result.run.error ?? `Chat run ${result.run.status}.`);
}

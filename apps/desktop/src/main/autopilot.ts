import type { AgentForm, FormAnswer } from "../shared/agentForms";
import { optionValue, questionOptions } from "../shared/agentQuestions";
import type { WorkspacePreferences } from "../shared/preferences";
import type { AgentQuestion, Message, Task } from "../shared/workspace";

/**
 * Autopilot (experimental) stands in for the person while an agent works: a model answers the agent's questions, forms
 * and plans, and when a turn ends it judges whether the task is done and, if not, what to say next. These are the
 * prompts and the checks on what the model replies; the runtime makes the calls and acts on them.
 */

/** One request to the Autopilot model; resolves to its reply text. */
export type AutopilotCall = (request: { system: string; user: string; maxTokens: number }) => Promise<string | undefined>;
export type AutopilotBrief = { title: string; goal: string; parent?: { title: string; goal: string; recent: Turn[] }; recent: Turn[] };
type Turn = { role: "person" | "agent" | "autopilot"; text: string };

const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}… (cut)` : text;
const said = (message: Message): Turn | undefined => message.notice || message.role === "system" || message.role === "tool" || !message.text.trim() ? undefined
	: { role: message.role === "assistant" ? "agent" : message.autopilot ? "autopilot" : "person", text: clip(message.text, 3000) };
/** The person's own first message: the task. A delegated agent's is the brief its parent gave it. */
const firstAsk = (messages: readonly Message[]) => messages.find(message => message.role === "user" && !message.notice && !message.autopilot)?.text ?? "";

/** What the model is told about the chat: its goal, its parent's when an agent started it, and the latest messages. */
export function autopilotBrief(task: Pick<Task, "title" | "messages">, parent?: Pick<Task, "title" | "messages">): AutopilotBrief {
	const recent = (messages: readonly Message[], count: number) => messages.flatMap(message => said(message) ?? []).slice(-count);
	return {
		title: task.title, goal: clip(firstAsk(task.messages), 6000), recent: recent(task.messages, 8),
		...parent ? { parent: { title: parent.title, goal: clip(firstAsk(parent.messages), 4000), recent: recent(parent.messages, 4) } } : {},
	};
}

/** A delegated agent is answered with its parent's model first; otherwise the chat's own model, when it runs on Phaseo. */
export function autopilotModel(task: Pick<Task, "harness" | "model">, parent: Pick<Task, "harness" | "model"> | undefined, preferences: Pick<WorkspacePreferences, "autopilotModel" | "titleModel">) {
	const onPhaseo = (value?: Pick<Task, "harness" | "model">) => value?.harness === "phaseo" && value.model !== "default" ? value.model : undefined;
	return onPhaseo(parent) ?? onPhaseo(task) ?? preferences.autopilotModel ?? preferences.titleModel ?? undefined;
}

const system = `You are Autopilot in the Phaseo desktop app. The person has asked an AI coding agent to do a task and has stepped away; you stand in for them so the agent can finish without waiting.
Decide as the person would, from their goal and the conversation. Prefer the choice that gets the task finished well. Escalate to the person only when the answer needs something only they know (a secret, a preference they have not stated, facts that are not in the conversation) or a choice they would clearly want to make themselves.
Reply with one JSON object and nothing else.`;

const briefText = (brief: AutopilotBrief) => [
	`Chat: ${brief.title}`, `The person's task:\n${brief.goal || "(not stated)"}`,
	...brief.parent ? [`This agent was started by another chat, "${brief.parent.title}", whose task is:\n${brief.parent.goal || "(not stated)"}`, `Latest in that chat:\n${brief.parent.recent.map(turn => `[${turn.role}] ${turn.text}`).join("\n\n") || "(nothing yet)"}`] : [],
	`Latest in this chat:\n${brief.recent.map(turn => `[${turn.role}] ${turn.text}`).join("\n\n") || "(nothing yet)"}`,
].join("\n\n");

/** The first JSON object in a reply, allowing code fences and text around it. */
export function replyObject(reply: string | undefined): Record<string, unknown> | undefined {
	if (!reply) return undefined;
	const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
	if (start < 0 || end <= start) return undefined;
	try { const value = JSON.parse(reply.slice(start, end + 1)) as unknown; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
	catch { return undefined; }
}
const reasonOf = (value: Record<string, unknown>) => typeof value.reason === "string" && value.reason.trim() ? clip(value.reason.trim(), 1000) : "No reason given.";
const unreadable = { decision: "escalate" as const, reason: "Autopilot could not read the model's reply." };

export type Escalation = { decision: "escalate"; reason: string };

/** Answers to an agent's questions, by question id: option values, or the model's own text where the question allows it. */
export async function answerQuestions(call: AutopilotCall, brief: AutopilotBrief, questions: AgentQuestion[]): Promise<{ decision: "answer"; answers: Record<string, string[]>; reason: string } | Escalation> {
	if (questions.some(question => question.isSecret)) return { decision: "escalate", reason: "A secret is needed, so this goes to the person." };
	const asked = questions.map(question => ({ id: question.id, question: question.question, header: question.header, options: questionOptions(question).map(option => ({ value: optionValue(option), label: option.label, description: option.description })), multiSelect: Boolean(question.multiSelect), ownAnswerAllowed: question.isOther === true || !questionOptions(question).length }));
	const reply = replyObject(await call({ system, maxTokens: 1500, user: `${briefText(brief)}\n\nThe agent asks:\n${JSON.stringify(asked, null, 2)}\n\nReply with {"decision":"answer","answers":{"<question id>":["<option value, or your own text where ownAnswerAllowed>"]},"reason":"<one sentence>"} or {"decision":"escalate","reason":"<why the person must answer>"}.` }));
	if (!reply) return unreadable;
	if (reply.decision === "escalate") return { decision: "escalate", reason: reasonOf(reply) };
	if (reply.decision !== "answer" || !reply.answers || typeof reply.answers !== "object") return unreadable;
	const given = reply.answers as Record<string, unknown>, answers: Record<string, string[]> = {};
	for (const question of questions) {
		const raw = given[question.id], values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter((value): value is string => typeof value === "string");
		// A model may name an option by its label; the agent expects its value.
		answers[question.id] = values.map(value => optionValue(questionOptions(question).find(option => option.label === value) ?? { label: value }));
	}
	return { decision: "answer", answers, reason: reasonOf(reply) };
}

/** A form's answer, keyed by field. */
export async function answerForm(call: AutopilotCall, brief: AutopilotBrief, form: AgentForm): Promise<{ decision: "answer"; answer: FormAnswer; reason: string } | Escalation> {
	const reply = replyObject(await call({ system, maxTokens: 1500, user: `${briefText(brief)}\n\nThe agent needs this form filled in:\n${clip(JSON.stringify({ title: form.title, fields: form.fields }, null, 2), 12000)}\n\nReply with {"decision":"answer","answer":{"<field key>":<value>},"reason":"<one sentence>"} or {"decision":"escalate","reason":"<why the person must answer>"}.` }));
	if (!reply) return unreadable;
	if (reply.decision === "escalate") return { decision: "escalate", reason: reasonOf(reply) };
	if (reply.decision !== "answer" || !reply.answer || typeof reply.answer !== "object" || Array.isArray(reply.answer)) return unreadable;
	return { decision: "answer", answer: reply.answer as FormAnswer, reason: reasonOf(reply) };
}

/** A proposed plan: carry on with it, send it back with feedback, or leave it to the person. */
export async function reviewPlan(call: AutopilotCall, brief: AutopilotBrief, plan: string): Promise<{ decision: "accept"; reason: string } | { decision: "revise"; feedback: string; reason: string } | Escalation> {
	const reply = replyObject(await call({ system, maxTokens: 1500, user: `${briefText(brief)}\n\nThe agent proposes this plan:\n${clip(plan, 20000)}\n\nApprove it if it does the task well. Reply with {"decision":"accept","reason":"..."}, {"decision":"revise","feedback":"<what to change>","reason":"..."} or {"decision":"escalate","reason":"..."}.` }));
	if (!reply) return unreadable;
	if (reply.decision === "accept") return { decision: "accept", reason: reasonOf(reply) };
	if (reply.decision === "revise" && typeof reply.feedback === "string" && reply.feedback.trim()) return { decision: "revise", feedback: clip(reply.feedback.trim(), 4000), reason: reasonOf(reply) };
	if (reply.decision === "escalate") return { decision: "escalate", reason: reasonOf(reply) };
	return unreadable;
}

/** An action the agent would only take with the person's say-so. */
export async function reviewAction(call: AutopilotCall, brief: AutopilotBrief, action: { title: string; details: string }): Promise<{ decision: "accept" | "decline"; reason: string } | Escalation> {
	const reply = replyObject(await call({ system, maxTokens: 800, user: `${briefText(brief)}\n\nThe agent asks to: ${action.title}\n${clip(action.details, 8000)}\n\nReply with {"decision":"accept"|"decline"|"escalate","reason":"<one sentence>"}.` }));
	if (!reply) return unreadable;
	if (reply.decision === "accept" || reply.decision === "decline" || reply.decision === "escalate") return { decision: reply.decision, reason: reasonOf(reply) };
	return unreadable;
}

export type TurnVerdict = { status: "done"; summary: string } | { status: "continue"; message: string; reason: string } | { status: "blocked"; summary: string };

/** After a turn: is the task done, and if not, what should the agent be told next? */
export async function judgeTurn(call: AutopilotCall, brief: AutopilotBrief, turn: { answer: string; usedTools: boolean; followUps: number }): Promise<TurnVerdict> {
	const reply = replyObject(await call({ system, maxTokens: 1500, user: `${briefText(brief)}\n\nThe agent has just finished a turn${turn.usedTools ? "" : " without using any tools"}. Its last message:\n${clip(turn.answer || "(no message)", 12000)}\n\nAutopilot has sent ${turn.followUps} follow-up${turn.followUps === 1 ? "" : "s"} in this run.\nIs the person's task complete? Judge from the evidence in the conversation, not from the agent's claims alone.\nReply with {"status":"done","summary":"<two or three sentences for the person on what was done>"}, {"status":"continue","message":"<the specific next instruction to send the agent>","reason":"<one sentence>"} or {"status":"blocked","summary":"<exactly what is needed from the person>"}.` }));
	if (!reply) return { status: "blocked", summary: "Autopilot could not read the model's verdict on this turn." };
	const text = (key: string) => typeof reply[key] === "string" && (reply[key] as string).trim() ? clip((reply[key] as string).trim(), 4000) : undefined;
	if (reply.status === "done") return { status: "done", summary: text("summary") ?? "The task is complete." };
	if (reply.status === "continue" && text("message")) return { status: "continue", message: text("message")!, reason: reasonOf(reply) };
	if (reply.status === "blocked") return { status: "blocked", summary: text("summary") ?? "Autopilot needs you to decide how to continue." };
	return { status: "blocked", summary: "Autopilot could not read the model's verdict on this turn." };
}

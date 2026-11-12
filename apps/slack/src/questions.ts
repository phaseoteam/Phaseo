import type { AgentTool } from "@phaseo/agent-sdk";
import type { SharedFileRef } from "./slack-files";
import type { SlackClient } from "./slack-api";

// Questions with buttons. The agent calls ask_question when it needs the person
// to choose or approve something before it goes on: a short question and 2 to 5
// short options, and optionally their own answer. The turn's run pauses (the
// agent SDK keeps the run waiting for the tool's output), the question is posted
// in the thread with a button per option, and the turn's Workflow waits for the
// answer for up to an hour (AgentTurnWorkflow, step.waitForEvent).
//
// Only the person the agent is answering can answer; anyone else who clicks gets
// a private note. They answer with a button, with Other (a small form) when the
// agent allows their own answer, or by replying in the thread (mentioning the
// agent in a channel). The thread's coordinator records the first answer and wakes
// the Workflow, which continues the run from where it stopped. Unanswered, the
// question expires after an hour and the answer ends there.
//
// The question, its options and the answer are Slack text: they live in the
// thread's coordinator with the turn and its working memory, never in Workflow
// step outputs or logs.

export const ASK_QUESTION_TOOL_ID = "ask_question";
/** Questions one answer may ask. */
export const MAX_QUESTIONS = 3;
export const QUESTION_TIMEOUT_MS = 60 * 60_000;
/** QUESTION_TIMEOUT_MS as a Workflows duration. */
export const QUESTION_TIMEOUT = "1 hour";
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;
const MAX_QUESTION_CHARS = 300;
/** Slack's limit for a button's text. */
const MAX_OPTION_CHARS = 75;
/** The most an answer in their own words keeps. */
export const MAX_OWN_ANSWER_CHARS = 2_000;
/** How much of an answer in their own words the question message shows. */
const SHOWN_ANSWER_CHARS = 500;

export const ANSWER_ACTION_PREFIX = "question_answer_";
export const OTHER_ACTION_ID = "question_other";
/** The Other form's callback id, and its text input's block and action ids. */
export const OTHER_VIEW_ID = "question_other";
export const OTHER_INPUT_ID = "answer";

export type QuestionDraft = {
	/** The paused tool call the answer is the output of. */
	callId: string;
	text: string;
	options: string[];
	/** They may answer in their own words (the Other button). */
	other: boolean;
};

export type QuestionAnswer = {
	/** A button, the Other form, or a reply in the thread. */
	by: "button" | "form" | "message";
	/** The option chosen, for a button. */
	choice: number | null;
	text: string;
	/** Files shared with an answer in the thread: the run after the question reads them like the message's own. */
	files?: SharedFileRef[];
};

export type QuestionStatus = "pending" | "open" | "answered" | "expired" | "cancelled";

export type QuestionState = QuestionDraft & {
	/** 1 for the answer's first question. */
	n: number;
	/** pending until it is posted; then open until it is answered, expires or the thread is stopped. */
	status: QuestionStatus;
	/** The question's Slack message. */
	ts: string | null;
	expiresAt: number | null;
	answer: QuestionAnswer | null;
	/** What the answer wrote before the question, finished without a footer when the question was posted. */
	leg: { reply: string; ts: string | null; tools: string[] } | null;
};

function oneLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/** The tool's input as a question, or why it can't be asked. */
export function parseQuestion(input: unknown): { text: string; options: string[]; other: boolean } | { error: string } {
	const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const text = typeof value.question === "string" ? value.question.trim() : "";
	if (!text) return { error: "question must be a short question" };
	if (text.length > MAX_QUESTION_CHARS) return { error: `question must be at most ${MAX_QUESTION_CHARS} characters` };
	if (!Array.isArray(value.options)) return { error: `options must be a list of ${MIN_OPTIONS} to ${MAX_OPTIONS} short options` };
	const options = value.options.map((option) => (typeof option === "string" ? oneLine(option) : ""));
	if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return { error: `options must be a list of ${MIN_OPTIONS} to ${MAX_OPTIONS} short options` };
	if (options.some((option) => !option || option.length > MAX_OPTION_CHARS)) return { error: `each option must be 1 to ${MAX_OPTION_CHARS} characters` };
	if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return { error: "options must be different from one another" };
	return { text, options, other: value.allow_other === true };
}

/**
 * ask_question. `refusal` says why a question can't be asked at this step (no
 * steps left to go on with, the answer has asked its questions, or it has
 * searched Slack), or null. The first question in a run pauses it; `onAsk` gets
 * it. Any other question in the same run is told to wait for the first.
 */
export function askQuestionTool(options: { refusal: (stepIndex: number) => string | null | Promise<string | null>; onAsk: (question: QuestionDraft) => void }): AgentTool<any, any> {
	let asked = false;
	return {
		id: ASK_QUESTION_TOOL_ID,
		description: `Ask the person a question with buttons, when you need them to choose or approve something before you go on. Give a short question and ${MIN_OPTIONS} to ${MAX_OPTIONS} short options (a few words each); set allow_other when they may answer in their own words. Your answer waits until they reply, for up to an hour, and the tool returns their answer. Ask one question at a time, and only when you can't sensibly go on without it.`,
		parameters: {
			type: "object",
			properties: {
				question: { type: "string", description: `The question, at most ${MAX_QUESTION_CHARS} characters.` },
				options: { type: "array", items: { type: "string" }, minItems: MIN_OPTIONS, maxItems: MAX_OPTIONS, description: `${MIN_OPTIONS} to ${MAX_OPTIONS} options, each at most ${MAX_OPTION_CHARS} characters.` },
				allow_other: { type: "boolean", description: "Also let them answer in their own words. Default false." },
			},
			required: ["question", "options"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		onToolCalled: async (input, context) => {
			const parsed = parseQuestion(input);
			if ("error" in parsed) return { asked: false, error: parsed.error };
			const refused = await options.refusal(context.stepIndex);
			if (refused) return { asked: false, error: refused };
			if (asked) return { asked: false, error: "You can ask one question at a time. Wait for the answer to your other question, then ask this one if you still need to." };
			asked = true;
			options.onAsk({ callId: context.toolCall.id, ...parsed });
			// Null pauses the run until the answer is supplied as this call's output.
			return null;
		},
	};
}

/** What the paused tool call returns once the person answered. */
export function answerOutput(question: Pick<QuestionState, "options" | "answer">): Record<string, unknown> {
	const answer = question.answer;
	if (!answer) return { answered: false };
	if (answer.by === "button" && answer.choice !== null) return { answered: true, answer: question.options[answer.choice] ?? answer.text };
	return { answered: true, answer: answer.text, in_their_own_words: true };
}

/** The question in the thread's working memory, with what became of it. */
export function questionMemory(question: QuestionState, askerId: string): string {
	const offered = `${question.options.join(", ")}${question.other ? ", or their own answer" : ""}`;
	return `You asked <@${askerId}>: ${question.text} (options: ${offered}). ${outcomeLine(question, askerId, Number.POSITIVE_INFINITY)}`;
}

function shorten(text: string, limit: number): string {
	return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function outcomeLine(question: QuestionState, askerId: string, answerChars: number): string {
	const answer = question.answer;
	switch (question.status) {
		case "answered":
			if (answer?.by === "button" && answer.choice !== null) return `<@${askerId}> chose: ${question.options[answer.choice] ?? answer.text}`;
			if (answer?.by === "message") return `<@${askerId}> answered in the thread: ${shorten(answer.text, answerChars)}`;
			return `<@${askerId}> answered: ${shorten(answer?.text ?? "", answerChars)}`;
		case "expired":
			return "No answer within an hour, so I stopped here. Ask me again when you're ready.";
		case "cancelled":
			return "Stopped before an answer.";
		default:
			return `Only <@${askerId}> can answer. This question expires in an hour.`;
	}
}

/** Slack's mrkdwn escapes, for text shown as it was written. */
function escaped(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A button's value: which question of which turn, and the option. */
export function answerValue(threadTs: string, turnId: number, n: number, choice: number | "other"): string {
	return `${threadTs}|${turnId}|${n}|${choice}`;
}

export type AnswerRef = { threadTs: string; turnId: number; n: number; choice: number | "other" };

const TS_PART = /^[0-9]{1,12}\.[0-9]{1,8}$/;

export function parseAnswerValue(value: string | undefined): AnswerRef | null {
	const [threadTs, turnId, n, choice, ...rest] = (value ?? "").split("|");
	if (rest.length || !threadTs || !TS_PART.test(threadTs) || !/^[1-9][0-9]{0,9}$/.test(turnId ?? "") || !/^[1-9]$/.test(n ?? "")) return null;
	if (choice !== "other" && !/^[0-4]$/.test(choice ?? "")) return null;
	return { threadTs, turnId: Number(turnId), n: Number(n), choice: choice === "other" ? "other" : Number(choice) };
}

/**
 * The question's Slack message: the question, then buttons while it's open, or
 * what became of it. `text` is what notifications and later reads of the thread
 * show, so it carries the outcome too.
 */
export function questionMessage(question: QuestionState, askerId: string, threadTs: string, turnId: number): { text: string; blocks: unknown[] } {
	const open = question.status === "open" || question.status === "pending";
	// The person's own words are shown as they wrote them; the agent's question and options are its Markdown.
	const outcome = question.status === "answered" && question.answer && question.answer.by !== "button"
		? outcomeLine({ ...question, answer: { ...question.answer, text: escaped(question.answer.text) } }, askerId, SHOWN_ANSWER_CHARS)
		: outcomeLine(question, askerId, SHOWN_ANSWER_CHARS);
	const buttons = open ? [
		...question.options.map((option, index) => ({
			type: "button",
			action_id: `${ANSWER_ACTION_PREFIX}${index}`,
			text: { type: "plain_text", text: option },
			value: answerValue(threadTs, turnId, question.n, index),
		})),
		...(question.other ? [{ type: "button", action_id: OTHER_ACTION_ID, text: { type: "plain_text", text: "Other…" }, value: answerValue(threadTs, turnId, question.n, "other") }] : []),
	] : [];
	return {
		text: `${question.text}\n${outcome}`,
		blocks: [
			{ type: "section", text: { type: "mrkdwn", text: question.text } },
			...(buttons.length ? [{ type: "actions", block_id: `question_${question.n}`, elements: buttons }] : []),
			{ type: "context", elements: [{ type: "mrkdwn", text: open && question.other ? `${outcome} You can also reply in this thread.` : outcome }] },
		],
	};
}

/** Where a question's message is, and whose question it is. */
export type QuestionTarget = { channel: string; threadTs: string; turnId: number; askerId: string };

/** Shows the question as it is now on its message (the buttons, or what became of it). Safe to repeat. */
export async function updateQuestionMessage(slack: SlackClient, target: QuestionTarget, question: QuestionState): Promise<boolean> {
	if (!question.ts) return false;
	const message = questionMessage(question, target.askerId, target.threadTs, target.turnId);
	const updated = await slack.call("chat.update", { channel: target.channel, ts: question.ts, text: message.text, blocks: message.blocks });
	return updated.ok;
}

/** The Other form: the question and a box for their own answer. */
export function otherAnswerView(question: Pick<QuestionState, "text">, metadata: string) {
	return {
		type: "modal",
		callback_id: OTHER_VIEW_ID,
		private_metadata: metadata,
		title: { type: "plain_text", text: "Your answer" },
		submit: { type: "plain_text", text: "Send" },
		close: { type: "plain_text", text: "Cancel" },
		blocks: [
			{ type: "section", text: { type: "mrkdwn", text: shorten(question.text, 3_000) } },
			{
				type: "input",
				block_id: OTHER_INPUT_ID,
				label: { type: "plain_text", text: "Your answer" },
				element: { type: "plain_text_input", action_id: OTHER_INPUT_ID, multiline: true, max_length: MAX_OWN_ANSWER_CHARS },
			},
			{ type: "context", elements: [{ type: "mrkdwn", text: "Your answer is shown under the question in the thread." }] },
		],
	};
}

/** The Other form's private metadata: where the question is. */
export function otherViewMetadata(channel: string, ref: Omit<AnswerRef, "choice">): string {
	return `${channel}|${ref.threadTs}|${ref.turnId}|${ref.n}`;
}

export function parseOtherViewMetadata(value: string | undefined): { channel: string } & Omit<AnswerRef, "choice"> | null {
	const [channel, ...rest] = (value ?? "").split("|");
	const ref = parseAnswerValue(`${rest.join("|")}|other`);
	return channel && /^[CDG][A-Z0-9]{2,31}$/.test(channel) && ref ? { channel, threadTs: ref.threadTs, turnId: ref.turnId, n: ref.n } : null;
}

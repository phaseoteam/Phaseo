import { describe, expect, it } from "vitest";
import {
	answerOutput,
	answerValue,
	askQuestionTool,
	otherViewMetadata,
	parseAnswerValue,
	parseOtherViewMetadata,
	parseQuestion,
	questionMemory,
	questionMessage,
	type QuestionDraft,
	type QuestionState,
} from "../src/questions";

const THREAD_TS = "1792600000.000100";

function state(overrides: Partial<QuestionState> = {}): QuestionState {
	return { n: 1, callId: "call_q1", text: "Ship *today*?", options: ["Yes", "No"], other: false, status: "open", ts: "1792600100.000002", expiresAt: 0, answer: null, leg: null, ...overrides };
}

const call = (tool: ReturnType<typeof askQuestionTool>, input: unknown, stepIndex = 0, id = "call_1") =>
	tool.onToolCalled!(input, { stepIndex, toolCall: { id, name: "ask_question", input } } as never);

describe("ask_question", () => {
	it("takes a short question with 2 to 5 short, different options", () => {
		expect(parseQuestion({ question: " Which region? ", options: [" EU ", "US\n east"], allow_other: true })).toEqual({ text: "Which region?", options: ["EU", "US east"], other: true });
		expect(parseQuestion({ question: "Which?", options: ["A"] })).toEqual({ error: "options must be a list of 2 to 5 short options" });
		expect(parseQuestion({ question: "Which?", options: ["A", "B", "C", "D", "E", "F"] })).toEqual({ error: "options must be a list of 2 to 5 short options" });
		expect(parseQuestion({ question: "Which?", options: ["A", "x".repeat(76)] })).toEqual({ error: "each option must be 1 to 75 characters" });
		expect(parseQuestion({ question: "Which?", options: ["Yes", "yes"] })).toEqual({ error: "options must be different from one another" });
		expect(parseQuestion({ question: "", options: ["A", "B"] })).toEqual({ error: "question must be a short question" });
		expect(parseQuestion({ question: "x".repeat(301), options: ["A", "B"] })).toEqual({ error: "question must be at most 300 characters" });
		expect(parseQuestion(null)).toEqual({ error: "question must be a short question" });
	});

	it("pauses the run for the first question only, and tells the model why when it can't ask", async () => {
		const asked: QuestionDraft[] = [];
		let refusal: string | null = null;
		const tool = askQuestionTool({ refusal: () => refusal, onAsk: (question) => { asked.push(question); } });
		// A mistake goes back to the model, without pausing.
		expect(await call(tool, { question: "Which?", options: ["A"] })).toEqual({ asked: false, error: "options must be a list of 2 to 5 short options" });
		refusal = "no steps left";
		expect(await call(tool, { question: "Which?", options: ["A", "B"] })).toEqual({ asked: false, error: "no steps left" });
		refusal = null;
		// Null: the SDK keeps the run waiting for this call's output.
		expect(await call(tool, { question: "Which?", options: ["A", "B"] }, 3, "call_2")).toBeNull();
		expect(await call(tool, { question: "And this?", options: ["C", "D"] }, 3, "call_3")).toMatchObject({ asked: false, error: expect.stringContaining("one question at a time") });
		expect(asked).toEqual([{ callId: "call_2", text: "Which?", options: ["A", "B"], other: false }]);
	});

	it("hands the run the option chosen, or their own words", () => {
		expect(answerOutput(state({ answer: { by: "button", choice: 1, text: "No" } }))).toEqual({ answered: true, answer: "No" });
		expect(answerOutput(state({ answer: { by: "form", choice: null, text: "Tomorrow" } }))).toEqual({ answered: true, answer: "Tomorrow", in_their_own_words: true });
		expect(answerOutput(state({ answer: { by: "message", choice: null, text: "Friday" } }))).toEqual({ answered: true, answer: "Friday", in_their_own_words: true });
		expect(answerOutput(state())).toEqual({ answered: false });
	});
});

describe("the question's message", () => {
	it("has a button per option, Other when allowed, and says who can answer", () => {
		const message = questionMessage(state({ other: true }), "U0PERSON01", THREAD_TS, 7);
		expect(message.text).toBe("Ship *today*?\nOnly <@U0PERSON01> can answer. This question expires in an hour.");
		expect(message.blocks).toEqual([
			{ type: "section", text: { type: "mrkdwn", text: "Ship *today*?" } },
			{
				type: "actions",
				block_id: "question_1",
				elements: [
					{ type: "button", action_id: "question_answer_0", text: { type: "plain_text", text: "Yes" }, value: `${THREAD_TS}|7|1|0` },
					{ type: "button", action_id: "question_answer_1", text: { type: "plain_text", text: "No" }, value: `${THREAD_TS}|7|1|1` },
					{ type: "button", action_id: "question_other", text: { type: "plain_text", text: "Other…" }, value: `${THREAD_TS}|7|1|other` },
				],
			},
			{ type: "context", elements: [{ type: "mrkdwn", text: "Only <@U0PERSON01> can answer. This question expires in an hour. You can also reply in this thread." }] },
		]);
	});

	it("drops the buttons once it's answered, expired or stopped, and says which", () => {
		const outcome = (question: QuestionState) => {
			const message = questionMessage(question, "U0PERSON01", THREAD_TS, 7);
			expect(JSON.stringify(message.blocks)).not.toContain("button");
			return message.text.split("\n")[1];
		};
		expect(outcome(state({ status: "answered", answer: { by: "button", choice: 0, text: "Yes" } }))).toBe("<@U0PERSON01> chose: Yes");
		expect(outcome(state({ status: "answered", answer: { by: "form", choice: null, text: `a <b> & ${"c".repeat(600)}` } }))).toBe(`<@U0PERSON01> answered: a &lt;b&gt; &amp; ${"c".repeat(499 - "a &lt;b&gt; &amp; ".length)}…`);
		expect(outcome(state({ status: "answered", answer: { by: "message", choice: null, text: "Later" } }))).toBe("<@U0PERSON01> answered in the thread: Later");
		expect(outcome(state({ status: "expired" }))).toBe("No answer within an hour, so I stopped here. Ask me again when you're ready.");
		expect(outcome(state({ status: "cancelled" }))).toBe("Stopped before an answer.");
	});

	it("is remembered with what became of it", () => {
		expect(questionMemory(state({ other: true, status: "answered", answer: { by: "button", choice: 1, text: "No" } }), "U0PERSON01"))
			.toBe("You asked <@U0PERSON01>: Ship *today*? (options: Yes, No, or their own answer). <@U0PERSON01> chose: No");
	});

	it("reads back only the button values and form metadata it wrote", () => {
		expect(parseAnswerValue(answerValue(THREAD_TS, 7, 2, 4))).toEqual({ threadTs: THREAD_TS, turnId: 7, n: 2, choice: 4 });
		expect(parseAnswerValue(answerValue(THREAD_TS, 7, 2, "other"))).toEqual({ threadTs: THREAD_TS, turnId: 7, n: 2, choice: "other" });
		for (const value of [undefined, "", `${THREAD_TS}|7|1|5`, `${THREAD_TS}|0|1|0`, `${THREAD_TS}|7|1|0|x`, `nope|7|1|0`, `${THREAD_TS}|7|10|0`]) {
			expect(parseAnswerValue(value), String(value)).toBeNull();
		}
		const metadata = otherViewMetadata("C0CHANNEL1", { threadTs: THREAD_TS, turnId: 7, n: 1 });
		expect(parseOtherViewMetadata(metadata)).toEqual({ channel: "C0CHANNEL1", threadTs: THREAD_TS, turnId: 7, n: 1 });
		expect(parseOtherViewMetadata(`x${metadata}`)).toBeNull();
		expect(parseOtherViewMetadata(undefined)).toBeNull();
	});
});

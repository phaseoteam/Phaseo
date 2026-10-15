import { describe, expect, it } from "vitest";
import { allowsOwnAnswer, formQuestionAnswer, formQuestions, questionAnswerError, questionOptions } from "./agentQuestions";
import type { AgentForm } from "./agentForms";
import { formAnswerError } from "./agentForms";
import type { AgentQuestion } from "./workspace";
import { validateCommand } from "./workspace";

const base = { id: "q", header: "Header", question: "Question?" };
describe("agent question answers", () => {
	it("requires an answer unless the question is optional or has editable starting text", () => {
		expect(questionAnswerError({ ...base, isOther: true }, [])).toBe("Answer this question.");
		expect(questionAnswerError({ ...base, isOther: true }, ["  "])).toBe("Answer this question.");
		expect(questionAnswerError({ ...base, required: false }, [""])).toBeUndefined();
		expect(questionAnswerError({ ...base, required: false }, [])).toBeUndefined();
		expect(questionAnswerError({ ...base, initialAnswer: "draft" }, [""])).toBeUndefined();
		expect(questionAnswerError({ ...base, initialAnswer: "draft" }, ["  keep spacing  "])).toBeUndefined();
	});
	it("matches options by value and refuses own answers where none are allowed", () => {
		const question: AgentQuestion = { ...base, options: [{ label: "Empty value", value: "" }, { label: "Blue" }] };
		expect(questionAnswerError(question, [""])).toBeUndefined();
		expect(questionAnswerError(question, ["Blue"])).toBeUndefined();
		expect(questionAnswerError(question, ["Green"])).toBe("Choose one of the options.");
		expect(questionAnswerError(question, ["Blue", ""])).toBe("Choose one answer.");
		expect(questionAnswerError({ ...question, multiSelect: true }, ["Blue", "Blue"])).toBe("Each answer must be different.");
		expect(questionAnswerError({ ...question, isOther: true }, ["Green"])).toBeUndefined();
	});
	it("checks typed answers", () => {
		const typed = (input: AgentQuestion["input"]) => ({ ...base, input });
		expect(questionAnswerError(typed({ kind: "number", min: 1, max: 5 }), ["0"])).toBe("Enter 1 or more.");
		expect(questionAnswerError(typed({ kind: "number", min: 1, max: 5 }), ["6"])).toBe("Enter 5 or less.");
		expect(questionAnswerError(typed({ kind: "number" }), ["2.5"])).toBeUndefined();
		expect(questionAnswerError(typed({ kind: "integer" }), ["2.5"])).toBe("Enter a whole number.");
		expect(questionAnswerError(typed({ kind: "number" }), ["two"])).toBe("Enter a number.");
		expect(questionAnswerError(typed({ kind: "email" }), ["a@b.co"])).toBeUndefined();
		expect(questionAnswerError(typed({ kind: "email" }), ["nobody"])).toBe("Enter an email address.");
		expect(questionAnswerError(typed({ kind: "uri" }), ["https://phaseo.app"])).toBeUndefined();
		expect(questionAnswerError(typed({ kind: "uri" }), ["phaseo"])).toBe("Enter a full web address.");
		expect(questionAnswerError(typed({ kind: "date" }), ["2026-02-31"])).toBe("Enter a date.");
		expect(questionAnswerError(typed({ kind: "date-time" }), ["2026-10-16T09:30"])).toBeUndefined();
		expect(questionAnswerError(typed({ kind: "text", minLength: 3, maxLength: 4 }), ["ab"])).toBe("Use at least 3 characters.");
		expect(questionAnswerError(typed({ kind: "multiline", maxLength: 4 }), ["abcde"])).toBe("Use at most 4 characters.");
	});
	it("offers Yes and No for a yes-or-no question and no own answer", () => {
		const question: AgentQuestion = { ...base, input: { kind: "boolean" } };
		expect(questionOptions(question).map(option => option.value)).toEqual(["true", "false"]);
		expect(allowsOwnAnswer(question)).toBe(false);
		expect(questionAnswerError(question, ["true"])).toBeUndefined();
		expect(questionAnswerError(question, ["maybe"])).toBe("Choose one of the options.");
	});
	it("lets the answer command carry empty answers for the runtime to check", () => {
		expect(() => validateCommand({ type: "answer", id: "task", requestId: "request", answers: { q: [""] } })).not.toThrow();
		expect(() => validateCommand({ type: "answer", id: "task", requestId: "request", answers: { q: [] } })).not.toThrow();
		expect(() => validateCommand({ type: "answer", id: "task", answers: {}, dismissed: true } as never)).toThrow();
		expect(() => validateCommand({ type: "approval", id: "task", approvalId: "a", decision: "decline", feedback: "Smaller steps" })).not.toThrow();
		expect(() => validateCommand({ type: "approval", id: "task", approvalId: "a", decision: "accept", feedback: "No" })).toThrow();
		expect(() => validateCommand({ type: "approval", id: "task", approvalId: "a", decision: "always" })).not.toThrow();
		expect(() => validateCommand({ type: "approval", id: "task", approvalId: "a", decision: "maybe" } as never)).toThrow();
	});
});

describe("forms as questions", () => {
	const form: AgentForm = { id: "form", title: "Deploy settings", fields: [
		{ key: "region", type: "string", title: "Region", required: true, options: [{ value: "eu", label: "Europe" }, { value: "us", label: "United States", description: "Virginia" }] },
		{ key: "note", type: "string", title: "Note", default: "none" },
		{ key: "replicas", type: "integer", title: "Replicas", description: "How many copies?", minimum: 1, maximum: 3, required: true },
		{ key: "public", type: "boolean", title: "Public", required: true },
		{ key: "checks", type: "multiselect", title: "Checks", options: [{ value: "lint", label: "Lint" }, { value: "tests", label: "Tests" }], custom: true },
		{ key: "when", type: "string", title: "When", format: "date-time" },
	] };
	it("maps options, typed inputs and optional fields", () => {
		const questions = formQuestions(form, ["string", "number", "integer", "boolean", "multiselect"], "Choose deploy settings")!;
		expect(questions.map(question => question.id)).toEqual(["region", "note", "replicas", "public", "checks", "when"]);
		expect(questions[0]).toMatchObject({ header: "Region", question: "Choose deploy settings", isOther: false, options: [{ label: "Europe", value: "eu" }, { label: "United States", value: "us", description: "Virginia" }] });
		expect(questions[0].required).toBeUndefined();
		expect(questions[1]).toMatchObject({ required: false, isOther: true, initialAnswer: "none", input: { kind: "text" } });
		expect(questions[2]).toMatchObject({ question: "How many copies?", input: { kind: "integer", min: 1, max: 3 } });
		expect(questions[3]).toMatchObject({ input: { kind: "boolean" } });
		expect(questions[4]).toMatchObject({ multiSelect: true, isOther: true, required: false });
		expect(questions[5]).toMatchObject({ input: { kind: "date-time" } });
	});
	it("keeps OpenCode to text and multi-select fields, and refuses links, hidden and conditional fields", () => {
		expect(formQuestions(form, ["string", "multiselect"])).toBeUndefined();
		expect(formQuestions({ id: "f", title: "T", fields: [{ key: "a", type: "string" }, { key: "b", type: "multiselect", options: [{ value: "x", label: "X" }] }] }, ["string", "multiselect"])).toHaveLength(2);
		expect(formQuestions({ id: "f", title: "T", fields: [{ key: "a", type: "string", hidden: true }] }, ["string"])).toBeUndefined();
		expect(formQuestions({ id: "f", title: "T", fields: [{ key: "a", type: "string", when: [{ key: "b", op: "eq", value: "x" }] }] }, ["string"])).toBeUndefined();
		expect(formQuestions({ id: "f", title: "T", fields: [{ key: "a", type: "external", url: "https://example.com" }] }, ["string"])).toBeUndefined();
	});
	it("turns answers back into a valid form answer", () => {
		const answer = formQuestionAnswer(form, { region: ["us"], note: [""], replicas: ["2"], public: ["false"], checks: ["lint", "security"], when: ["2026-10-16T09:30"] });
		expect(answer).toMatchObject({ region: "us", replicas: 2, public: false, checks: ["lint", "security"] });
		expect(Object.hasOwn(answer, "note")).toBe(false);
		expect(answer.when).toBe(new Date("2026-10-16T09:30").toISOString());
		expect(formAnswerError(form, answer)).toBeUndefined();
	});
});

import { describe, expect, it } from "vitest";
import { draftAnswer, draftError, draftFor, withOwnAnswer } from "./questionDraft";
import type { AgentQuestion } from "../../shared/workspace";

const base: AgentQuestion = { id: "q", header: "Header", question: "Question?", isOther: true, options: [{ label: "Blue" }, { label: "Red", value: "red" }] };
describe("question drafts", () => {
	it("sends option values and lets the own answer replace a single choice", () => {
		expect(draftAnswer(base, { picked: ["red"], other: "", otherOn: false })).toEqual(["red"]);
		expect(draftAnswer(base, { picked: [], other: "  Green ", otherOn: true })).toEqual(["Green"]);
		expect(draftAnswer({ ...base, multiSelect: true }, { picked: ["Blue", "red"], other: "Green", otherOn: true })).toEqual(["Blue", "red", "Green"]);
		expect(draftError(base, { picked: [], other: "", otherOn: false })).toBe("Answer this question.");
	});
	it("prefills editable starting text, keeps its whitespace and allows it empty", () => {
		const editor: AgentQuestion = { id: "e", header: "Edit", question: "Edit the text", options: [], initialAnswer: "  draft\n", input: { kind: "multiline" } };
		const draft = draftFor(editor);
		expect(draft).toEqual({ picked: [], other: "  draft\n", otherOn: true });
		expect(draftAnswer(editor, draft)).toEqual(["  draft\n"]);
		expect(draftAnswer(editor, { ...draft, other: "" })).toEqual([""]);
		expect(draftError(editor, { ...draft, other: "" })).toBeUndefined();
	});
	it("sends an empty answer for an optional question left blank", () => {
		const optional: AgentQuestion = { id: "o", header: "Input", question: "Name?", required: false, options: [{ label: "Submit empty value", value: "" }], isOther: true };
		expect(draftAnswer(optional, draftFor(optional))).toEqual([""]);
		expect(draftError(optional, draftFor(optional))).toBeUndefined();
		expect(draftAnswer(optional, { picked: [""], other: "", otherOn: false })).toEqual([""]);
		expect(draftAnswer(optional, { picked: [], other: "Ada", otherOn: true })).toEqual(["Ada"]);
	});
	it("takes the composer's text as the own answer", () => {
		expect(draftAnswer(base, withOwnAnswer(base, { picked: ["Blue"], other: "", otherOn: false }, "Green"))).toEqual(["Green"]);
		const multi = { ...base, multiSelect: true };
		expect(draftAnswer(multi, withOwnAnswer(multi, { picked: ["Blue"], other: "", otherOn: false }, "Green"))).toEqual(["Blue", "Green"]);
	});
	it("checks typed own answers", () => {
		const number: AgentQuestion = { id: "n", header: "Count", question: "How many?", input: { kind: "integer", min: 1 } };
		expect(draftError(number, { picked: [], other: "0", otherOn: true })).toBe("Enter 1 or more.");
		expect(draftError(number, { picked: [], other: "3", otherOn: true })).toBeUndefined();
	});
});

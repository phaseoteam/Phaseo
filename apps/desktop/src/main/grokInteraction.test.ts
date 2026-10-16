import { describe, expect, it } from "vitest";
import { grokPlanRequest, grokQuestionRequest, grokQuestionResponse } from "./grokInteraction";

const request = { sessionId: "native", toolCallId: "question", mode: "default", questions: [{ id: "choice", question: "Choose", options: [{ label: "A", preview: "Proposed A" }, { label: "B" }] }] };
describe("Grok interactive requests", () => {
	it("returns a selected preview and cancels ambiguous single-choice answers", () => {
		const { questions } = grokQuestionRequest(request);
		expect(grokQuestionResponse(questions, { choice: ["A"] })).toEqual({ outcome: "accepted", answers: { Choose: ["A"] }, annotations: { Choose: { preview: "Proposed A" } } });
		const invalid: Record<string, string[]>[] = [{}, { choice: [] }, { choice: ["A", "B"] }, { choice: [" "] }];
		for (const answers of invalid) expect(grokQuestionResponse(questions, answers)).toEqual({ outcome: "cancelled" });
	});
	it("rejects duplicate identities, choices and incorrect wrappers before showing a form", () => {
		expect(() => grokQuestionRequest({ ...request, questions: [request.questions[0], request.questions[0]] })).toThrow("Duplicate");
		expect(() => grokQuestionRequest({ ...request, questions: [{ ...request.questions[0], options: [{ label: "A" }, { label: "A" }] }] })).toThrow("Duplicate");
		expect(() => grokQuestionRequest({ method: "unrelated", params: request })).toThrow("method");
	});
	it("treats prototype-like question identities as ordinary own keys", () => {
		const { questions } = grokQuestionRequest({ ...request, questions: [{ id: "__proto__", question: "__proto__", options: [{ label: "A" }] }] });
		expect(grokQuestionResponse(questions, {})).toEqual({ outcome: "cancelled" });
		const response = grokQuestionResponse(questions, Object.fromEntries([["__proto__", ["A"]]]));
		expect(JSON.parse(JSON.stringify(response))).toEqual(JSON.parse('{"outcome":"accepted","answers":{"__proto__":["A"]}}'));
	});
	it("bounds native question payloads and plan content", () => {
		expect(() => grokQuestionRequest({ ...request, questions: Array.from({ length: 101 }, (_, index) => ({ id: String(index), question: String(index), options: [] })) })).toThrow("questions");
		expect(() => grokPlanRequest({ sessionId: "native", toolCallId: "plan", planContent: "x".repeat(100001) })).toThrow("plan");
		expect(grokPlanRequest({ sessionId: "native", toolCallId: "plan", planContent: "  " }).plan).toBe("");
	});
});

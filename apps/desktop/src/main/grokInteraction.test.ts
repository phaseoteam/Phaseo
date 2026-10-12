import { describe, expect, it } from "vitest";
import { grokPlanRequest, grokPlanReview, grokPlanReviewResponse, grokQuestionRequest, grokQuestionResponse } from "./grokInteraction";

const request = { sessionId: "native", toolCallId: "question", mode: "default", questions: [{ id: "choice", question: "Choose", options: [{ label: "A", preview: "Proposed A" }, { label: "B" }] }] };
describe("Grok interactive requests", () => {
	it("offers bounded plan previews and returns explicit implementation, cancellation or revisions", () => {
		expect(grokPlanReview("x".repeat(10001)).options?.[0].preview).toHaveLength(10000);
		expect(grokPlanReviewResponse({ "grok-plan-review": ["Implement plan"] })).toEqual({ outcome: "approved" });
		expect(grokPlanReviewResponse({ "grok-plan-review": ["Cancel"] })).toEqual({ outcome: "abandoned" });
		expect(grokPlanReviewResponse({ "grok-plan-review": ["  Add migration validation.  "] })).toEqual({ outcome: "request_changes", feedback: "Add migration validation." });
	});
	it("cannot approve malformed, inherited or ambiguous plan-review answers", () => {
		for (const answers of [{}, { "grok-plan-review": [] }, { "grok-plan-review": ["Implement plan", "Cancel"] }, { "grok-plan-review": [" "] }, { "grok-plan-review": ["x".repeat(10001)] }, Object.create({ "grok-plan-review": ["Implement plan"] })]) expect(grokPlanReviewResponse(answers)).toEqual({ outcome: "abandoned" });
	});
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

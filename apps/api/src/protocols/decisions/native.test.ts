import { describe, expect, it } from "vitest";
import { DecisionsSchema } from "@core/schemas";
import { decodeDecisionsRequest, decodeNativeDecisionAnswer } from "./decode";
import { encodeDecisionsResponse } from "./encode";

const body = {
	model: "typesafe/jev-1.13.0", input: "Customer",
	questions: [
		{ type: "predicate", instructions: "Eligible?" },
		{ type: "choice", name: "route", instructions: "Select", choices: [
			{ value: true, description: "Allowed" }, { value: "true", description: "Review" }, { value: false },
		] },
		{ type: "score", name: "route", instructions: "Rate", levels: [
			{ label: "Low", description: "Minor impact" }, { label: "High", description: "Major impact" },
		] },
	],
};
describe("OpenAI Decisions wire format", () => {
	it("normalizes ordered, repeated-name and typed-value questions for System One providers", () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse(body));
		expect(ir.state).toBe("Customer");
		expect(ir.questions.question_0).toEqual({ type: "noul", instructions: "Eligible?" });
		expect(ir.questions.question_1.criteria).toEqual({ "0": "true: Allowed", "1": "true: Review", "2": "false" });
		expect(ir.questions.question_2.criteria).toEqual(["Low: Minor impact", "High: Major impact"]);
		const response = encodeDecisionsResponse({
			model: ir.model, usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
			answers: {
				question_0: { type: "noul", noul: 0.9 },
				question_1: { type: "choice", choice: "0", confidence: 0.8, probabilities: { "0": 0.8, "1": 0.1, "2": 0.1 } },
				question_2: { type: "score", score: 0.7, confidence: 0.4, probabilities: { "0": 0.3, "1": 0.7 } },
			},
		}, ir);
		expect(response.answers).toEqual([
			{ type: "predicate", name: null, probability: 0.9 },
			{ type: "choice", name: "route", choice: true, confidence: 0.8, probabilities: [
				{ value: true, probability: 0.8 }, { value: "true", probability: 0.1 }, { value: false, probability: 0.1 },
			] },
			{ type: "score", name: "route", score: 0.7, confidence: 0.4, probabilities: [
				{ value: 0, label: "Low", probability: 0.3 }, { value: 1, label: "High", probability: 0.7 },
			] },
		]);
	});
	it("retains legacy request and response shapes", () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ state: { plan: "pro" }, questions: { ready: { type: "noul", instructions: "Ready?" } } }));
		expect(ir.decisionContext).toBeUndefined();
		expect(encodeDecisionsResponse({ model: ir.model, answers: { ready: { type: "noul", noul: 0.8 } } }, ir).answers)
			.toEqual({ ready: { type: "noul", noul: 0.8 } });
	});
	it("preserves image order and the exact native evidence", () => {
		const input = [{ role: "user", content: [{ type: "input_text", text: "Before" }, { type: "input_image", image_url: "data:image/png;base64,AQID", detail: "original" }, { type: "input_text", text: "After" }] }];
		const ir = decodeDecisionsRequest(DecisionsSchema.parse({ ...body, input }));
		expect(ir.images).toEqual(["data:image/png;base64,AQID"]);
		expect(ir.state).toEqual([{ role: "user", content: "Before\n[Image 0]\nAfter" }]);
		expect(ir.decisionContext?.input).toEqual(input);
	});
	it("does not invent probabilities for label-only answers", () => {
		const ir = decodeDecisionsRequest(DecisionsSchema.parse(body));
		expect(() => encodeDecisionsResponse({ model: ir.model, answers: { question_0: { answer: "yes" } } }, ir)).toThrow("invalid_decisions_response");
	});
	it("keeps boolean and string values distinct when validating upstream answers", () => {
		const question = body.questions[1] as any;
		expect(decodeNativeDecisionAnswer({ type: "choice", name: "route", choice: "true", confidence: 0.8, probabilities: [
			{ value: true, probability: 0.1 }, { value: "true", probability: 0.8 }, { value: false, probability: 0.1 },
		] }, question)?.choice).toBe("1");
	});
});

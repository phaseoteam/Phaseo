import { shouldShowEvaluationPrompts } from "./chatConversationPrompts";

describe("shouldShowEvaluationPrompts", () => {
	it("shows prompts for a new untouched thread", () => {
		expect(shouldShowEvaluationPrompts(0, false)).toBe(true);
	});

	it("hides prompts immediately after submitting a message", () => {
		expect(shouldShowEvaluationPrompts(0, true)).toBe(false);
	});

	it("hides prompts once a thread has messages", () => {
		expect(shouldShowEvaluationPrompts(1, false)).toBe(false);
	});
});

import { buildFeedbackAnswers, FEEDBACK_REASONS, feedbackApiPath, isFeedbackToken } from "./feedbackRequests";
import feedbackMessages from "../../messages/en-GB/feedback.json";

describe("feedback requests", () => {
	it("recognises only UUID tokens", () => {
		expect(isFeedbackToken("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
		expect(isFeedbackToken("../admin")).toBe(false);
		expect(feedbackApiPath("0f8fad5b-d9cb-469f-a165-70867728950e", "unsubscribe")).toBe(
			"/api/_web/feedback/0f8fad5b-d9cb-469f-a165-70867728950e/unsubscribe",
		);
	});

	it("requires the first question and drops empty optional answers", () => {
		const empty = { reason: null, details: "", nps: null, likes: "", improve: "" };
		expect(buildFeedbackAnswers("used_not_paid", empty)).toBeNull();
		expect(buildFeedbackAnswers("paid", empty)).toBeNull();
		expect(buildFeedbackAnswers("used_not_paid", { ...empty, reason: "pricing_unclear", details: "  " })).toEqual({
			reason: "pricing_unclear",
		});
		expect(buildFeedbackAnswers("paid", { ...empty, nps: 0, improve: " Batch API " })).toEqual({
			nps: 0,
			improve: "Batch API",
		});
	});

	it("has a label for every reason offered", () => {
		for (const reasons of Object.values(FEEDBACK_REASONS)) {
			for (const reason of reasons) expect(feedbackMessages.reasons[reason]).toBeTruthy();
		}
	});
});

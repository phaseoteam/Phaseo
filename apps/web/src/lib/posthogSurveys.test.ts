import { toPosthogSurveyEvent } from "./posthogSurveys";

describe("toPosthogSurveyEvent", () => {
	it("maps shown and dismissed actions to PostHog survey events", () => {
		expect(toPosthogSurveyEvent({ surveyId: "s1", action: "shown", properties: { surface: "x" } })).toEqual({
			event: "survey shown",
			properties: { surface: "x", $survey_id: "s1" },
		});
		expect(toPosthogSurveyEvent({ surveyId: "s1", action: "dismissed" }).event).toBe("survey dismissed");
	});

	it("records each answer as a survey response keyed by question ID", () => {
		expect(
			toPosthogSurveyEvent({
				surveyId: "s1",
				action: "sent",
				answers: [
					{ questionId: "q1", question: "Why?", response: "Pricing is unclear" },
					{ questionId: "q2", question: "Details", response: "Too many plans" },
				],
			}),
		).toEqual({
			event: "survey sent",
			properties: {
				$survey_id: "s1",
				$survey_questions: [
					{ id: "q1", index: 0, question: "Why?" },
					{ id: "q2", index: 1, question: "Details" },
				],
				$survey_response_q1: "Pricing is unclear",
				$survey_response_q2: "Too many plans",
			},
		});
	});
});

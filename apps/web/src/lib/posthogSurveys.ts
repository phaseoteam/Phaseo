import { isAnalyticsCaptureAllowed } from "@/lib/clientErrorReporting";

export const POSTHOG_SURVEY_EVENT = "phaseo:posthog-survey";

// API-type surveys defined in PostHog (eu.posthog.com, project 81404) and rendered by our own UI.
export const ZERO_BALANCE_BLOCKER_SURVEY = {
	id: "01a13587-a15f-0000-8dff-88d7db442f1a",
	reasonQuestionId: "21e9541b-b425-4050-bbfb-c989c51dd396",
	detailsQuestionId: "9c730ee2-a12c-4bca-8c1a-dfcaef4dbef4",
} as const;

export type PosthogSurveyAnswer = {
	questionId: string;
	question: string;
	response: string;
};

export type PosthogSurveyPayload = {
	surveyId: string;
	action: "shown" | "dismissed" | "sent";
	answers?: PosthogSurveyAnswer[];
	properties?: Record<string, string | number | boolean | null>;
};

/** Records an interaction with an API-type PostHog survey; dropped without consent. */
export function capturePosthogSurvey(payload: PosthogSurveyPayload): boolean {
	if (typeof window === "undefined" || !payload.surveyId || !isAnalyticsCaptureAllowed()) return false;

	window.dispatchEvent(
		new CustomEvent<PosthogSurveyPayload>(POSTHOG_SURVEY_EVENT, { detail: payload }),
	);
	return true;
}

/** Maps a payload onto PostHog's survey event names and response properties. */
export function toPosthogSurveyEvent(payload: PosthogSurveyPayload): {
	event: "survey shown" | "survey dismissed" | "survey sent";
	properties: Record<string, unknown>;
} {
	const properties: Record<string, unknown> = {
		...payload.properties,
		$survey_id: payload.surveyId,
	};
	if (payload.action !== "sent") {
		return {
			event: payload.action === "shown" ? "survey shown" : "survey dismissed",
			properties,
		};
	}

	const answers = payload.answers ?? [];
	properties.$survey_questions = answers.map((answer, index) => ({
		id: answer.questionId,
		index,
		question: answer.question,
	}));
	for (const answer of answers) {
		properties[`$survey_response_${answer.questionId}`] = answer.response;
	}
	return { event: "survey sent", properties };
}

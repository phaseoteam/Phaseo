export type FeedbackSegment = "never_requested" | "used_not_paid" | "paid";

export type FeedbackRequestView = {
	campaign: string;
	segment: FeedbackSegment;
	recency: "active" | "lapsed" | "dormant";
	responded: boolean;
	rewardCode: string | null;
	optedOut: boolean;
};

export type FeedbackSubmitResult = {
	status: "submitted" | "already_submitted";
	rewardStatus: "issued" | "budget_exhausted" | "none" | null;
	rewardCode: string | null;
};

export type FeedbackReason =
	| "setup_unclear"
	| "pricing_unclear"
	| "model_missing"
	| "model_choice_unclear"
	| "payment_issue"
	| "chose_alternative"
	| "just_exploring"
	| "not_ready_yet"
	| "other";

// Stable keys stored with each answer; the labels live in the feedback catalogs.
export const FEEDBACK_REASONS: Record<Exclude<FeedbackSegment, "paid">, FeedbackReason[]> = {
	never_requested: ["setup_unclear", "model_missing", "pricing_unclear", "chose_alternative", "just_exploring", "other"],
	used_not_paid: [
		"setup_unclear",
		"pricing_unclear",
		"model_choice_unclear",
		"model_missing",
		"payment_issue",
		"just_exploring",
		"not_ready_yet",
		"other",
	],
};

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFeedbackToken(value: string): boolean {
	return TOKEN_PATTERN.test(value);
}

export function feedbackApiPath(token: string, action?: "unsubscribe"): `/api/_web/${string}` {
	return `/api/_web/feedback/${encodeURIComponent(token)}${action ? `/${action}` : ""}`;
}

/** Builds the answers object the API stores; empty optional fields are left out. */
export function buildFeedbackAnswers(
	segment: FeedbackSegment,
	input: { reason: FeedbackReason | null; details: string; nps: number | null; likes: string; improve: string },
): Record<string, string | number> | null {
	const text = (value: string) => value.trim().slice(0, 4_000);
	if (segment === "paid") {
		if (input.nps === null) return null;
		return {
			nps: input.nps,
			...(text(input.likes) ? { likes: text(input.likes) } : {}),
			...(text(input.improve) ? { improve: text(input.improve) } : {}),
		};
	}
	if (!input.reason) return null;
	return { reason: input.reason, ...(text(input.details) ? { details: text(input.details) } : {}) };
}

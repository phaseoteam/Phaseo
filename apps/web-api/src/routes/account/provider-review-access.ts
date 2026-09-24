type ProviderReviewApplication = {
	application_type?: string | null;
	provider_review_status?: string | null;
} | null | undefined;

export function isProviderAccessBlockedByReview(input: {
	application: ProviderReviewApplication;
	fallbackReviewStatus?: string | null;
	linkStatus?: string | null;
}): boolean {
	const reviewStatus = input.application?.provider_review_status ?? input.fallbackReviewStatus;
	if (!reviewStatus || reviewStatus === "approved") return false;

	if (input.application?.application_type === "claim") {
		return input.linkStatus === "pending";
	}

	return true;
}

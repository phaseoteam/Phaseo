type ProviderReviewApplication = {
	application_type?: string | null;
	provider_review_status?: string | null;
	submitted_by?: string | null;
} | null | undefined;

export function latestApplicableProviderReviewApplication(
	applications: ProviderReviewApplication[] | null | undefined,
	linkOwnerUserId: string | null | undefined,
): ProviderReviewApplication {
	const rows = applications ?? [];
	if (!linkOwnerUserId) return rows[0];

	return rows.find((application) =>
		application?.application_type !== "claim"
		|| application.submitted_by === linkOwnerUserId,
	);
}

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

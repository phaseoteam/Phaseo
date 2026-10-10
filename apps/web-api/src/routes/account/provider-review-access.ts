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

/**
 * Reads a provider's application state and reports whether it still blocks catalog changes.
 * `link` is the provider account link acting on the catalog; claims stay locked while it is pending.
 */
export async function isProviderCatalogBlockedByReview(
	client: any,
	providerSlug: string,
	link: { status: string | null; linkedBy: string | null },
): Promise<boolean> {
	const [provider, applications] = await Promise.all([
		client.from("v2_providers").select("metadata").eq("provider_slug", providerSlug).maybeSingle(),
		client.from("provider_onboarding_submissions").select("application_type,provider_review_status,submitted_by").eq("provider_slug", providerSlug).order("created_at", { ascending: false }),
	]);
	if (provider.error) throw provider.error;
	if (applications.error) throw applications.error;
	return isProviderAccessBlockedByReview({
		application: latestApplicableProviderReviewApplication(applications.data ?? [], link.linkedBy),
		fallbackReviewStatus: provider.data?.metadata?.self_serve?.provider_review_status,
		linkStatus: link.status,
	});
}

// Internal-admin provider applications and model requests (cookies + web API).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadProviderReview = createServerFn({ method: "GET" }).handler(async () => {
	const [{ fetchInternalAuthStatus }, { fetchInternalProviderApplications, fetchProviderModelRequests }] = await Promise.all([
		import("@/lib/fetchers/internal/fetchInternalAuthStatus"),
		import("@/lib/fetchers/internal/fetchInternalProviderCatalogReviews"),
	]);
	// The route's beforeLoad redirects non-admins; refuse the data here too.
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn || !status.isAdmin) throw new Error("Internal admin access required.");
	const [applications, requests] = await Promise.all([fetchInternalProviderApplications(), fetchProviderModelRequests()]);
	return { applications, requests };
});

export const providerReviewQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-internal-provider-review"],
		queryFn: () => loadProviderReview(),
	});

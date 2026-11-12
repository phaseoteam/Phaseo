import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/** Whether the visitor is signed in (cookies), for the fork button. */
export const getMarketplaceAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchInternalAuthStatus } = await import("@/lib/fetchers/internal/fetchInternalAuthStatus");
	const authStatus = await fetchInternalAuthStatus();
	return { signedIn: authStatus.signedIn };
});

export const marketplaceAuthStatusQuery = () =>
	queryOptions({
		queryKey: ["marketplace-auth-status"],
		queryFn: () => getMarketplaceAuthStatus(),
	});

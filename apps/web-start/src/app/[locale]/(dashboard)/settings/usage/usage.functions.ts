// The private usage scope (signed-in user + accessible workspace from cookies).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadPrivateUsageScope = createServerFn({ method: "GET" }).handler(async () => {
	const { getPrivateUsageScope } = await import("@/lib/fetchers/internal/getPrivateUsageScope");
	return getPrivateUsageScope();
});

export const privateUsageScopeQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "private-usage-scope"],
		queryFn: () => loadPrivateUsageScope(),
	});

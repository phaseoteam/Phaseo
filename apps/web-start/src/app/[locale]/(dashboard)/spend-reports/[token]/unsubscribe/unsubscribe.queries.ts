import { queryOptions } from "@tanstack/react-query";
import { isSpendReportToken, spendReportApiPath, type SpendReportSubscriptionView } from "@/lib/spendReports";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";

/** The subscription behind an unsubscribe token; `unavailable` when the lookup failed (as the Next page caught it). */
export const spendReportSubscriptionQuery = (token: string) =>
	queryOptions({
		queryKey: ["spend-report-subscription", token],
		queryFn: async (): Promise<{ subscription: SpendReportSubscriptionView | null; unavailable: boolean }> => {
			let subscription: SpendReportSubscriptionView | null = null;
			let unavailable = false;
			if (isSpendReportToken(token)) {
				try {
					subscription = await fetchOptionalPublicWebApi<SpendReportSubscriptionView>(spendReportApiPath(token));
				} catch {
					unavailable = true;
				}
			}
			return { subscription, unavailable };
		},
	});

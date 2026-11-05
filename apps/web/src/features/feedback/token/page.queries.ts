import { queryOptions } from "@tanstack/react-query";
import { feedbackApiPath, isFeedbackToken, type FeedbackRequestView } from "@/lib/feedbackRequests";
import { fetchOptionalPublicWebApi } from "@/lib/web-api/client";

export const feedbackRequestQuery = (token: string) =>
	queryOptions({
		queryKey: ["feedback-request", token],
		queryFn: async () => {
			let request: FeedbackRequestView | null = null;
			let unavailable = false;
			if (isFeedbackToken(token)) {
				try {
					request = await fetchOptionalPublicWebApi<FeedbackRequestView>(feedbackApiPath(token));
				} catch {
					unavailable = true;
				}
			}
			return { request, unavailable };
		},
	});

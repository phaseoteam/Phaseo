"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import type { InternalModelDiscoveryReviewItem } from "@/lib/fetchers/internal/fetchInternalModelDiscoveryReviews";

export async function reviewModelDiscoveryItemAction(input: {
	itemId: string;
	decision: "in_progress" | "approved" | "rejected" | "snoozed";
	reason?: string;
}) {
	const context = await getServerAccountContext();
	return fetchInternalWebApi<{ ok: true; item: InternalModelDiscoveryReviewItem }>(
		`/api/internal/model-discovery/reviews/${encodeURIComponent(input.itemId)}`,
		context.accessToken,
		{
			method: "PATCH",
			body: JSON.stringify({ decision: input.decision, reason: input.reason }),
		},
	);
}

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";

export type InternalModelDiscoveryReviewItem = {
	id: string;
	dedupe_key: string;
	run_id: string | null;
	source: string;
	provider_id: string;
	provider_name: string;
	model_id: string;
	change_type: "added" | "removed";
	details: Record<string, unknown>;
	status: "pending" | "in_progress" | "approved" | "rejected" | "snoozed";
	first_detected_at: string;
	last_detected_at: string;
	reviewed_by: string | null;
	reviewed_at: string | null;
	review_note: string | null;
	created_at: string;
};

export async function fetchInternalModelDiscoveryReviews(): Promise<InternalModelDiscoveryReviewItem[]> {
	const context = await getServerAccountContext();
	const payload = await fetchInternalWebApi<{ items: InternalModelDiscoveryReviewItem[] }>(
		"/api/internal/model-discovery/reviews",
		context.accessToken,
	);
	return payload.items;
}

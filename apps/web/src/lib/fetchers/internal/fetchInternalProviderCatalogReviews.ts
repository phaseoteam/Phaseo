import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";

export type InternalProviderCatalogReview = {
	id: string;
	provider_slug: string;
	trigger: string;
	status: string;
	review_status: string;
	review_summary: Record<string, number> | null;
	catalog_url: string | null;
	catalog_sha256: string | null;
	model_count: number | null;
	error_message: string | null;
	started_at: string;
	completed_at: string | null;
	created_at: string;
	provider: { provider_slug: string; name: string; status: string } | null;
	models: Array<{
		run_id: string;
		provider_slug: string;
		model_slug: string;
		provider_model_slug: string;
		name: string;
		description: string | null;
		input_modalities: string[];
		output_modalities: string[];
		context_length: number | null;
		max_output_tokens: number | null;
		decision: "pending" | "approved" | "rejected" | "needs_changes";
		decision_reason: string | null;
		reviewed_at: string | null;
		created_at: string;
		capabilities: Array<{ id: string; parameters: string[] }>;
		candidate: null | { status: "pending_probe" | "probe_failed" | "probe_passed" | "promoted" | "rejected"; probe_summary: Record<string, unknown>; probed_at: string | null; promoted_at: string | null };
	}>;
};

export type InternalProviderApplication = {
	provider_slug: string;
	name: string;
	application_type: "new" | "claim";
	status: string;
	routable: boolean;
	routing_enabled: boolean;
	base_url: string | null;
	contact_user_id: string | null;
	contact_email: string | null;
	ownership_proof_method: string | null;
	ownership_proof_subject: string | null;
	ownership_verified_at: string | null;
	website_url: string | null;
	catalog_mode?: "managed" | "remote" | null;
	catalog_url?: string | null;
	application_model_count?: number | null;
	submitted_at?: string | null;
	review_status: "setup" | "awaiting_approval" | "approved" | "paused" | "rejected" | "needs_changes";
	review_reason: string | null;
	technical_ready: boolean;
	route_blockers?: Array<"endpoint" | "adapter" | "credentials" | "probe">;
	created_at: string;
	updated_at: string;
};

export type InternalProviderApplicationCursor = { createdAt: string; id: string };
export type InternalProviderApplicationsPage = {
	providers: InternalProviderApplication[];
	nextCursor: InternalProviderApplicationCursor | null;
};

export async function fetchInternalProviderCatalogReviews(): Promise<InternalProviderCatalogReview[]> {
	const context = await getServerAccountContext();
	const payload = await fetchInternalWebApi<{ reviews: InternalProviderCatalogReview[] }>(
		"/api/internal/provider-catalog/reviews",
		context.accessToken,
	);
	return payload.reviews;
}

export async function fetchInternalProviderApplications(cursor?: InternalProviderApplicationCursor): Promise<InternalProviderApplicationsPage> {
	const context = await getServerAccountContext();
	const query = cursor
		? `?beforeCreatedAt=${encodeURIComponent(cursor.createdAt)}&beforeId=${encodeURIComponent(cursor.id)}`
		: "";
	return fetchInternalWebApi<InternalProviderApplicationsPage>(
		`/api/internal/provider-catalog/providers${query}`,
		context.accessToken,
	);
}

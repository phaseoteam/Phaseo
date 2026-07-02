import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { sumTokens } from "@/lib/utils/sumTokens";

export type AppDetails = {
	id: string;
	title: string;
	url: string | null;
	image_url: string | null;
	workspace_id: string;
	is_active: boolean;
	is_public: boolean;
	last_seen: string;
	created_at: string;
	updated_at: string;
	total_tokens: number;
	total_requests: number;
};

function isMissingAppRollupRelation(error: unknown): boolean {
	const message =
		typeof error === "object" && error && "message" in error
			? String((error as { message?: unknown }).message ?? "")
			: String(error ?? "");

	return message.includes('relation "public.gateway_usage_rollup_daily_app" does not exist');
}

export async function getAppDetails(appId: string): Promise<AppDetails | null> {
	try {
		const supabase = createAdminClient();
		// Get app metadata
		const { data: app, error: appError } = await supabase
			.from("api_apps")
			.select("*")
			.eq("id", appId)
			.eq("is_public", true)
			.single();

		if (appError || !app) {
			console.error("Error fetching app details:", appError);
			return null;
		}

		// Get aggregated usage stats
		const { data: stats, error: statsError } = await supabase
			.from("gateway_usage_rollup_daily_app")
			.select("requests, success_requests, total_tokens")
			.eq("app_id", appId);

		if (statsError) {
			if (isMissingAppRollupRelation(statsError)) {
				const { data: requestRows, error: requestsError } = await supabase
					.from("gateway_requests")
					.select("usage, success")
					.eq("app_id", appId);

				if (requestsError) {
					console.error("Error fetching app stats fallback:", requestsError);
					return {
						...app,
						total_tokens: 0,
						total_requests: 0,
					};
				}

				let totalTokens = 0;
				let totalSuccessfulRequests = 0;

				for (const row of requestRows ?? []) {
					totalTokens += Math.max(0, Math.round(sumTokens((row as any)?.usage)));
					if ((row as any)?.success) {
						totalSuccessfulRequests += 1;
					}
				}

				return {
					...app,
					total_tokens: totalTokens,
					total_requests: totalSuccessfulRequests,
				};
			}

			console.error("Error fetching app stats:", statsError);
			return null;
		}

		// Calculate totals
		let totalTokens = 0;
		let totalSuccessfulRequests = 0;

		for (const row of stats || []) {
			totalTokens += Number((row as any)?.total_tokens ?? 0);
			totalSuccessfulRequests += Number((row as any)?.success_requests ?? 0);
		}

		return {
			...app,
			total_tokens: totalTokens,
			total_requests: totalSuccessfulRequests,
		};
	} catch (err) {
		console.error("Unexpected error fetching app details:", err);
		return null;
	}
}

export async function isPublicAppId(appId: string): Promise<boolean> {
	try {
		const supabase = createAdminClient();
		const { data, error } = await supabase
			.from("api_apps")
			.select("id")
			.eq("id", appId)
			.eq("is_public", true)
			.maybeSingle();

		if (error) {
			console.error("Error checking public app access:", error);
			return false;
		}

		return Boolean(data?.id);
	} catch (err) {
		console.error("Unexpected error checking public app access:", err);
		return false;
	}
}

export async function getAppDetailsCached(appId: string): Promise<AppDetails | null> {
	"use cache";

	cacheLife("days");
	cacheTag("data:app_details");
	cacheTag(`data:app_details:${appId}`);
	cacheTag("frontend:app-details");
	return getAppDetails(appId);
}

export async function getPublicAppIds(): Promise<string[]> {
	try {
		const supabase = createAdminClient();
		const { data, error } = await supabase
			.from("api_apps")
			.select("id")
			.eq("is_public", true);

		if (error) {
			console.error("Error fetching public app IDs:", error);
			return [];
		}

		return (data ?? [])
			.map((row) => String(row.id ?? "").trim())
			.filter(Boolean);
	} catch (err) {
		console.error("Unexpected error fetching public app IDs:", err);
		return [];
	}
}

export async function getPublicAppIdsCached(): Promise<string[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:public_apps");
	cacheTag("frontend:apps");
	return getPublicAppIds();
}

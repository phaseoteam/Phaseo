import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

const PAGE_SIZE = 5000;

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

function toRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function readUsageInt(usage: Record<string, unknown> | null, key: string): number {
	if (!usage) return 0;
	const raw = usage[key];
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function getTotalTokensFromUsage(usageValue: unknown): number {
	const usage = toRecord(usageValue);
	const directTotal =
		readUsageInt(usage, "total_tokens") || readUsageInt(usage, "tokens");
	if (directTotal > 0) return directTotal;

	return (
		readUsageInt(usage, "input_tokens") +
		readUsageInt(usage, "output_tokens") +
		readUsageInt(usage, "prompt_tokens") +
		readUsageInt(usage, "completion_tokens")
	);
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

		// Get usage stats directly from raw requests
		let totalTokens = 0;
		let totalRequests = 0;
		for (let offset = 0; ; offset += PAGE_SIZE) {
			const { data: requestRows, error: requestError } = await supabase
				.from("gateway_requests")
				.select("usage, success")
				.eq("app_id", appId)
				.order("created_at", { ascending: true })
				.range(offset, offset + PAGE_SIZE - 1);

			if (requestError) {
				console.error("Error fetching app stats from gateway_requests:", requestError);
				return null;
			}

			if (!Array.isArray(requestRows) || requestRows.length === 0) break;

			for (const row of requestRows) {
				const success = Boolean((row as any)?.success);
				if (!success) continue;
				totalRequests += 1;
				totalTokens += getTotalTokensFromUsage((row as any)?.usage);
			}

			if (requestRows.length < PAGE_SIZE) break;
		}

		return {
			...app,
			total_tokens: totalTokens,
			total_requests: totalRequests,
		};
	} catch (err) {
		console.error("Unexpected error fetching app details:", err);
		return null;
	}
}

export async function getAppDetailsCached(appId: string): Promise<AppDetails | null> {
	"use cache";

	cacheLife("days");
	cacheTag("data:app_details");
	cacheTag(`data:app_details:${appId}`);
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
	return getPublicAppIds();
}

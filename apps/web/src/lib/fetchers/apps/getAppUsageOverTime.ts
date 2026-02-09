import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";

export type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

function fromForRange(key: RangeKey): Date {
	const now = new Date();
	const d = new Date(now);
	if (key === "1h") d.setHours(now.getHours() - 1);
	else if (key === "1d") d.setDate(now.getDate() - 1);
	else if (key === "1w") d.setDate(now.getDate() - 7);
	else if (key === "4w") d.setDate(now.getDate() - 28);
	else if (key === "1m") d.setMonth(now.getMonth() - 1);
	else if (key === "1y") d.setFullYear(now.getFullYear() - 1);
	return d;
}

export type AppUsageRow = {
	created_at: string;
	usage: any;
	cost_nanos: number;
	model_id: string;
	provider: string;
	success: boolean;
};

export async function getAppUsageOverTime(
	appId: string,
	range: RangeKey = "4w"
): Promise<AppUsageRow[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:app_usage");
	cacheTag(`data:app_usage:${appId}`);
	cacheTag(`data:app_usage:${appId}:${range}`);

	const supabase = await createAdminClient();

	const from = fromForRange(range).toISOString();
	const nowIso = new Date().toISOString();

	const { data, error } = await supabase
		.from("gateway_requests")
		.select("created_at, usage, cost_nanos, model_id, provider, success")
		.eq("app_id", appId)
		.gte("created_at", from)
		.lte("created_at", nowIso)
		.order("created_at", { ascending: true });

	if (error) {
		console.error("Error fetching app usage:", error);
		return [];
	}

	return data || [];
}

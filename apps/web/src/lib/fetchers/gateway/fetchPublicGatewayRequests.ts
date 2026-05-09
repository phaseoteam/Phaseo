import { createAdminClient } from "@/utils/supabase/admin";

export type PublicGatewayRequestRow = {
	created_at: string | null;
	provider: string | null;
	success: boolean | null;
	usage: Record<string, unknown> | null;
	latency_ms?: number | string | null;
	model_id?: string | null;
};

const PAGE_SIZE = 1000;

export async function fetchPublicGatewayRequestRows(
	days: number,
	options: { successOnly?: boolean } = {},
): Promise<PublicGatewayRequestRow[]> {
	const supabase = createAdminClient();
	const windowDays = Number.isFinite(days) && days > 0 ? Math.round(days) : 30;
	const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
	const successOnly = options.successOnly ?? true;
	const rows: PublicGatewayRequestRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		let query = supabase
			.from("gateway_requests")
			.select("created_at, provider, success, usage, latency_ms, model_id")
			.gte("created_at", sinceIso)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (successOnly) {
			query = query.eq("success", true);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(error.message ?? "Failed to load public gateway requests");
		}

		const page = (data ?? []) as PublicGatewayRequestRow[];
		rows.push(...page);

		if (page.length < PAGE_SIZE) {
			break;
		}
	}

	return rows;
}

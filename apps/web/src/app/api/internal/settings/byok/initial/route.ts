import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type ByokKeyEntry = {
	alwaysUse: boolean;
	createdAt: string;
	enabled: boolean;
	id: string;
	name: string;
	prefix?: string;
	providerId: string;
	suffix?: string;
};

export type SettingsByokInitialData = {
	freeRemaining: number;
	keyEntries: ByokKeyEntry[];
	legacyHiddenTotal: number;
	monthlyRequestCount: number;
	nextMonthStartIso: string;
	paidTierRequests: number;
	workspaceId: string | null;
};

const BYOK_MONTHLY_FREE_REQUESTS = 100_000;

export async function GET() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			freeRemaining: BYOK_MONTHLY_FREE_REQUESTS,
			keyEntries: [],
			legacyHiddenTotal: 0,
			monthlyRequestCount: 0,
			nextMonthStartIso: new Date().toISOString(),
			paidTierRequests: 0,
			workspaceId: null,
		} satisfies SettingsByokInitialData);
	}

	const now = new Date();
	const monthStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
	);
	const nextMonthStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
	);
	const monthStartIso = monthStart.toISOString();
	const nextMonthStartIso = nextMonthStart.toISOString();

	const [{ data: byokRows, error: byokError }, { data: monthlyUsageRows }] =
		await Promise.all([
			supabase
				.from("byok_keys")
				.select("id,provider_id,name,prefix,suffix,created_at,enabled,always_use")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false }),
			supabase
				.from("workspace_byok_monthly_usage")
				.select("month_start,request_count")
				.eq("workspace_id", workspaceId)
				.gte("month_start", monthStartIso)
				.lt("month_start", nextMonthStartIso)
				.order("month_start", { ascending: false })
				.limit(1),
		]);

	if (byokError) throw new Error(byokError.message);

	const keyRows = (byokRows ?? []) as Array<{
		always_use: boolean;
		created_at: string;
		enabled: boolean;
		id: string;
		name: string;
		prefix: string | null;
		provider_id: string;
		suffix: string | null;
	}>;

	const keyByProvider = new Map<string, ByokKeyEntry>();
	const hiddenLegacyCountByProvider = new Map<string, number>();
	for (const row of keyRows) {
		if (!keyByProvider.has(row.provider_id)) {
			keyByProvider.set(row.provider_id, {
				id: row.id,
				providerId: row.provider_id,
				name: row.name,
				prefix: row.prefix ?? undefined,
				suffix: row.suffix ?? undefined,
				createdAt: row.created_at,
				enabled: row.enabled,
				alwaysUse: row.always_use,
			});
			continue;
		}
		hiddenLegacyCountByProvider.set(
			row.provider_id,
			(hiddenLegacyCountByProvider.get(row.provider_id) ?? 0) + 1,
		);
	}

	const monthlyRequestCount = Number(monthlyUsageRows?.[0]?.request_count ?? 0);
	const freeRemaining = Math.max(
		0,
		BYOK_MONTHLY_FREE_REQUESTS - monthlyRequestCount,
	);
	const paidTierRequests = Math.max(
		0,
		monthlyRequestCount - BYOK_MONTHLY_FREE_REQUESTS,
	);

	return NextResponse.json({
		freeRemaining,
		keyEntries: Array.from(keyByProvider.values()),
		legacyHiddenTotal: Array.from(hiddenLegacyCountByProvider.values()).reduce(
			(sum, count) => sum + count,
			0,
		),
		monthlyRequestCount,
		nextMonthStartIso,
		paidTierRequests,
		workspaceId,
	} satisfies SettingsByokInitialData);
}

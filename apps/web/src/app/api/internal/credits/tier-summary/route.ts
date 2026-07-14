import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export type CreditsTierSummary = {
	lastMonthCents: number;
	mtdCents: number;
	teamTier: "basic" | "enterprise";
};

const EMPTY_TIER_SUMMARY: CreditsTierSummary = {
	lastMonthCents: 0,
	mtdCents: 0,
	teamTier: "basic",
};

function normalizeTier(value: unknown): CreditsTierSummary["teamTier"] {
	return String(value ?? "").toLowerCase() === "enterprise"
		? "enterprise"
		: "basic";
}

export async function GET(request: NextRequest) {
	const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
	if (!workspaceId) {
		return NextResponse.json(EMPTY_TIER_SUMMARY);
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return NextResponse.json(EMPTY_TIER_SUMMARY);
	}

	try {
		const [{ data: prev }, { data: mtd }, { data: team }] = await Promise.all([
			supabase.rpc("monthly_spend_prev_cents", { p_team: workspaceId }).single(),
			supabase.rpc("mtd_spend_cents", { p_team: workspaceId }).single(),
			supabase
				.from("workspaces")
				.select("tier")
				.eq("id", workspaceId)
				.maybeSingle(),
		]);

		return NextResponse.json({
			lastMonthCents: Number(prev ?? 0),
			mtdCents: Number(mtd ?? 0),
			teamTier: normalizeTier(team?.tier),
		} satisfies CreditsTierSummary);
	} catch {
		return NextResponse.json(EMPTY_TIER_SUMMARY);
	}
}

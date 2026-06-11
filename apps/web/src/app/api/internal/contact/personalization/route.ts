import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type ContactPersonalizationData = {
	defaultInternalId: string;
	tierLabel: string;
	userEmail: string | null;
};

const EMPTY_CONTACT_PERSONALIZATION: ContactPersonalizationData = {
	defaultInternalId: "",
	tierLabel: "",
	userEmail: null,
};

export async function GET() {
	const workspaceId = await getWorkspaceIdFromCookie();
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const result: ContactPersonalizationData = {
		...EMPTY_CONTACT_PERSONALIZATION,
		userEmail: user?.email ?? null,
	};

	if (!workspaceId) {
		return NextResponse.json(result);
	}

	try {
		const [{ data: prev }, { data: teamResult }] = await Promise.all([
			supabase.rpc("monthly_spend_prev_cents", { p_team: workspaceId }).single(),
			supabase
				.from("workspaces")
				.select("slug")
				.eq("id", workspaceId)
				.maybeSingle(),
		]);
		const lastMonthCents = Number(prev ?? 0);
		const lastMonthUsd = lastMonthCents / 1_000_000_000;

		return NextResponse.json({
			defaultInternalId: teamResult?.slug ?? workspaceId,
			tierLabel: lastMonthUsd >= 10000 ? "Enterprise" : "Basic",
			userEmail: result.userEmail,
		} satisfies ContactPersonalizationData);
	} catch {
		return NextResponse.json(result);
	}
}

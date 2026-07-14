import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type RedeemTeamOption = {
	id: string;
	name: string;
};

export type RedeemInitialData = {
	activeWorkspaceId: string | null;
	invoiceTeamIds: string[];
	signedIn: boolean;
	teamOptions: RedeemTeamOption[];
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return NextResponse.json({
			activeWorkspaceId: null,
			invoiceTeamIds: [],
			signedIn: false,
			teamOptions: [],
		} satisfies RedeemInitialData);
	}

	const activeWorkspaceId = await getWorkspaceIdFromCookie();
	const teamOptions: RedeemTeamOption[] = [];
	const invoiceTeamIds = new Set<string>();

	try {
		const { data: rows } = await supabase
			.from("workspace_members")
			.select("workspace_id, teams:workspaces(id, name, billing_mode)")
			.eq("user_id", user.id);

		for (const row of rows ?? []) {
			const team = Array.isArray((row as any)?.teams)
				? (row as any).teams[0]
				: (row as any)?.teams;
			const id = String(team?.id ?? (row as any)?.workspace_id ?? "").trim();
			if (!id) continue;

			const name = String(team?.name ?? "Team").trim() || "Team";
			if (!teamOptions.some((entry) => entry.id === id)) {
				teamOptions.push({ id, name });
			}
			if (String(team?.billing_mode ?? "wallet").toLowerCase() === "invoice") {
				invoiceTeamIds.add(id);
			}
		}
	} catch {
		// Keep the redeem page renderable with no selectable teams.
	}

	if (
		activeWorkspaceId &&
		!teamOptions.some((entry) => entry.id === activeWorkspaceId)
	) {
		teamOptions.unshift({ id: activeWorkspaceId, name: "Current Team" });
	}

	return NextResponse.json({
		activeWorkspaceId: activeWorkspaceId ?? null,
		invoiceTeamIds: Array.from(invoiceTeamIds),
		signedIn: true,
		teamOptions,
	} satisfies RedeemInitialData);
}

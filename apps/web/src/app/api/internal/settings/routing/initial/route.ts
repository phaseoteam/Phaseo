import { NextResponse } from "next/server";
import type { RoutingMode } from "@/app/(dashboard)/settings/routing/actions";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsRoutingInitialData = {
	responseHealingEnabled: boolean;
	responseHealingLocked: boolean;
	responseHealingMode: "safe" | "strict";
	routingMode: RoutingMode;
	teamName: string | null;
	alphaChannelEnabled: boolean;
	betaChannelEnabled: boolean;
	workspaceId: string | null;
};

export async function GET() {
	const supabase = await createClient();
	const workspaceId = await getWorkspaceIdFromCookie();

	if (!workspaceId) {
		return NextResponse.json({
			responseHealingEnabled: false,
			responseHealingLocked: false,
			responseHealingMode: "safe",
			routingMode: "balanced",
			teamName: null,
			alphaChannelEnabled: false,
			betaChannelEnabled: false,
			workspaceId: null,
		} satisfies SettingsRoutingInitialData);
	}

	const [{ data: teamRow, error: teamError }, { data: settingsRow, error: settingsError }] =
		await Promise.all([
			supabase.from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle(),
			supabase
				.from("workspace_settings")
				.select(
					"routing_mode, beta_channel_enabled, alpha_channel_enabled, response_healing_enabled, response_healing_locked, response_healing_mode",
				)
				.eq("workspace_id", workspaceId)
				.maybeSingle(),
		]);

	if (teamError) throw new Error(teamError.message);
	if (settingsError) throw new Error(settingsError.message);

	return NextResponse.json({
		responseHealingEnabled: Boolean(settingsRow?.response_healing_enabled),
		responseHealingLocked: Boolean(settingsRow?.response_healing_locked),
		responseHealingMode:
			settingsRow?.response_healing_mode === "strict" ? "strict" : "safe",
		routingMode: (settingsRow?.routing_mode as RoutingMode | null) ?? "balanced",
		teamName: (teamRow?.name as string | null) ?? null,
		alphaChannelEnabled: Boolean(settingsRow?.alpha_channel_enabled),
		betaChannelEnabled: Boolean(settingsRow?.beta_channel_enabled),
		workspaceId,
	} satisfies SettingsRoutingInitialData);
}

"use server";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { revalidatePath } from "next/cache";
import {
	requireAuthenticatedUser,
	requireTeamMembership,
} from "@/utils/serverActionAuth";

export type RoutingMode = "balanced" | "price" | "latency" | "throughput";

type UpdateRoutingSettingsInput = {
	mode: RoutingMode;
	betaChannelEnabled?: boolean;
};

export async function updateRoutingSettings({
	mode,
	betaChannelEnabled,
}: UpdateRoutingSettingsInput) {
	const { supabase, user } = await requireAuthenticatedUser();
	const teamId = await getTeamIdFromCookie();
	if (!teamId) {
		throw new Error("Missing team id");
	}
	await requireTeamMembership(supabase, user.id, teamId, ["owner", "admin"]);

	const payload = {
		team_id: teamId,
		routing_mode: mode,
		...(typeof betaChannelEnabled === "boolean"
			? { beta_channel_enabled: betaChannelEnabled }
			: {}),
		updated_at: new Date().toISOString(),
	};

	const { error } = await supabase
		.from("team_settings")
		.upsert(payload, { onConflict: "team_id" });

	if (error) {
		throw error;
	}

	revalidatePath("/settings/routing");
}

export async function updateRoutingMode(mode: RoutingMode) {
	return updateRoutingSettings({ mode });
}

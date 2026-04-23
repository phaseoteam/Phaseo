"use server";

import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceIdFromCookieRaw } from "@/utils/workspaceCookie";
import { revalidatePath } from "next/cache";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";

export type RoutingMode = "balanced" | "price" | "latency" | "throughput";

type UpdateRoutingSettingsInput = {
	mode: RoutingMode;
	betaChannelEnabled?: boolean;
	alphaChannelEnabled?: boolean;
};

export async function updateRoutingSettings({
	mode,
	betaChannelEnabled,
	alphaChannelEnabled,
}: UpdateRoutingSettingsInput) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getActiveWorkspaceIdFromCookieRaw();
	if (!workspaceId) {
		throw new Error("Missing workspace id");
	}
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const payload = {
		workspace_id: workspaceId,
		routing_mode: mode,
		...(typeof betaChannelEnabled === "boolean"
			? { beta_channel_enabled: betaChannelEnabled }
			: {}),
		...(typeof alphaChannelEnabled === "boolean"
			? {
					alpha_channel_enabled:
						betaChannelEnabled === false ? false : alphaChannelEnabled,
			  }
			: {}),
		updated_at: new Date().toISOString(),
	};

	const { error } = await supabase
		.from("workspace_settings")
		.upsert(payload, { onConflict: "workspace_id" });

	if (error) {
		throw error;
	}

	revalidatePath("/settings/routing");
}

export async function updateRoutingMode(mode: RoutingMode) {
	return updateRoutingSettings({ mode });
}

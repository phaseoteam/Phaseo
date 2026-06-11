"use server";

import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
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
	responseHealingEnabled?: boolean;
	responseHealingLocked?: boolean;
	responseHealingMode?: "safe" | "strict";
};

export async function updateRoutingSettings({
	mode,
	betaChannelEnabled,
	alphaChannelEnabled,
	responseHealingEnabled,
	responseHealingLocked,
	responseHealingMode,
}: UpdateRoutingSettingsInput) {
	const { supabase, user } = await requireAuthenticatedUser();
	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		throw new Error("Missing workspace id");
	}
	await requireWorkspaceMembership(supabase, user.id, workspaceId, ["owner", "admin"]);

	const basePayload = {
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
		.upsert(basePayload, { onConflict: "workspace_id" });

	if (error) {
		throw error;
	}

	const responseHealingPayload = {
		workspace_id: workspaceId,
		...(typeof responseHealingEnabled === "boolean"
			? { response_healing_enabled: responseHealingEnabled }
			: {}),
		...(typeof responseHealingLocked === "boolean"
			? { response_healing_locked: responseHealingLocked }
			: {}),
		...(responseHealingMode === "safe" || responseHealingMode === "strict"
			? { response_healing_mode: responseHealingMode }
			: {}),
		updated_at: new Date().toISOString(),
	};
	if (Object.keys(responseHealingPayload).length > 2) {
		const { error: responseHealingError } = await supabase
			.from("workspace_settings")
			.upsert(responseHealingPayload, { onConflict: "workspace_id" });

		if (responseHealingError) {
			throw responseHealingError;
		}
	}

	revalidatePath("/settings/routing");
}

export async function updateRoutingMode(mode: RoutingMode) {
	return updateRoutingSettings({ mode });
}

"use server";

import { revalidatePath } from "next/cache";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

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
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) throw new Error("Missing workspace id");
	await fetchAccountWebApi("/api/account/settings/routing", context.accessToken, {
		method: "PUT",
		body: JSON.stringify({ workspaceId: context.workspaceId, mode, betaChannelEnabled, alphaChannelEnabled, responseHealingEnabled, responseHealingLocked, responseHealingMode }),
	});

	revalidatePath("/settings/routing");
}

export async function updateRoutingMode(mode: RoutingMode) {
	return updateRoutingSettings({ mode });
}

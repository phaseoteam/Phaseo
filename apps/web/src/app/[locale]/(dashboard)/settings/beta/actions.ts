"use server";

import { revalidatePath } from "next/cache";

import {
	normalizeBetaFeatures,
	type StatsigProfile,
} from "@/lib/statsig/shared";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export async function updateBetaPreferences(payload: {
	beta_opt_in?: boolean;
	beta_features?: Record<string, unknown>;
}): Promise<{ ok: true; profile: StatsigProfile }> {
	const context = await getServerAccountContext();
	if (!context.accessToken) throw new Error("Not authenticated");
	const requested = normalizeBetaFeatures(payload.beta_features);
	const response = await fetchAccountWebApi<{ ok: true; profile: StatsigProfile }>("/api/account/settings/beta", context.accessToken, {
		method: "PUT",
		body: JSON.stringify({ beta_features: requested }),
	});
	const profile = response.profile;

	// Beta preferences are applied per user on the client (stored profile +
	// Statsig update + router.refresh in BetaSettingsClient). No public page
	// renders them on the server, so expiring shared pages here would only let
	// any signed-in user keep the site uncached.
	revalidatePath("/settings/beta");

	return { ok: true, profile };
}

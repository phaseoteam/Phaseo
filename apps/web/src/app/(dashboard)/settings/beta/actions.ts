"use server";

import { revalidatePath } from "next/cache";

import {
	normalizeBetaFeatures,
	WEB_BETA_FEATURES,
	type StatsigProfile,
} from "@/lib/statsig/shared";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

function sanitizeBetaFeatures(
	value: unknown,
	options: { isAdmin: boolean },
): Record<string, boolean> {
	const normalized = normalizeBetaFeatures(value);
	const allowedKeys = new Set<string>(
		WEB_BETA_FEATURES.filter(
			(feature) =>
				feature.selfService !== false && (!feature.adminOnly || options.isAdmin),
		).map((feature) => feature.key),
	);

	return Object.fromEntries(
		Object.entries(normalized).filter(
			([key, enabled]) =>
				allowedKeys.has(key) && enabled === true
		)
	);
}

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

	revalidatePath("/settings/beta");
	revalidatePath("/chat/realtime");
	revalidatePath("/");
	revalidatePath("/gateway");
	revalidatePath("/models");

	return { ok: true, profile };
}

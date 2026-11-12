import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";

import {
	normalizeBetaFeatures,
	type StatsigProfile,
} from "@/lib/statsig/shared";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export const updateBetaPreferences = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((payload: {
		beta_opt_in?: boolean;
		beta_features?: Record<string, unknown>;
	}) => payload)
	.handler(async ({ data: payload }): Promise<{ ok: true; profile: StatsigProfile }> => {
		const context = await getServerAccountContext();
		if (!context.accessToken) throw new Error("Not authenticated");
		const requested = normalizeBetaFeatures(payload.beta_features);
		const response = await fetchAccountWebApi<{ ok: true; profile: StatsigProfile }>("/api/account/settings/beta", context.accessToken, {
			method: "PUT",
			body: JSON.stringify({ beta_features: requested }),
		});
		const profile = response.profile;


		return { ok: true, profile };
	});

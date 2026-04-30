"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import {
	normalizeBetaFeatures,
	WEB_BETA_FEATURES,
	type StatsigProfile,
} from "@/lib/statsig/shared";

const ALLOWED_BETA_FEATURE_KEYS = new Set(WEB_BETA_FEATURES.map((feature) => feature.key));

function sanitizeBetaFeatures(value: unknown): Record<string, boolean> {
	const normalized = normalizeBetaFeatures(value);

	return Object.fromEntries(
		Object.entries(normalized).filter(
			([key, enabled]) =>
				ALLOWED_BETA_FEATURE_KEYS.has(key) && enabled === true
		)
	);
}

export async function updateBetaPreferences(payload: {
	beta_opt_in?: boolean;
	beta_features?: Record<string, unknown>;
}): Promise<{ ok: true; profile: StatsigProfile }> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		throw new Error("Not authenticated");
	}

	const betaFeatures = sanitizeBetaFeatures(payload.beta_features);
	const profile: StatsigProfile = {
		betaOptIn: Object.keys(betaFeatures).length > 0,
		betaFeatures,
	};

	const { error } = await supabase.from("users").upsert(
		{
			user_id: user.id,
			beta_opt_in: profile.betaOptIn,
			beta_features: profile.betaFeatures,
		},
		{ onConflict: "user_id" }
	);

	if (error) {
		throw new Error(error.message);
	}

	revalidatePath("/settings/beta");
	revalidatePath("/");
	revalidatePath("/gateway");

	return { ok: true, profile };
}

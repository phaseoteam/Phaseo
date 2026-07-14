"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import {
	normalizeBetaFeatures,
	WEB_BETA_FEATURES,
	type StatsigProfile,
} from "@/lib/statsig/shared";

function sanitizeBetaFeatures(
	value: unknown,
	options: { isAdmin: boolean },
): Record<string, boolean> {
	const normalized = normalizeBetaFeatures(value);
	const allowedKeys = new Set<string>(
		WEB_BETA_FEATURES.filter(
			(feature) => !feature.adminOnly || options.isAdmin,
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
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		throw new Error("Not authenticated");
	}

	const { data: userRow, error: roleError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (roleError) throw new Error(roleError.message);

	const betaFeatures = sanitizeBetaFeatures(payload.beta_features, {
		isAdmin: String(userRow?.role ?? "").toLowerCase() === "admin",
	});
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
	revalidatePath("/models");

	return { ok: true, profile };
}

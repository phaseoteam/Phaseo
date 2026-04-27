import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
	Statsig,
	createStatsigAdapter,
	type StatsigUser as ServerStatsigUser,
} from "@flags-sdk/statsig";

import { createClient } from "@/utils/supabase/server";

import {
	EMPTY_STATSIG_PROFILE,
	STATSIG_STABLE_ID_COOKIE,
	buildAnonymousStatsigUser,
	buildAuthenticatedStatsigUser,
	normalizeBetaFeatures,
	type StatsigProfile,
} from "./shared";

const statsigServerKey =
	process.env.STATSIG_SERVER_KEY ?? process.env.STATSIG_SERVER_API_KEY ?? null;

const statsigFlagsAdapter = statsigServerKey
	? createStatsigAdapter({
			statsigServerApiKey: statsigServerKey,
		})
	: null;

export function getStatsigServerKey(): string | null {
	return statsigServerKey;
}

export function getStatsigFlagsAdapter() {
	return statsigFlagsAdapter;
}

export const getServerStatsigProfile = cache(
	async (userId?: string | null): Promise<StatsigProfile> => {
		if (!userId) {
			return EMPTY_STATSIG_PROFILE;
		}

		const supabase = await createClient();
		const { data: profileRow, error } = await supabase
			.from("users")
			.select("beta_opt_in, beta_features")
			.eq("user_id", userId)
			.maybeSingle();
		if (error) {
			throw new Error(`Failed to load Statsig profile: ${error.message}`);
		}

		return {
			betaOptIn: Boolean(profileRow?.beta_opt_in),
			betaFeatures: normalizeBetaFeatures(
				profileRow?.beta_features ?? EMPTY_STATSIG_PROFILE.betaFeatures
			),
		};
	}
);

export const getServerStatsigUser = cache(async () => {
	const cookieStore = await cookies();
	const stableID =
		cookieStore.get(STATSIG_STABLE_ID_COOKIE)?.value ?? crypto.randomUUID();

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return buildAnonymousStatsigUser(stableID);
	}

	const profile = await getServerStatsigProfile(user.id);

	return buildAuthenticatedStatsigUser(
		{
			id: user.id,
			email: user.email,
		},
		stableID,
		profile
	);
});

export const getServerStatsigBootstrap = cache(async () => {
	const clientKey = process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY ?? null;
	if (!clientKey || !statsigFlagsAdapter) {
		return null;
	}

	const user = (await getServerStatsigUser()) as ServerStatsigUser;
	await statsigFlagsAdapter.initialize();

	return {
		clientKey,
		user,
		values: JSON.stringify(
			Statsig.getClientInitializeResponse(user, {
				hash: "djb2",
			})
		),
	};
});

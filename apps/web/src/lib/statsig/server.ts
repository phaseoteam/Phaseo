import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
	Statsig,
	createStatsigAdapter,
	type StatsigUser as ServerStatsigUser,
} from "@flags-sdk/statsig";

import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import type { InternalAuthStatsigData } from "@/lib/fetchers/internal/authTypes";

import {
	EMPTY_STATSIG_PROFILE,
	STATSIG_STABLE_ID_COOKIE,
	buildAnonymousStatsigUser,
	buildAuthenticatedStatsigUser,
	type StatsigProfile,
} from "./shared";

const statsigServerKey =
	process.env.STATSIG_SERVER_KEY ?? process.env.STATSIG_SERVER_API_KEY ?? null;

const statsigEnvironmentTier =
	process.env.STATSIG_ENVIRONMENT_TIER ??
	(process.env.VERCEL_ENV === "production"
		? "production"
		: process.env.VERCEL_ENV === "preview"
			? "staging"
			: "development");

const statsigFlagsAdapter = statsigServerKey
	? createStatsigAdapter({
			statsigServerApiKey: statsigServerKey,
			statsigOptions: {
				environment: { tier: statsigEnvironmentTier },
			},
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

		const context = await getServerAccountContext();
		if (!context.accessToken) return EMPTY_STATSIG_PROFILE;
		return (await fetchAccountWebApi<InternalAuthStatsigData>("/api/account/auth/statsig", context.accessToken)).profile;
	}
);

export const getServerStatsigUser = cache(async () => {
	const cookieStore = await cookies();
	const stableID =
		cookieStore.get(STATSIG_STABLE_ID_COOKIE)?.value ?? crypto.randomUUID();

	const context = await getServerAccountContext();
	const auth = await fetchAccountWebApi<InternalAuthStatsigData>("/api/account/auth/statsig", context.accessToken);
	if (!auth.signedIn || !auth.user?.id) {
		return buildAnonymousStatsigUser(stableID);
	}

	const user = buildAuthenticatedStatsigUser(
		{
			id: auth.user.id,
			email: auth.user.email,
		},
		stableID,
		auth.profile
	);
	if (context.workspaceId) {
		user.customIDs = {
			...user.customIDs,
			workspaceID: context.workspaceId,
		};
		user.custom = {
			...user.custom,
			workspace_id: context.workspaceId,
		};
	}
	return user;
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

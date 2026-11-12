
import { cache } from "react";
import Statsig, { type DynamicConfig, type StatsigUser as ServerStatsigUser } from "statsig-node-lite";

import { fetchAccountWebApi } from "@/lib/web-api/client";
import { currentRequestCookie } from "@/lib/server/currentRequest";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { waitUntil } from "@/lib/start/wait-until";
import { getPhaseoEnv } from "@/lib/deployEnv";
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

const PHASEO_TO_STATSIG_TIER = { production: "production", preview: "staging", development: "development" } as const;

const statsigEnvironmentTier =
	process.env.STATSIG_ENVIRONMENT_TIER ?? PHASEO_TO_STATSIG_TIER[getPhaseoEnv()];

// Rulesets refresh on demand: a Worker isolate does not run timers between
// requests, so a request at least this long after the last sync starts a new one.
const CONFIG_SYNC_INTERVAL_MS = 5000;

// The SDK is a per-isolate singleton. Only the request that starts
// initialisation awaits it: on Workers, a request awaiting I/O started by
// another request can hang until the client gives up. Requests arriving while
// it is still in flight poll the settled flag instead.
let initState: "idle" | "initializing" | "ready" | "failed" = "idle";
let syncingConfig = false;
let nextConfigSyncAt = 0;
const CONCURRENT_INIT_WAIT_MS = 2000;

export function getStatsigServerKey(): string | null {
	return statsigServerKey;
}

/**
 * Initialises the server SDK once per isolate. Resolves to false when no server
 * key is configured or initialisation is not ready (callers treat gates as off).
 */
export async function initializeStatsigServer(): Promise<boolean> {
	if (!statsigServerKey) return false;
	if (initState === "idle" || initState === "failed") {
		initState = "initializing";
		nextConfigSyncAt = Date.now() + CONFIG_SYNC_INTERVAL_MS;
		try {
			await Statsig.initialize(statsigServerKey, {
				environment: { tier: statsigEnvironmentTier },
				// Only gates and experiments are evaluated here; ID lists are not used.
				initStrategyForIDLists: "none",
				disableIdListsSync: true,
				rulesetsSyncIntervalMs: process.env.NODE_ENV === "development" ? 5000 : undefined,
			});
			initState = "ready";
		} catch (error) {
			initState = "failed";
			throw error;
		}
	} else if (initState === "initializing") {
		const deadline = Date.now() + CONCURRENT_INIT_WAIT_MS;
		const current = () => initState as typeof initState;
		while (current() === "initializing" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
		if (current() !== "ready") return false;
	}
	syncConfigSpecsIfDue();
	return true;
}

function syncConfigSpecsIfDue() {
	if (syncingConfig || Date.now() < nextConfigSyncAt) return;
	syncingConfig = true;
	try {
		const sync = Statsig.syncConfigSpecs().finally(() => {
			syncingConfig = false;
			nextConfigSyncAt = Date.now() + CONFIG_SYNC_INTERVAL_MS;
		});
		void waitUntil(sync);
	} catch {
		syncingConfig = false;
	}
}

function assertStatsigUser(user: unknown): asserts user is ServerStatsigUser {
	if (user == null || typeof user !== "object") throw new Error("Statsig: missing user for gate evaluation");
}

/** Whether the gate passes for this user, without logging an exposure. False when no server key is configured. */
export async function checkStatsigGate(user: unknown, gate: string): Promise<boolean> {
	if (!(await initializeStatsigServer())) return false;
	assertStatsigUser(user);
	return Statsig.getFeatureGateWithExposureLoggingDisabledSync(user, gate).value;
}

/** An experiment's values for this user, without logging an exposure. Null when no server key is configured. */
export async function getStatsigExperiment(user: unknown, experiment: string): Promise<DynamicConfig | null> {
	if (!(await initializeStatsigServer())) return null;
	assertStatsigUser(user);
	return Statsig.getExperimentWithExposureLoggingDisabledSync(user, experiment);
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
	const stableID = currentRequestCookie(STATSIG_STABLE_ID_COOKIE) ?? crypto.randomUUID();

	const context = await getServerAccountContext();
	if (!context.accessToken) return buildAnonymousStatsigUser(stableID);
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
	const clientKey = process.env.PUBLIC_STATSIG_CLIENT_KEY ?? null;
	if (!clientKey || !statsigServerKey) {
		return null;
	}

	const user = (await getServerStatsigUser()) as ServerStatsigUser;
	if (!(await initializeStatsigServer())) return null;

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

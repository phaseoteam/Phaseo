import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi, fetchInternalWebApi } from "@/lib/web-api/client";
import type { InternalAuthStatus } from "@/lib/fetchers/internal/authTypes";

export type CacheScope = {
	id: string;
	label: string;
	description: string;
	targetLabel?: string;
	targetPlaceholder?: string;
	targetRequired: boolean;
	affectsSearch: boolean;
	danger: "normal" | "high";
	tags: string[];
	tagCount: number;
};

export type CachePurgeEvent = {
	id: number;
	scope: string;
	target_id: string | null;
	tags: string[];
	browser_generation_bumped: boolean;
	generation: number | null;
	actor_user_id: string | null;
	purge_succeeded: boolean;
	purge_error: unknown;
	created_at: string;
};

export type CacheControlState = {
	scopes: CacheScope[];
	generations: Array<{
		scope: string;
		generation: number;
		updated_at: string;
		updated_by: string | null;
	}>;
	events: CachePurgeEvent[];
};

export type CachePurgeResult = {
	success: true;
	scope: string;
	targetId: string | null;
	tags: string[];
	generation: number | null;
	generationWarning: string | null;
	browserRefreshEnabled: boolean;
	purgedAt: string;
};

async function accessToken() {
	const token = await getBrowserAccessToken();
	if (!token) throw new Error("Your admin session is no longer available. Sign in again.");
	return token;
}

export async function verifyCacheAdmin() {
	const token = await getBrowserAccessToken();
	if (!token) return false;
	const status = await fetchAccountWebApi<InternalAuthStatus>(
		"/api/account/auth/status",
		token,
	);
	return status.signedIn && status.isAdmin;
}

export async function fetchCacheControlState() {
	return fetchInternalWebApi<CacheControlState>("/api/internal/cache", await accessToken());
}

export async function purgeCacheScope(input: {
	scope: string;
	targetId?: string;
	bumpBrowserGeneration: boolean;
}) {
	return fetchInternalWebApi<CachePurgeResult>(
		"/api/internal/cache/purge",
		await accessToken(),
		{ method: "POST", body: JSON.stringify(input) },
	);
}

import "server-only";

import { dedupe } from "flags/next";
import type { Identify } from "flags";
import type { StatsigUser } from "@flags-sdk/statsig";

import { getServerStatsigUser } from "@/lib/statsig/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const identify = dedupe(
	(async () => (await getServerStatsigUser()) as StatsigUser) satisfies Identify<StatsigUser>
);

/**
 * The viewer's Statsig user with the userID swapped for the owner of the
 * selected workspace. Gateway gates without a userId are decided for the
 * owner, so gates that control gateway behaviour must use this to agree.
 */
export const identifyWorkspaceOwner = dedupe(
	(async () => {
		const user = (await getServerStatsigUser()) as StatsigUser;
		const workspaceId = user.customIDs?.workspaceID;
		if (!workspaceId) return user;
		const { data } = await createAdminClient()
			.from("workspaces")
			.select("owner_user_id")
			.eq("id", workspaceId)
			.maybeSingle();
		const ownerId = typeof data?.owner_user_id === "string" ? data.owner_user_id : null;
		return ownerId ? { ...user, userID: ownerId } : user;
	}) satisfies Identify<StatsigUser>
);

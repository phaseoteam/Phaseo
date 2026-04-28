import "server-only";

import { dedupe } from "flags/next";
import type { Identify } from "flags";
import type { StatsigUser } from "@flags-sdk/statsig";

import { getServerStatsigUser } from "@/lib/statsig/server";

export const identify = dedupe(
	(async () =>
		(await getServerStatsigUser()) as StatsigUser) satisfies Identify<StatsigUser>
);

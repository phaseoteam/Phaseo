import type { Env } from "@/env";
import { getDataClient } from "@/data/supabase";
import { purgeWorkerCacheTags } from "@/http/invalidation";
import { runWebWatcher } from "@/watchers/web";
import { runYoutubeWatcher } from "@/watchers/youtube";

export type WatcherKind = "web" | "youtube";

export async function runWatcher(kind: WatcherKind, env: Env, executionCtx: object) {
	const client = getDataClient(env);
	const summary = kind === "web" ? await runWebWatcher(client) : await runYoutubeWatcher(client, env.YT_API_KEY ?? "");
	const changed = kind === "web"
		? "counts" in summary && summary.counts.attempted_upserts > 0 && !summary.dbError
		: "total" in summary && summary.total > 0 && !summary.dbError;
	const invalidation = changed
		? await purgeWorkerCacheTags(executionCtx, ["web-api-updates", `web-api-updates-${kind}`, "web-api-updates-latest"])
		: null;
	return { kind, summary, invalidation };
}

export async function runScheduledWatchers(env: Env, executionCtx: object) {
	const results = await Promise.allSettled([
		runWatcher("web", env, executionCtx),
		runWatcher("youtube", env, executionCtx),
	]);
	for (const [index, result] of results.entries()) {
		if (result.status === "rejected") console.error("scheduled_watcher_failed", { kind: index === 0 ? "web" : "youtube", error: result.reason });
	}
	return results;
}

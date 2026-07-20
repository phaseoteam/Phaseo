import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const CACHE = { edgeTtlSeconds: 5 * 60, staleWhileRevalidateSeconds: 5 * 60, cacheTags: ["web-api-monitor-history"] } as const;

function filters(c: { req: { query: (name: string) => string | undefined } }) {
	const limit = Math.max(1, Math.min(50, Math.round(Number(c.req.query("commit_limit")) || 18)));
	const offset = Math.max(0, Math.round(Number(c.req.query("commit_offset")) || 0));
	const optional = (name: string) => { const value = c.req.query(name)?.trim(); return value && value !== "all" ? value : null; };
	return { changeType: optional("change_type"), limit, offset, model: optional("model"), provider: optional("provider") };
}

async function page(env: Env, input: ReturnType<typeof filters>) {
	const client = getDataClient(env);
	const [stats, rows] = await Promise.all([
		client.rpc("get_monitor_history_stats", { p_change_kind: input.changeType, p_model: input.model, p_provider: input.provider }),
		client.rpc("get_monitor_history_page", { p_change_kind: input.changeType, p_commit_limit: input.limit, p_commit_offset: input.offset, p_model: input.model, p_provider: input.provider }),
	]);
	if (stats.error) throw stats.error;
	if (rows.error) throw rows.error;
	const summary = stats.data?.[0] ?? null;
	const totalCommits = Number(summary?.total_commits ?? 0);
	const nextCommitOffset = input.offset + input.limit;
	return {
		entries: (rows.data ?? []).map((row) => [String(row.event_id ?? ""), row.committed_at ?? "", String(row.provider_kind ?? "model"), String(row.model_id ?? ""), row.endpoint ?? null, row.field ?? "", row.old_value ?? null, row.new_value ?? null, row.percent_change ?? null, row.action ?? null, row.commit_sha ?? null, row.entity_id ?? null, row.entity_type ?? null, row.org_id ?? null]),
		generatedAt: summary?.generated_at ?? undefined,
		hasMore: totalCommits > nextCommitOffset,
		lastSha: summary?.last_sha ?? undefined,
		nextCommitOffset,
		sourceBase: summary?.source_base ?? undefined,
		sourceHead: summary?.source_head ?? undefined,
		totalChanges: Number(summary?.total_changes ?? 0),
		totalCommits,
	};
}

export const publicMonitorRouter = new Hono<{ Bindings: Env }>();

publicMonitorRouter.get("/monitor/history", async (c) => {
	try { return withPublicCache(c.json(await page(c.env, filters(c))), CACHE); }
	catch (error) { console.error("[web-api/monitor] history failed", error); return c.json({ error: "monitor_history_unavailable" }, 503); }
});

publicMonitorRouter.get("/monitor/history/initial", async (c) => {
	try {
		const client = getDataClient(c.env);
		const [initialPage, options] = await Promise.all([page(c.env, { changeType: null, limit: 18, offset: 0, model: null, provider: null }), client.rpc("get_monitor_history_filter_options")]);
		if (options.error) throw options.error;
		const modelOptions: Array<{ label: string; query: string; value: string }> = [];
		const providerOptions: Array<{ label: string; query: string; value: string }> = [];
		for (const row of options.data ?? []) { const value = String(row.option_value ?? "").trim(); const label = String(row.option_label ?? "").trim(); if (!value || !label) continue; const option = { label, query: `${label} ${value}`, value }; if (row.option_kind === "model") modelOptions.push(option); else if (row.option_kind === "provider") providerOptions.push(option); }
		return withPublicCache(c.json({ initialPage, modelOptions, providerOptions }), CACHE);
	} catch (error) { console.error("[web-api/monitor] initial history failed", error); return c.json({ error: "monitor_history_unavailable" }, 503); }
});

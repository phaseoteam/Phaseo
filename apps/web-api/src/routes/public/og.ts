import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

export const publicOgRouter = new Hono<{ Bindings: Env }>();
const CACHE = { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-og"] } as const;

publicOgRouter.get("/og", async (c) => {
	const kind = c.req.query("kind")?.trim(); const id = c.req.query("id")?.trim();
	if (!kind || !id) return c.json({ error: "invalid_og_reference" }, 400);
	try {
		const client = getDataClient(c.env); let payload: Record<string, unknown> | null = null;
		if (kind === "organisations") { const result = await client.from("data_organisations").select("organisation_id,name").eq("organisation_id", id).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.organisation_id, name: result.data.name ?? result.data.organisation_id, logoId: result.data.organisation_id }; }
		else if (kind === "models") { const result = await client.from("data_models").select("model_id,name,organisation_id,status").eq("model_id", id).eq("hidden", false).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.model_id, name: result.data.name ?? result.data.model_id, logoId: result.data.organisation_id ?? undefined, badge: result.data.status ?? undefined }; }
		else if (kind === "benchmarks") { const result = await client.from("data_benchmarks").select("id,name").eq("id", id).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.id, name: result.data.name ?? result.data.id }; }
		else if (kind === "api-providers") { const result = await client.from("data_api_providers").select("api_provider_id,api_provider_name").eq("api_provider_id", id).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.api_provider_id, name: result.data.api_provider_name ?? result.data.api_provider_id, logoId: result.data.api_provider_id }; }
		else if (kind === "subscription-plans") { const result = await client.from("data_subscription_plans").select("plan_id,name,organisation_id").eq("plan_id", id).limit(1).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.plan_id, name: result.data.name ?? result.data.plan_id, logoId: result.data.organisation_id ?? undefined }; }
		else if (kind === "countries") { const iso = id.toUpperCase(); if (/^[A-Z]{2}$/.test(iso)) { const [a, b] = iso; const base = 0x1f1e6; payload = { id: iso, name: new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso, flagEmoji: String.fromCodePoint(base + a.charCodeAt(0) - 65, base + b.charCodeAt(0) - 65) }; } }
		else return c.json({ error: "invalid_og_kind" }, 400);
		if (!payload) return c.json({ error: "og_not_found" }, 404);
		return withPublicCache(c.json({ payload }), CACHE);
	} catch (error) { console.error("[web-api/og] payload failed", { kind, id, error }); return c.json({ error: "og_unavailable" }, 503); }
});

import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS, withPublicCache } from "@/http/cache";

export const publicOgRouter = new Hono<{ Bindings: Env }>();
const CACHE = { edgeTtlSeconds: 60 * 60, staleWhileRevalidateSeconds: 24 * 60 * 60, cacheTags: ["web-api-og"] } as const;

function discoveryModelName(modelId: string): string {
	return (modelId.split("/").at(-1) ?? modelId)
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

publicOgRouter.get("/og", async (c) => {
	const kind = c.req.query("kind")?.trim(); const id = c.req.query("id")?.trim();
	const discoveryRequested = c.req.query("discovery") === "1";
	if (!kind || !id) return c.json({ error: "invalid_og_reference" }, 400);
	try {
		const client = getDataClient(c.env); let payload: Record<string, unknown> | null = null;
		if (kind === "organisations") { const result = await client.from("v2_labs").select("lab_slug,name,status").eq("lab_slug", id).maybeSingle(); if (result.error) throw result.error; if (!result.data || result.data.status === "disabled") return c.json({ error: "og_not_found" }, 404, PRIVATE_NO_STORE_HEADERS); payload = { id: result.data.lab_slug, name: result.data.name ?? result.data.lab_slug, logoId: result.data.lab_slug }; }
		else if (kind === "models") {
			const visibility = await client.rpc("catalog_model_is_public", { p_model_slug: id });
			if (visibility.error) throw visibility.error;
			if (visibility.data === true) {
				const result = await client.from("v2_models").select("model_slug,name,lab_slug,status").eq("model_slug", id).eq("hidden", false).maybeSingle();
				if (result.error) throw result.error;
				if (result.data) payload = { id: result.data.model_slug, name: result.data.name ?? result.data.model_slug, logoId: result.data.lab_slug ?? undefined, badge: result.data.status ?? undefined };
			}
			if (!payload && discoveryRequested) {
				const modelIds = [...new Set([id, id.split("/").slice(1).join("/")].filter(Boolean))];
				let discoveryQuery = client
					.from("model_discovery_review_items")
					.select("model_id,provider_id")
					.in("model_id", modelIds)
					.eq("change_type", "added")
					.in("status", ["pending", "in_progress", "approved"])
					.limit(1);
				if (id.includes("/")) discoveryQuery = discoveryQuery.eq("provider_id", id.split("/")[0]);
				const discovery = await discoveryQuery.maybeSingle();
				if (discovery.error) throw discovery.error;
				if (discovery.data) payload = { id, name: discoveryModelName(id), subtitle: "Detected by Phaseo model discovery", logoId: discovery.data.provider_id ?? undefined };
			}
		}
		else if (kind === "benchmarks") { const result = await client.from("v2_benchmarks").select("benchmark_id,name").eq("benchmark_id", id).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.benchmark_id, name: result.data.name ?? result.data.benchmark_id }; }
		else if (kind === "api-providers") {
			const result = await client.from("v2_providers").select("provider_slug,name,status,routable,routing_enabled,metadata").eq("provider_slug", id).maybeSingle();
			if (result.error) throw result.error;
			const provider = result.data;
			if (provider && ["active", "degraded"].includes(String(provider.status ?? "").trim().toLowerCase())
				&& !(provider.metadata?.self_serve && (!provider.routable || !provider.routing_enabled))) {
				payload = { id: provider.provider_slug, name: provider.name ?? provider.provider_slug, logoId: provider.provider_slug };
			}
		}
		else if (kind === "subscription-plans") { const result = await client.from("v2_subscription_plans").select("plan_id,name,lab_slug").or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).eq("plan_id", id).limit(1).maybeSingle(); if (result.error) throw result.error; if (result.data) payload = { id: result.data.plan_id, name: result.data.name ?? result.data.plan_id, logoId: result.data.lab_slug ?? undefined }; }
		else if (kind === "countries") { const iso = id.toUpperCase(); if (/^[A-Z]{2}$/.test(iso)) { const [a, b] = iso; const base = 0x1f1e6; payload = { id: iso, name: new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso, flagEmoji: String.fromCodePoint(base + a.charCodeAt(0) - 65, base + b.charCodeAt(0) - 65) }; } }
		else return c.json({ error: "invalid_og_kind" }, 400);
		if (!payload) return c.json({ error: "og_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		return withPublicCache(c.json({ payload }), CACHE);
	} catch (error) { console.error("[web-api/og] payload failed", { kind, id, error }); return c.json({ error: "og_unavailable" }, 503); }
});

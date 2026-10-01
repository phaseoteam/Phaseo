import { Hono } from "hono";

import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS, withPublicCache } from "@/http/cache";

export const publicOgRouter = new Hono<{ Bindings: Env }>();

const OG_QUERY_TIMEOUT_MS = 5_000;
const MODEL_ID_MAX_LENGTH = 512;
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._:/+@-]*$/;
const SAFE_ID_PATTERN = /^[^\u0000-\u001f\u007f]+$/;
const OG_KINDS = [
	"organisations",
	"models",
	"benchmarks",
	"api-providers",
	"countries",
	"subscription-plans",
] as const;
type OgKind = (typeof OG_KINDS)[number];

const CACHE = {
	edgeTtlSeconds: 60 * 60,
	staleWhileRevalidateSeconds: 24 * 60 * 60,
	staleIfErrorSeconds: 7 * 24 * 60 * 60,
	cacheTags: ["web-api-og"],
} as const;

function isOgKind(value: string): value is OgKind {
	return (OG_KINDS as readonly string[]).includes(value);
}

function isSafeIdentifier(value: string): boolean {
	return value.length <= MODEL_ID_MAX_LENGTH && SAFE_ID_PATTERN.test(value);
}

function isCanonicalModelId(value: string): boolean {
	return value.length <= MODEL_ID_MAX_LENGTH && MODEL_ID_PATTERN.test(value);
}

function startQueryTimeout(): { signal: AbortSignal; dispose: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), OG_QUERY_TIMEOUT_MS);
	return {
		signal: controller.signal,
		dispose: () => clearTimeout(timeout),
	};
}

publicOgRouter.get("/og", async (c) => {
	const kind = c.req.query("kind")?.trim();
	const id = c.req.query("id")?.trim();

	if (!kind || !id) {
		return c.json({ error: "invalid_og_reference" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (!isOgKind(kind)) {
		return c.json({ error: "invalid_og_kind" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	if (!isSafeIdentifier(id) || (kind === "models" && !isCanonicalModelId(id))) {
		return c.json({ error: "invalid_og_reference" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const queryTimeout = startQueryTimeout();

	try {
		const client = getDataClient(c.env);
		let payload: Record<string, unknown> | null = null;

		if (kind === "organisations") {
			const result = await client
				.from("v2_labs")
				.select("lab_slug,name,status")
				.eq("lab_slug", id)
				.abortSignal(queryTimeout.signal)
				.maybeSingle();
			if (result.error) throw result.error;
			if (!result.data || result.data.status === "disabled") {
				return c.json({ error: "og_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
			}
			payload = {
				id: result.data.lab_slug,
				name: result.data.name ?? result.data.lab_slug,
				logoId: result.data.lab_slug,
			};
		} else if (kind === "models") {
			// Public cards must come from the public catalog. The internal review
			// queue is deliberately not a fallback for social metadata.
			const visibility = await client
				.rpc("catalog_model_is_public", { p_model_slug: id })
				.abortSignal(queryTimeout.signal);
			if (visibility.error) throw visibility.error;

			if (visibility.data === true) {
				const result = await client
					.from("v2_models")
					.select("model_slug,name,lab_slug,status")
					.eq("model_slug", id)
					.eq("hidden", false)
					.abortSignal(queryTimeout.signal)
					.maybeSingle();
				if (result.error) throw result.error;
				if (result.data) {
					payload = {
						id: result.data.model_slug,
						name: result.data.name ?? result.data.model_slug,
						logoId: result.data.lab_slug ?? undefined,
						badge: result.data.status ?? undefined,
					};
				}
			}

		} else if (kind === "benchmarks") {
			const result = await client
				.from("v2_benchmarks")
				.select("benchmark_id,name")
				.eq("benchmark_id", id)
				.abortSignal(queryTimeout.signal)
				.maybeSingle();
			if (result.error) throw result.error;
			if (result.data) {
				payload = {
					id: result.data.benchmark_id,
					name: result.data.name ?? result.data.benchmark_id,
				};
			}
		} else if (kind === "api-providers") {
			const result = await client
				.from("v2_providers")
				.select("provider_slug,name,status,routable,routing_enabled,metadata")
				.eq("provider_slug", id)
				.abortSignal(queryTimeout.signal)
				.maybeSingle();
			if (result.error) throw result.error;
			const provider = result.data;
			if (
				provider &&
				["active", "degraded"].includes(String(provider.status ?? "").trim().toLowerCase()) &&
				!(provider.metadata?.self_serve && (!provider.routable || !provider.routing_enabled))
			) {
				payload = {
					id: provider.provider_slug,
					name: provider.name ?? provider.provider_slug,
					logoId: provider.provider_slug,
				};
			}
		} else if (kind === "subscription-plans") {
			const result = await client
				.from("v2_subscription_plans")
				.select("plan_id,name,lab_slug")
				.or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
				.eq("plan_id", id)
				.abortSignal(queryTimeout.signal)
				.limit(1)
				.maybeSingle();
			if (result.error) throw result.error;
			if (result.data) {
				payload = {
					id: result.data.plan_id,
					name: result.data.name ?? result.data.plan_id,
					logoId: result.data.lab_slug ?? undefined,
				};
			}
		} else if (kind === "countries") {
			const iso = id.toUpperCase();
			if (/^[A-Z]{2}$/.test(iso)) {
				const [a, b] = iso;
				const base = 0x1f1e6;
				payload = {
					id: iso,
					name: new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso,
					flagEmoji: String.fromCodePoint(
						base + a.charCodeAt(0) - 65,
						base + b.charCodeAt(0) - 65,
					),
				};
			}
		}

		if (!payload) {
			return c.json({ error: "og_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		}
		return withPublicCache(c.json({ payload }), CACHE);
	} catch (error) {
		console.error("[web-api/og] payload failed", {
			kind,
			id,
			timedOut: queryTimeout.signal.aborted,
			error,
		});
		return c.json(
			{ error: queryTimeout.signal.aborted ? "og_timeout" : "og_unavailable" },
			503,
			PRIVATE_NO_STORE_HEADERS,
		);
	} finally {
		queryTimeout.dispose();
	}
});

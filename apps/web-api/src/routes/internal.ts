import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { runWatcher, type WatcherKind } from "@/watchers/run";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import { validateCompatibility, type CompatibilityTarget } from "@/compatibility/validators";
import { internalGatewayBenchmarkRouter } from "@/routes/internal-gateway-benchmark";
import {
	LEGACY_ALLOWED_CACHE_TAGS,
	isCacheScopeId,
	listCacheScopes,
	resolveCacheScope,
} from "@/cache/scopes";

const ALLOWED_TAGS = LEGACY_ALLOWED_CACHE_TAGS;

type RevalidateRequest = {
	tags?: unknown;
};

type WorkersCacheContext = {
	purge(options: { tags: string[] }): Promise<{
		success: boolean;
		errors?: unknown;
	}>;
};

async function getAdminUser(request: Request, env: Env) {
	const user = await requireUser(request, env);
	if (!user) return null;
	const role = await getDataClient(env)
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();
	if (role.error || String(role.data?.role ?? "").toLowerCase() !== "admin") return null;
	return user;
}

function isCrossSiteBrowserRequest(request: Request) {
	return request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site";
}

export const internalRouter = new Hono<{ Bindings: Env }>();

internalRouter.route("/", internalGatewayBenchmarkRouter);

internalRouter.get("/cache", async (c) => {
	if (isCrossSiteBrowserRequest(c.req.raw)) {
		return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const user = await getAdminUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);

	const db = getDataClient(c.env);
	const [generationResult, eventsResult] = await Promise.all([
		db.from("web_cache_generations").select("scope,generation,updated_at,updated_by").order("scope"),
		db
			.from("web_cache_purge_events")
			.select("id,scope,target_id,tags,browser_generation_bumped,generation,actor_user_id,purge_succeeded,purge_error,created_at")
			.order("created_at", { ascending: false })
			.limit(25),
	]);
	if (generationResult.error || eventsResult.error) {
		console.error("cache_control_state_failed", {
			generationError: generationResult.error,
			eventsError: eventsResult.error,
		});
		return c.json({ error: "cache_control_state_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}

	return c.json({
		scopes: listCacheScopes().map((scope) => ({
			...scope,
			tagCount: new Set(scope.tags).size,
		})),
		generations: generationResult.data ?? [],
		events: eventsResult.data ?? [],
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

internalRouter.post("/cache/purge", async (c) => {
	if (isCrossSiteBrowserRequest(c.req.raw)) {
		return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const user = await getAdminUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{
		scope?: unknown;
		targetId?: unknown;
		bumpBrowserGeneration?: unknown;
	}>().catch(() => ({})) as {
		scope?: unknown;
		targetId?: unknown;
		bumpBrowserGeneration?: unknown;
	};
	const scope = String(body.scope ?? "");
	if (!isCacheScopeId(scope)) {
		return c.json({ error: "invalid_cache_scope" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	let resolved: ReturnType<typeof resolveCacheScope>;
	try {
		resolved = resolveCacheScope(
			scope,
			typeof body.targetId === "string" ? body.targetId : null,
		);
	} catch (error) {
		return c.json({
			error: "invalid_cache_target",
			details: error instanceof Error ? error.message : String(error),
		}, 400, PRIVATE_NO_STORE_HEADERS);
	}

	const workersCache = (c.executionCtx as ExecutionContext & {
		cache?: WorkersCacheContext;
	}).cache;
	if (!workersCache) {
		return c.json({ error: "workers_cache_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}

	const db = getDataClient(c.env);
	let purgeResult: Awaited<ReturnType<WorkersCacheContext["purge"]>>;
	try {
		purgeResult = await workersCache.purge({ tags: resolved.tags });
	} catch (error) {
		purgeResult = { success: false, errors: error instanceof Error ? error.message : String(error) };
	}

	const shouldBumpGeneration = resolved.definition.affectsSearch && body.bumpBrowserGeneration !== false;
	let generation: number | null = null;
	let generationWarning: string | null = null;
	if (purgeResult.success && shouldBumpGeneration) {
		const result = await db.rpc("bump_web_cache_generation", {
			p_scope: "search",
			p_actor_user_id: user.id,
		});
		if (result.error) generationWarning = "Edge cache was purged, but browser generation could not be advanced.";
		else generation = Number(result.data);
	}

	const auditError = purgeResult.success ? null : JSON.parse(JSON.stringify(purgeResult.errors ?? "unknown"));
	const auditResult = await db.from("web_cache_purge_events").insert({
		scope,
		target_id: resolved.targetId,
		tags: resolved.tags,
		browser_generation_bumped: generation !== null,
		generation,
		actor_user_id: user.id,
		purge_succeeded: purgeResult.success,
		purge_error: auditError,
	});
	if (auditResult.error) console.error("cache_purge_audit_failed", auditResult.error);

	if (!purgeResult.success) {
		return c.json({ error: "cache_purge_failed", details: purgeResult.errors }, 502, PRIVATE_NO_STORE_HEADERS);
	}

	return c.json({
		success: true,
		scope,
		targetId: resolved.targetId,
		tags: resolved.tags,
		generation,
		generationWarning,
		browserRefreshEnabled: generation !== null,
		purgedAt: new Date().toISOString(),
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

internalRouter.post("/compatibility/validate", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "Unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const role = await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error || String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "Unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: { target?: unknown; payload?: unknown } = await c.req.json().catch(() => ({}));
	const target = body.target as CompatibilityTarget;
	if (!["openai.responses", "openai.chat.completions", "anthropic.messages"].includes(String(target))) return c.json({ error: "Invalid target" }, 400, PRIVATE_NO_STORE_HEADERS);
	try { return c.json(await validateCompatibility(target, body.payload, { openai: c.env.COMPATIBILITY_OPENAI_SPEC_URL, anthropic: c.env.COMPATIBILITY_ANTHROPIC_SPEC_URL }), 200, PRIVATE_NO_STORE_HEADERS); }
	catch (error) { return c.json({ error: "Failed to validate payload", details: error instanceof Error ? error.message : String(error) }, 500, PRIVATE_NO_STORE_HEADERS); }
});

internalRouter.post("/watchers/:kind", async (c) => {
	const authorization = c.req.header("authorization");
	if (!c.env.REVALIDATION_SECRET || authorization !== `Bearer ${c.env.REVALIDATION_SECRET}`) {
		return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	}
	const kind = c.req.param("kind") as WatcherKind;
	if (kind !== "web" && kind !== "youtube") return c.json({ error: "invalid_watcher" }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		return c.json(await runWatcher(kind, c.env, c.executionCtx), 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("manual_watcher_failed", { kind, error });
		return c.json({ error: "watcher_failed" }, 500, PRIVATE_NO_STORE_HEADERS);
	}
});

/**
 * Operational-only cache invalidation. Call this after a model catalogue write
 * or import completes; public callers cannot choose arbitrary cache tags.
 */
internalRouter.post("/revalidate", async (c) => {
	const secret = c.env.REVALIDATION_SECRET;
	const authorization = c.req.header("authorization");
	let authorized = Boolean(secret && authorization === `Bearer ${secret}`);
	if (!authorized) {
		const user = await requireUser(c.req.raw, c.env);
		if (user) {
			const role = await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle();
			authorized = !role.error && String(role.data?.role ?? "").toLowerCase() === "admin";
		}
	}
	if (!authorized) {
		return c.json({ error: "unauthorized" }, 401, {
			"Cache-Control": "private, no-store",
		});
	}

	const body = (await c.req.json().catch(() => ({}))) as RevalidateRequest;
	const tags = Array.from(
		new Set(
			(Array.isArray(body.tags) ? body.tags : [])
				.map((tag) => String(tag).trim())
				.filter((tag) => ALLOWED_TAGS.has(tag)),
		),
	);
	if (tags.length === 0) {
		return c.json({ error: "invalid_tags", allowedTags: [...ALLOWED_TAGS] }, 400, {
			"Cache-Control": "private, no-store",
		});
	}

	// The installed Worker type package predates this recently added context API.
	const workersCache = (c.executionCtx as ExecutionContext & {
		cache?: WorkersCacheContext;
	}).cache;
	if (!workersCache) {
		return c.json({ error: "workers_cache_unavailable" }, 503, {
			"Cache-Control": "private, no-store",
		});
	}

	const result = await workersCache.purge({ tags });
	if (!result.success) {
		return c.json({ error: "cache_purge_failed", details: result.errors }, 502, {
			"Cache-Control": "private, no-store",
		});
	}

	return c.json({ revalidated: tags }, 200, {
		"Cache-Control": "private, no-store",
	});
});

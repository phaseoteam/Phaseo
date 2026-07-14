import { Hono } from "hono";
import type { Env } from "@/env";

const ALLOWED_TAGS = new Set([
	"web-api-models",
	"web-api-models-v2",
	"web-api-model-details",
	"web-api-model-benchmarks",
	"web-api-model-performance",
	"web-api-model-timelines",
	"web-api-model-subscriptions",
	"web-api-model-pricing",
]);

type RevalidateRequest = {
	tags?: unknown;
};

type WorkersCacheContext = {
	purge(options: { tags: string[] }): Promise<{
		success: boolean;
		errors?: unknown;
	}>;
};

export const internalRouter = new Hono<{ Bindings: Env }>();

/**
 * Operational-only cache invalidation. Call this after a model catalogue write
 * or import completes; public callers cannot choose arbitrary cache tags.
 */
internalRouter.post("/revalidate", async (c) => {
	const secret = c.env.REVALIDATION_SECRET;
	const authorization = c.req.header("authorization");
	if (!secret || authorization !== `Bearer ${secret}`) {
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

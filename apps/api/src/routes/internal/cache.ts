// Purpose: Internal cache administration routes.
// Why: Lets trusted internal tools purge Worker Cache entries after data changes.
// How: Authenticates with the internal gateway token and purges by cache tag.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json } from "@/routes/utils";

export const internalCacheRoutes = new Hono<Env>();

const ALLOWED_PURGE_TAGS = new Set(["catalog", "models"]);

function timingSafeEqualText(a: string, b: string): boolean {
	const len = Math.max(a.length, b.length);
	let diff = a.length === b.length ? 0 : 1;
	for (let i = 0; i < len; i += 1) {
		const ca = i < a.length ? a.charCodeAt(i) : 0;
		const cb = i < b.length ? b.charCodeAt(i) : 0;
		diff |= ca ^ cb;
	}
	return diff === 0;
}

function isAuthorized(req: Request, env: Env["Bindings"]): boolean {
	const configured = String(env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();
	if (!configured || configured.length < 128) return false;
	const provided = String(
		req.headers.get("x-internal-token") ??
			req.headers.get("x-aistats-internal-token") ??
			req.headers.get("x-ai-stats-internal-token") ??
			"",
	).trim();
	return Boolean(provided) && timingSafeEqualText(provided, configured);
}

async function readPurgeTags(req: Request): Promise<string[]> {
	let body: any = {};
	try {
		body = await req.json();
	} catch {
		return [];
	}
	const rawTags = Array.isArray(body?.tags) ? body.tags : [];
	return Array.from(
		new Set(
			rawTags
				.map((tag) => String(tag ?? "").trim())
				.filter((tag) => ALLOWED_PURGE_TAGS.has(tag)),
		),
	);
}

internalCacheRoutes.post("/purge", async (c) => {
	if (!isAuthorized(c.req.raw, c.env)) {
		return json({ ok: false, error: "unauthorized" }, 401, { "Cache-Control": "no-store" });
	}

	const tags = await readPurgeTags(c.req.raw);
	if (!tags.length) {
		return json(
			{
				ok: false,
				error: "invalid_tags",
				message: "Provide at least one supported cache tag.",
				supported_tags: Array.from(ALLOWED_PURGE_TAGS).sort(),
			},
			400,
			{ "Cache-Control": "no-store" },
		);
	}

	const cache = (c.executionCtx as any)?.cache;
	if (!cache || typeof cache.purge !== "function") {
		return json(
			{
				ok: false,
				error: "cache_purge_unavailable",
				message: "Workers Cache purge API is not available in this runtime.",
			},
			501,
			{ "Cache-Control": "no-store" },
		);
	}

	await cache.purge({ tags });
	return json({ ok: true, purged_tags: tags }, 200, { "Cache-Control": "no-store" });
});

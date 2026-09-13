import { Hono } from "hono";

import type { Env } from "@/env";

export const frontendProfileAvatarsRouter = new Hono<{ Bindings: Env }>();

frontendProfileAvatarsRouter.get("/profile-avatars/*", async (c) => {
	const bucket = c.env.PROFILE_AVATARS_BUCKET;
	if (!bucket) return c.json({ error: "not_found" }, 404);
	const routePrefix = "/api/_web/profile-avatars/";
	const pathname = new URL(c.req.url).pathname;
	const key = pathname.startsWith(routePrefix) ? pathname.slice(routePrefix.length) : "";
	if ((!key.startsWith("avatars/") && !key.startsWith("workspaces/")) || key.includes("..")) return c.json({ error: "not_found" }, 404);

	const object = await bucket.get(key);
	if (!object) return c.json({ error: "not_found" }, 404);
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");
	headers.set("cloudflare-cdn-cache-control", "public, max-age=31536000, immutable");
	headers.set("x-content-type-options", "nosniff");
	return new Response(object.body, { headers });
});

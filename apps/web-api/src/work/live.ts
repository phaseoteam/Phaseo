// Near-live updates: the web app asks every few seconds for a version stamp of what it shows and
// refreshes only when the stamp changes. One indexed read per poll, no subscriptions to keep.
//
//   GET /live?workspaceId=...             the workspace: newest item change
//   GET /live?workspaceId=...&number=12   one item: its newest change or activity (comments, runs, GitHub)

import { accessFromQuery, badRequest, json, notFound, unavailable } from "@/routes/account/work-shared";

/** The later of two ISO timestamps (either may be missing). */
export function laterStamp(a: string | null | undefined, b: string | null | undefined): string | null {
	if (!a) return b ?? null;
	if (!b) return a;
	return Date.parse(a) >= Date.parse(b) ? a : b;
}

async function handleLive(c: any): Promise<Response> {
	const access = await accessFromQuery(c);
	if ("response" in access) return access.response;
	const { context } = access;
	const numberText = c.req.query("number");
	if (numberText !== undefined) {
		const number = Number(numberText);
		if (!Number.isInteger(number) || number <= 0) return badRequest(c, "number must be an item number");
		const { data, error } = await context.client.from("work_items").select("updated_at,last_activity_at")
			.eq("workspace_id", context.workspaceId).eq("number", number).maybeSingle();
		if (error) return unavailable(c);
		if (!data) return notFound(c, "Item not found");
		return json(c, { stamp: laterStamp(data.updated_at, data.last_activity_at) }, 200);
	}
	const { data, error } = await context.client.from("work_items").select("updated_at")
		.eq("workspace_id", context.workspaceId).order("updated_at", { ascending: false }).limit(1);
	if (error) return unavailable(c);
	return json(c, { stamp: ((data ?? [])[0] as { updated_at?: string } | undefined)?.updated_at ?? null }, 200);
}

type RouteHandler = (c: any) => Promise<Response>;

export function registerLiveRoutes(router: { get: (path: string, handler: RouteHandler) => unknown }): void {
	router.get("/live", handleLive);
}

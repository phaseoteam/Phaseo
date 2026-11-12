import { Hono } from "hono";
import type { Context } from "hono";
import { requireUser } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

// The app's "Your week" screen, which the weekly digest push opens
// (/account/week?workspace=<id>&week=<YYYY-Www>): one workspace's ISO week in the user's time zone.
// Everything is summed in SQL by get_mobile_week_summary from the usage overview's exact figures;
// this route only checks membership, the way the usage pages do (any member may read the
// workspace's usage), and passes the answer on.
//
// GET /api/account/settings/mobile-notifications/week?workspaceId=<uuid>&week=<YYYY-Www>&timeZone=<IANA>
//   week defaults to the current week; timeZone to the user's most recently seen device's, else UTC.
// 200: { week, timeZone, from, to, weekEnd, complete, workspace: { id, name },
//        totals: { spend, requests, successfulRequests, successRate, inputTokens, outputTokens, tokens },
//        previous: { from, to, ...the same totals over the same span of the week before },
//        change: { spend, requests } (fractions, null unless both spans are above zero),
//        days: [{ date, spend, requests, inputTokens, outputTokens, tokens }] (all seven),
//        topModels: [{ modelId, name, spend, requests }] (up to five, by requests),
//        releases: { matching: "rules", count, items: [{ modelId, name, labId, labName, kind, occurredAt, href }] } }
// Spend is in US dollars; times are UTC ISO strings and dates are local to timeZone.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

type AppContext = Context<{ Bindings: Env }>;

function invalid(c: AppContext, error: string, message: string) {
	return c.json({ error, message }, 400, PRIVATE_NO_STORE_HEADERS);
}

function isTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export const accountSettingsMobileWeekRouter = new Hono<{ Bindings: Env }>();

accountSettingsMobileWeekRouter.get("/mobile-notifications/week", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized", message: "Sign in to see your week." }, 401, PRIVATE_NO_STORE_HEADERS);
	// The app's own link carries ?workspace=, so it is accepted too.
	const workspaceId = (c.req.query("workspaceId") ?? c.req.query("workspace") ?? "").trim().toLowerCase();
	if (!workspaceId) return invalid(c, "workspace_required", "Choose a workspace.");
	if (!UUID.test(workspaceId)) return invalid(c, "invalid_workspace", "workspaceId must be a workspace id.");
	const week = c.req.query("week")?.trim().toUpperCase() || null;
	if (week && !ISO_WEEK.test(week)) return invalid(c, "invalid_week", 'week must be an ISO week such as "2026-W43".');
	const timeZone = c.req.query("timeZone")?.trim() || null;
	if (timeZone && (timeZone.length > 64 || !isTimeZone(timeZone))) {
		return invalid(c, "invalid_time_zone", 'timeZone must be an IANA time zone such as "Europe/London".');
	}

	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden", message: "You are not a member of that workspace." }, 403, PRIVATE_NO_STORE_HEADERS);

	const result = await context.client.rpc("get_mobile_week_summary", {
		p_user_id: user.id,
		p_workspace_id: workspaceId,
		p_week: week,
		p_time_zone: timeZone,
	});
	if (result.error) {
		// A zone the browser knows but the database does not.
		if (result.error.code === "22023") return invalid(c, "invalid_time_zone", 'timeZone must be an IANA time zone such as "Europe/London".');
		console.error("[web-api/settings] week summary failed", result.error.message);
		return c.json({ error: "week_summary_unavailable", message: "Your week is unavailable right now. Try again shortly." }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	if (!result.data) return invalid(c, "invalid_week", "There is no such week.");
	return c.json(result.data, 200, PRIVATE_NO_STORE_HEADERS);
});

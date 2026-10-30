import { Hono, type Context } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

// Public routes behind the unsubscribe link in spend report emails. The unguessable token in the
// URL is the only credential: it names one person and one workspace, and only switches that
// person's report emails for that workspace off or back on (public.set_spend_report_subscription).
// Unlike the feedback unsubscribe it leaves the Resend contact alone: account and billing email,
// and other workspaces' reports, keep arriving.
export const publicSpendReportsRouter = new Hono<{ Bindings: Env }>();

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SpendReportSubscription = { workspaceName: string; subscribed: boolean };

async function setSubscription(env: Env, token: string, subscribed: boolean | null): Promise<SpendReportSubscription | null> {
	const { data, error } = await getDataClient(env).rpc("set_spend_report_subscription", { p_token: token, p_subscribed: subscribed });
	if (error) throw error;
	if (!data || typeof data !== "object") return null;
	const result = data as { workspace_name?: unknown; subscribed?: unknown };
	return { workspaceName: typeof result.workspace_name === "string" ? result.workspace_name : "your workspace", subscribed: result.subscribed === true };
}

function route(subscribed: boolean | null) {
	return async (c: Context<{ Bindings: Env }>) => {
		const token = c.req.param("token") ?? "";
		if (!TOKEN_PATTERN.test(token)) return c.json({ error: "not_found" }, 404, NO_STORE);
		try {
			const result = await setSubscription(c.env, token, subscribed);
			if (!result) return c.json({ error: "not_found" }, 404, NO_STORE);
			return c.json(result, 200, NO_STORE);
		} catch (error) {
			console.error("[web-api/spend-reports] subscription update failed", { error, subscribed });
			return c.json({ error: "spend_reports_unavailable" }, 503, NO_STORE);
		}
	};
}

// The unsubscribe page reads where things stand.
publicSpendReportsRouter.get("/:token", route(null));
// Serves both the page's button and RFC 8058 one-click unsubscribe, which mail clients send as a
// form POST without cookies. Repeating it is harmless.
publicSpendReportsRouter.post("/:token/unsubscribe", route(false));
// Undo from the same page.
publicSpendReportsRouter.post("/:token/subscribe", route(true));

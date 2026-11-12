import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { slackAgentMonthlyCharge } from "@/billing/slackAgentPricing";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { currentPeriodStart } from "@/routes/account/settings-slack";
import { nanosToUsd } from "@/routes/account/slack-agent-settings";

// Every Slack agent installation for Phaseo staff: its Phaseo workspace and Slack
// team, its state, and this UTC month's people, answers, Slack agent charge
// estimate and model spend through its key. list_slack_agent_installations sums everything in the
// database; only the price is worked out here, from the same pricing the
// settings page and the month-end charge use.

const PAGE_SIZE = 100;
const MAX_OFFSET = 100_000;

type InstallationRow = {
	installation_id: string;
	workspace_id: string;
	workspace_name: string | null;
	team_id: string | null;
	team_name: string | null;
	enterprise_id: string | null;
	custom_app: boolean;
	slack_app_id: string | null;
	status: string;
	installed_at: string;
	uninstalled_at: string | null;
	plan_people: number;
	monthly_cap_nanos: number | string;
	people: number;
	answers: number | string;
	model_requests: number | string;
	model_cost_nanos: number | string;
	total: number | string;
};

export const internalSlackAgentRouter = new Hono<{ Bindings: Env }>();

internalSlackAgentRouter.use("/slack-agent/*", async (c, next) => {
	if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "cross_site_request_blocked" }, 403, PRIVATE_NO_STORE_HEADERS);
	const user = await requireUser(c.req.raw, c.env);
	const role = user ? await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle() : null;
	if (!user || role?.error || String(role?.data?.role).toLowerCase() !== "admin") {
		console.warn("slack_agent_installations_access_denied", { actorId: user?.id ?? null });
		return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	for (const [key, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) c.header(key, value);
	await next();
});

internalSlackAgentRouter.get("/slack-agent/installations", async (c) => {
	const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(c.req.query("offset")) || 0)));
	const periodStart = currentPeriodStart();
	const { data, error } = await getDataClient(c.env).rpc("list_slack_agent_installations", {
		p_period_start: periodStart, p_limit: PAGE_SIZE, p_offset: offset,
	});
	if (error) {
		console.error("[slack-agent] internal installations unavailable", { message: error.message });
		return c.json({ error: "slack_installations_unavailable" }, 503);
	}
	const rows = (data ?? []) as InstallationRow[];
	return c.json({
		period_start: periodStart,
		offset,
		page_size: PAGE_SIZE,
		total: Number(rows[0]?.total ?? 0) || 0,
		installations: rows.map((row) => {
			const people = Number(row.people) || 0;
			const answers = Number(row.answers) || 0;
			const estimate = slackAgentMonthlyCharge({ people, answers, capNanos: Number(row.monthly_cap_nanos) });
			return {
				id: row.installation_id,
				workspace_id: row.workspace_id,
				workspace_name: row.workspace_name,
				team_id: row.team_id,
				team_name: row.team_name,
				enterprise_id: row.enterprise_id,
				custom_app: row.custom_app === true,
				slack_app_id: row.slack_app_id,
				status: row.status,
				installed_at: row.installed_at,
				uninstalled_at: row.uninstalled_at,
				plan_people: row.plan_people,
				month: {
					people,
					answers,
					estimated_charge_usd: nanosToUsd(estimate.chargeNanos),
					model_requests: Number(row.model_requests) || 0,
					model_spend_usd: nanosToUsd(row.model_cost_nanos),
				},
			};
		}),
	});
});

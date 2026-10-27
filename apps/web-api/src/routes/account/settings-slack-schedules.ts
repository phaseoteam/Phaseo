import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "@/env";
import { auditSlack, badRequest, json, liveInstallation, managerContext, readBody } from "./settings-slack";
import { MAX_SCHEDULES } from "./slack-agent-settings";

// The Slack agent's recurring tasks, for the live installation's owners and
// admins: the list (what, where, how often, next run, who set it up, the last
// result), pausing, resuming and deleting one. People set them up in Slack, only
// through a database function that holds the admins' settings; resuming goes
// through one too, so the next run is computed in the database and never comes
// sooner than an hour after the last. Uninstalling deletes them all in the
// database. Audit events record ids, never a task's text.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCHEDULE_COLUMNS = [
	"id", "channel_id", "title", "prompt", "frequency", "hour", "minute", "day_of_week", "day_of_month", "timezone", "created_by",
	"status", "pause_reason", "next_run_at", "last_run_at", "last_result", "last_result_reason", "failures", "created_at",
].join(",");
const STATUS_FIELDS = new Set(["workspaceId", "status"]);

type ScheduleRow = {
	id: string;
	channel_id: string;
	title: string;
	prompt: string;
	frequency: string;
	hour: number | null;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	timezone: string;
	created_by: string;
	status: string;
	pause_reason: string | null;
	next_run_at: string;
	last_run_at: string | null;
	last_result: string | null;
	last_result_reason: string | null;
	failures: number;
	created_at: string;
};

function scheduleView(row: ScheduleRow) {
	return {
		id: row.id,
		channel_id: row.channel_id,
		title: row.title,
		prompt: row.prompt,
		frequency: row.frequency,
		hour: row.hour,
		minute: row.minute,
		day_of_week: row.day_of_week,
		day_of_month: row.day_of_month,
		timezone: row.timezone,
		created_by: row.created_by,
		status: row.status,
		pause_reason: row.pause_reason,
		next_run_at: row.next_run_at,
		last_run_at: row.last_run_at,
		last_result: row.last_result,
		last_result_reason: row.last_result_reason,
		failures: Number(row.failures) || 0,
		created_at: row.created_at,
	};
}

/** A pause or resume: status active or paused, nothing else. */
export function parseScheduleStatus(body: Record<string, unknown>): { ok: true; status: "active" | "paused" } | { ok: false; message: string } {
	const unknown = Object.keys(body).find((field) => !STATUS_FIELDS.has(field));
	if (unknown) return { ok: false, message: `Unknown field: ${unknown}` };
	if (body.status !== "active" && body.status !== "paused") return { ok: false, message: "status must be active or paused" };
	return { ok: true, status: body.status };
}

function notFound(c: any) {
	return json(c, { error: "schedule_not_found", message: "It was deleted meanwhile. Reload to see what is left" }, 404);
}

type Installation = { id: string; team_name: string | null; schedules_enabled: boolean; schedules_max: number; schedule_creators: string };

/** The manager's context and the live installation, or the response that ends the request. */
async function managedInstallation(c: any, workspaceId: unknown) {
	const access = await managerContext(c, workspaceId);
	if (access.response) return { response: access.response } as const;
	const live = await liveInstallation(access.context.client, access.context.workspaceId, "id,team_name,schedules_enabled,schedules_max,schedule_creators");
	if (live.error) return { response: json(c, { error: "settings_unavailable" }, 503) } as const;
	if (!live.row) return { response: json(c, { error: "not_installed", message: "The Slack agent is not installed in this workspace" }, 404) } as const;
	return { context: access.context, installation: live.row as unknown as Installation };
}

export const accountSettingsSlackSchedulesRouter = new Hono<{ Bindings: Env }>();

accountSettingsSlackSchedulesRouter.get("/slack/schedules", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return badRequest(c, "workspaceId is required");
	const access = await managedInstallation(c, workspaceId);
	if ("response" in access) return access.response;
	const { context, installation } = access;
	// An installation keeps at most MAX_SCHEDULES, so one page holds them all; the database counts them.
	const listed = await context.client.from("slack_agent_schedules").select(SCHEDULE_COLUMNS, { count: "exact" })
		.eq("installation_id", installation.id).order("created_at", { ascending: true }).order("id").limit(MAX_SCHEDULES);
	if (listed.error) return json(c, { error: "settings_unavailable" }, 503);
	return json(c, {
		schedules: ((listed.data ?? []) as unknown as ScheduleRow[]).map(scheduleView),
		total: listed.count ?? 0,
		limit: installation.schedules_max,
		enabled: installation.schedules_enabled,
		creators: installation.schedule_creators,
	});
});

accountSettingsSlackSchedulesRouter.patch("/slack/schedules/:id", bodyLimit({ maxSize: 8 * 1024 }), async (c) => {
	const id = c.req.param("id");
	if (!UUID_PATTERN.test(id)) return badRequest(c, "id must be a schedule id");
	const body = await readBody(c);
	const parsed = parseScheduleStatus(body);
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const access = await managedInstallation(c, body.workspaceId);
	if ("response" in access) return access.response;
	const { context, installation } = access;
	const updated = await context.client.rpc("set_slack_agent_schedule_status", { p_installation_id: installation.id, p_schedule_id: id, p_status: parsed.status });
	if (updated.error) return json(c, { error: "settings_write_failed" }, 503);
	if (!updated.data) return notFound(c);
	await auditSlack(c, context, parsed.status === "paused" ? "schedule_paused" : "schedule_resumed", { id, type: "slack_agent_schedule" }, { installation_id: installation.id });
	return json(c, { schedule: scheduleView(updated.data as unknown as ScheduleRow) });
});

accountSettingsSlackSchedulesRouter.delete("/slack/schedules/:id", async (c) => {
	const id = c.req.param("id");
	if (!UUID_PATTERN.test(id)) return badRequest(c, "id must be a schedule id");
	const body = await readBody(c);
	const access = await managedInstallation(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context, installation } = access;
	const removed = await context.client.from("slack_agent_schedules").delete()
		.eq("id", id).eq("installation_id", installation.id).select("id").maybeSingle();
	if (removed.error) return json(c, { error: "settings_write_failed" }, 503);
	if (!removed.data) return notFound(c);
	await auditSlack(c, context, "schedule_deleted", { id, type: "slack_agent_schedule" }, { installation_id: installation.id });
	return json(c, { id, deleted: true });
});

// Ambient follow-ups on stalled items, run by the work scheduled job. Off unless the Worker's
// WORK_AMBIENT_ENABLED is "true" AND the workspace turned ambient_enabled on (default off).
//
// An open item is stalled when its last_activity_at is older than the workspace's stall_days. Each
// run writes, for at most 20 stalled items per workspace, one `stalled` event from the agent ("No
// activity for N days.") and a `stalled` notification to the assignee (or, with no assignee, the
// subscribers). An item is followed up at most once per stall period: not again while it has a
// stalled event newer than the period's start. The event is not activity, so nothing is bumped.
//
// The optional gateway "next step" line is left out: runs have no signed-in user, and a model call
// per stalled item on a schedule is spend nobody asked for. The event is plain text only.

import type { Env } from "@/env";
import { addWorkItemEvent, type DataClient } from "./items";
import { notify, subscriberIds } from "./notifications";
import { DEFAULT_STALL_DAYS, MAX_STALL_DAYS, MIN_STALL_DAYS } from "./settings";

export const MAX_STALLED_PER_WORKSPACE = 20;
/** Candidates read per workspace per run, so items already followed up don't crowd out the rest. */
const MAX_CANDIDATES = 100;
const MAX_WORKSPACES_PER_RUN = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
export const OPEN_WORK_STATES = ["triage", "backlog", "todo", "in_progress", "in_review"] as const;
const AMBIENT_AGENT_NAME = "Ambient agent";

export function ambientEnabled(env: Pick<Env, "WORK_AMBIENT_ENABLED">): boolean {
	return String(env.WORK_AMBIENT_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function stalledEventBody(days: number): string {
	return `No activity for ${days} ${days === 1 ? "day" : "days"}.`;
}

type CandidateRow = { id: string; number: number; title: string; assignee_user_id: string | null; last_activity_at: string };

export type AmbientSummary = { workspaces: number; stalled: number };

function clampStallDays(value: unknown): number {
	const days = Number(value);
	return Number.isInteger(days) && days >= MIN_STALL_DAYS && days <= MAX_STALL_DAYS ? days : DEFAULT_STALL_DAYS;
}

/** Follows up one workspace's stalled items. Returns how many got an event. */
export async function followUpStalledItems(client: DataClient, workspaceId: string, stallDaysValue: unknown, now: Date): Promise<number> {
	const stallDays = clampStallDays(stallDaysValue);
	const periodStart = new Date(now.getTime() - stallDays * DAY_MS).toISOString();
	const candidates = await client.from("work_items")
		.select("id,number,title,assignee_user_id,last_activity_at")
		.eq("workspace_id", workspaceId)
		.in("state", [...OPEN_WORK_STATES])
		.lt("last_activity_at", periodStart)
		.order("last_activity_at", { ascending: true })
		.limit(MAX_CANDIDATES);
	if (candidates.error) throw new Error(`stalled items read failed: ${candidates.error.message}`);
	const rows = (candidates.data ?? []) as CandidateRow[];
	if (!rows.length) return 0;

	// Items already followed up in this stall period (their stalled event is newer than its start).
	const recent = await client.from("work_item_events")
		.select("work_item_id")
		.eq("workspace_id", workspaceId)
		.eq("kind", "stalled")
		.in("work_item_id", rows.map((row) => row.id))
		.gte("created_at", periodStart)
		.limit(1_000);
	if (recent.error) throw new Error(`stalled events read failed: ${recent.error.message}`);
	const followedUp = new Set(((recent.data ?? []) as Array<{ work_item_id: string }>).map((row) => row.work_item_id));

	let written = 0;
	for (const row of rows) {
		if (written >= MAX_STALLED_PER_WORKSPACE) break;
		if (followedUp.has(row.id)) continue;
		const days = Math.max(stallDays, Math.floor((now.getTime() - Date.parse(row.last_activity_at)) / DAY_MS));
		try {
			await addWorkItemEvent(client, {
				workspaceId,
				workItemId: row.id,
				kind: "stalled",
				authorKind: "agent",
				authorName: AMBIENT_AGENT_NAME,
				body: stalledEventBody(days),
				data: { days, stallDays, lastActivityAt: row.last_activity_at },
			});
		} catch (error) {
			console.error("[work] stalled event not written", { itemId: row.id, message: error instanceof Error ? error.message : String(error) });
			continue;
		}
		written += 1;
		const recipients = row.assignee_user_id ? [row.assignee_user_id] : await subscriberIds(client, row.id);
		await notify(client, {
			workspaceId,
			userIds: recipients,
			workItemId: row.id,
			kind: "stalled",
			actorName: AMBIENT_AGENT_NAME,
			body: `#${row.number} ${row.title}: ${stalledEventBody(days)}`,
		});
	}
	return written;
}

/** One ambient pass over the workspaces that turned it on. A no-op while the env flag is off. */
export async function runAmbientFollowUps(args: { env: Pick<Env, "WORK_AMBIENT_ENABLED">; client: DataClient; now?: Date }): Promise<AmbientSummary> {
	if (!ambientEnabled(args.env)) return { workspaces: 0, stalled: 0 };
	const now = args.now ?? new Date();
	const { data, error } = await args.client.from("work_settings")
		.select("workspace_id,stall_days")
		.eq("ambient_enabled", true)
		.limit(MAX_WORKSPACES_PER_RUN);
	if (error) throw new Error(`work_settings read failed: ${error.message}`);
	const workspaces = (data ?? []) as Array<{ workspace_id: string; stall_days: number }>;
	let stalled = 0;
	for (const workspace of workspaces) {
		try {
			stalled += await followUpStalledItems(args.client, workspace.workspace_id, workspace.stall_days, now);
		} catch (workspaceError) {
			console.error("[work] ambient follow-ups failed", { workspaceId: workspace.workspace_id, message: workspaceError instanceof Error ? workspaceError.message : String(workspaceError) });
		}
	}
	return { workspaces: workspaces.length, stalled };
}

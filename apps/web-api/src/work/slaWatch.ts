// SLA watch, run by the work scheduled job. Off unless the Worker's WORK_SLA_WATCH_ENABLED is
// "true" (default off).
//
// Open items with an sla_due_at within the next 2 hours get one `sla` event ("at_risk") and
// notification; items past it get one more ("breached"). Each threshold is written once per due
// time: a later priority change moves sla_due_at, and the new due time can warn again. An item
// already past its due time when first seen gets only the breached warning. Notifications go to
// the assignee, or the subscribers when there is none. Events here are not activity.

import type { Env } from "@/env";
import { addWorkItemEvent, type DataClient } from "./items";
import { notify, subscriberIds } from "./notifications";
import { OPEN_WORK_STATES } from "./ambient";

export const SLA_WARNING_MS = 2 * 60 * 60 * 1000;
/** Items read per run, most recently due first, so new warnings are never crowded out by old breaches. */
const MAX_ITEMS_PER_RUN = 200;
const SLA_WATCH_NAME = "SLA watch";

export type SlaThreshold = "at_risk" | "breached";

export function slaWatchEnabled(env: Pick<Env, "WORK_SLA_WATCH_ENABLED">): boolean {
	return String(env.WORK_SLA_WATCH_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** The threshold an item is at now, or null when its due time is more than 2 hours away. */
export function slaThreshold(dueAt: string, now: Date): SlaThreshold | null {
	const due = Date.parse(dueAt);
	if (!Number.isFinite(due)) return null;
	if (now.getTime() >= due) return "breached";
	if (due - now.getTime() <= SLA_WARNING_MS) return "at_risk";
	return null;
}

export function slaEventBody(threshold: SlaThreshold): string {
	return threshold === "breached" ? "SLA breached: the item is past its due time." : "SLA at risk: due in under 2 hours.";
}

type SlaItemRow = { id: string; workspace_id: string; number: number; title: string; assignee_user_id: string | null; sla_due_at: string };

export type SlaWatchSummary = { checked: number; warned: number };

export async function runSlaWatch(args: { env: Pick<Env, "WORK_SLA_WATCH_ENABLED">; client: DataClient; now?: Date }): Promise<SlaWatchSummary> {
	if (!slaWatchEnabled(args.env)) return { checked: 0, warned: 0 };
	const { client } = args;
	const now = args.now ?? new Date();
	const horizon = new Date(now.getTime() + SLA_WARNING_MS).toISOString();
	const items = await client.from("work_items")
		.select("id,workspace_id,number,title,assignee_user_id,sla_due_at")
		.in("state", [...OPEN_WORK_STATES])
		.lte("sla_due_at", horizon)
		.order("sla_due_at", { ascending: false })
		.limit(MAX_ITEMS_PER_RUN);
	if (items.error) throw new Error(`SLA items read failed: ${items.error.message}`);
	const rows = ((items.data ?? []) as SlaItemRow[]).filter((row) => typeof row.sla_due_at === "string");
	if (!rows.length) return { checked: 0, warned: 0 };

	const events = await client.from("work_item_events")
		.select("work_item_id,data")
		.eq("kind", "sla")
		.in("work_item_id", rows.map((row) => row.id))
		.limit(2_000);
	if (events.error) throw new Error(`SLA events read failed: ${events.error.message}`);
	const written = new Set<string>();
	for (const event of (events.data ?? []) as Array<{ work_item_id: string; data: Record<string, unknown> | null }>) {
		const threshold = event.data?.threshold;
		const dueAt = event.data?.dueAt;
		if (typeof threshold === "string" && typeof dueAt === "string") written.add(`${event.work_item_id}|${threshold}|${Date.parse(dueAt)}`);
	}

	let warned = 0;
	for (const row of rows) {
		const threshold = slaThreshold(row.sla_due_at, now);
		if (!threshold) continue;
		const due = Date.parse(row.sla_due_at);
		if (written.has(`${row.id}|${threshold}|${due}`)) continue;
		try {
			await addWorkItemEvent(client, {
				workspaceId: row.workspace_id,
				workItemId: row.id,
				kind: "sla",
				authorKind: "system",
				authorName: SLA_WATCH_NAME,
				body: slaEventBody(threshold),
				data: { threshold, dueAt: row.sla_due_at },
			});
		} catch (error) {
			console.error("[work] SLA event not written", { itemId: row.id, message: error instanceof Error ? error.message : String(error) });
			continue;
		}
		warned += 1;
		const recipients = row.assignee_user_id ? [row.assignee_user_id] : await subscriberIds(client, row.id);
		await notify(client, {
			workspaceId: row.workspace_id,
			userIds: recipients,
			workItemId: row.id,
			kind: "sla",
			actorName: SLA_WATCH_NAME,
			body: `#${row.number} ${row.title}: ${slaEventBody(threshold)}`,
		});
	}
	return { checked: rows.length, warned };
}

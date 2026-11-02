// Error spikes. record_work_error_event reports `spiking` at most once every 6 hours per group: at
// least 10 events in the current hour and 5x the previous day's hourly average. Then:
// - a group with a work item gets an error event "Spiking: N events in the last hour" on it, and the
//   item's subscribers get an error_spike notification;
// - a group without one gets a new item (source error, priority 2), triaged in the background;
// - the workspace's owners and admins get one error_spike notification as well.
// Called from errorIngest.ts. Never throws: a failed alert must not fail the ingest.

import { addWorkItemEvent, loadWorkItemById, type DataClient } from "./items";
import { notify, subscriberIds } from "./notifications";
import type { RecordErrorEventResult } from "./types";

export const SPIKE_ITEM_PRIORITY = 2;
const MAX_ADMINS = 50;

export type SpikeArgs = {
	client: DataClient;
	result: RecordErrorEventResult;
	/** "TypeError: x is undefined", for the notification text. */
	errorLabel: string;
	/** Creates the group's item (source error, priority 2) and starts triage; returns its id. */
	createItem: () => Promise<string | null>;
};

export function spikeEventBody(hourCount: number): string {
	return `Spiking: ${hourCount} ${hourCount === 1 ? "event" : "events"} in the last hour`;
}

/** The workspace owner plus members with the owner or admin role (at most 50). */
export async function workspaceAdminIds(client: DataClient, workspaceId: string): Promise<string[]> {
	const [workspace, members] = await Promise.all([
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
		client.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).in("role", ["owner", "admin"]).limit(MAX_ADMINS),
	]);
	const ids = new Set<string>();
	const owner = (workspace.data as { owner_user_id?: string | null } | null)?.owner_user_id;
	if (owner) ids.add(owner);
	for (const row of (members.data ?? []) as Array<{ user_id: string }>) if (row.user_id) ids.add(row.user_id);
	return [...ids];
}

export async function handleErrorSpike(args: SpikeArgs): Promise<{ itemId: string | null; notified: number }> {
	const { client, result } = args;
	const workspaceId = result.workspace_id;
	const hourCount = Math.max(0, Math.round(Number(result.hour_count ?? 0) || 0));
	const body = spikeEventBody(hourCount);
	let itemId: string | null = null;
	let itemNumber: number | null = null;
	const alreadyNotified = new Set<string>();

	try {
		const item = result.work_item_id ? await loadWorkItemById(client, workspaceId, result.work_item_id) : null;
		if (item) {
			itemId = item.id;
			itemNumber = item.number;
			await addWorkItemEvent(client, {
				workspaceId,
				workItemId: item.id,
				kind: "error",
				authorKind: "system",
				body,
				data: { groupId: result.group_id, hourCount, eventCount: result.event_count, spiking: true },
			});
			const subscribers = await subscriberIds(client, item.id);
			if (subscribers.length) {
				await notify(client, { workspaceId, userIds: subscribers, workItemId: item.id, kind: "error_spike", actorName: "Error tracking", body: `${body} on #${item.number}: ${args.errorLabel}`.slice(0, 2_000) });
				for (const id of subscribers) alreadyNotified.add(id);
			}
		} else {
			itemId = await args.createItem();
		}
	} catch (error) {
		console.error("[work] error spike item failed", { groupId: result.group_id, message: error instanceof Error ? error.message : String(error) });
	}

	let notified = alreadyNotified.size;
	try {
		const admins = (await workspaceAdminIds(client, workspaceId)).filter((id) => !alreadyNotified.has(id));
		if (admins.length) {
			const where = itemNumber ? ` on #${itemNumber}` : "";
			await notify(client, { workspaceId, userIds: admins, workItemId: itemId, kind: "error_spike", actorName: "Error tracking", body: `${body}${where}: ${args.errorLabel}`.slice(0, 2_000) });
			notified += admins.length;
		}
	} catch (error) {
		console.error("[work] error spike notification failed", { groupId: result.group_id, message: error instanceof Error ? error.message : String(error) });
	}
	return { itemId, notified };
}

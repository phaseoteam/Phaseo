import type { getDataClient } from "@/data/supabase";
import type { WorkNotification, WorkNotificationKind, WorkNotificationRow, WorkSubscriptionReason } from "./types";

// Work notifications and subscriptions. People subscribed to an item (its creator, assignee,
// commenters, people mentioned, or anyone who subscribes by hand) get its notifications. A
// notification is never sent to the person who caused it.

type DataClient = ReturnType<typeof getDataClient>;

export const MAX_NOTIFICATION_BODY = 2000;
const MAX_RECIPIENTS = 200;

export type NotifyArgs = {
	workspaceId: string;
	userIds: Array<string | null | undefined>;
	workItemId: string | null;
	kind: WorkNotificationKind;
	actorName?: string | null;
	body?: string | null;
	/** The person who caused the notification; never notified. */
	exceptUserId?: string | null;
};

/**
 * Inserts one notification per user (deduplicated, never the actor). Returns how many were
 * written. Never throws: a notification failing must not fail the change that caused it.
 */
export async function notify(client: DataClient, args: NotifyArgs): Promise<number> {
	const except = args.exceptUserId?.toLowerCase() ?? null;
	const recipients = [...new Set(args.userIds
		.filter((id): id is string => typeof id === "string" && id.length > 0)
		.map((id) => id.toLowerCase()))]
		.filter((id) => id !== except)
		.slice(0, MAX_RECIPIENTS);
	if (!recipients.length) return 0;
	const body = (args.body ?? "").slice(0, MAX_NOTIFICATION_BODY);
	const actorName = args.actorName?.slice(0, 200) ?? null;
	try {
		const { error } = await client.from("work_notifications").insert(recipients.map((userId) => ({
			workspace_id: args.workspaceId,
			user_id: userId,
			work_item_id: args.workItemId,
			kind: args.kind,
			actor_name: actorName,
			body,
		})));
		if (error) {
			console.error("[work] notifications not written", { kind: args.kind, message: error.message });
			return 0;
		}
		return recipients.length;
	} catch (error) {
		console.error("[work] notifications not written", { kind: args.kind, message: error instanceof Error ? error.message : String(error) });
		return 0;
	}
}

export type SubscribeArgs = { workspaceId: string; workItemId: string; userId: string; reason: WorkSubscriptionReason };

/** Subscribes a person to an item. Idempotent: an existing subscription keeps its first reason. Never throws. */
export async function subscribe(client: DataClient, args: SubscribeArgs): Promise<void> {
	if (!args.userId) return;
	try {
		const { error } = await client.from("work_subscriptions").upsert({
			work_item_id: args.workItemId,
			user_id: args.userId.toLowerCase(),
			workspace_id: args.workspaceId,
			reason: args.reason,
		}, { onConflict: "work_item_id,user_id", ignoreDuplicates: true });
		if (error) console.error("[work] subscription not written", { message: error.message });
	} catch (error) {
		console.error("[work] subscription not written", { message: error instanceof Error ? error.message : String(error) });
	}
}

/** Removes a person's subscription to an item. Throws when the delete fails. */
export async function unsubscribe(client: DataClient, args: { workspaceId: string; workItemId: string; userId: string }): Promise<void> {
	const { error } = await client.from("work_subscriptions").delete()
		.eq("workspace_id", args.workspaceId).eq("work_item_id", args.workItemId).eq("user_id", args.userId.toLowerCase());
	if (error) throw new Error(`work_subscriptions delete failed: ${error.message}`);
}

/** The ids of the people subscribed to an item (empty when the read fails). */
export async function subscriberIds(client: DataClient, workItemId: string): Promise<string[]> {
	try {
		const { data, error } = await client.from("work_subscriptions").select("user_id").eq("work_item_id", workItemId).limit(MAX_RECIPIENTS);
		if (error) return [];
		return [...new Set(((data ?? []) as Array<{ user_id: unknown }>).map((row) => String(row.user_id ?? "")).filter(Boolean))];
	} catch {
		return [];
	}
}

/** Whether a person is subscribed to an item. */
export async function isSubscribed(client: DataClient, workItemId: string, userId: string): Promise<boolean> {
	try {
		const { data } = await client.from("work_subscriptions").select("user_id").eq("work_item_id", workItemId).eq("user_id", userId.toLowerCase()).maybeSingle();
		return Boolean(data);
	} catch {
		return false;
	}
}

/** Notifies an item's subscribers (never the actor). */
export async function notifySubscribers(client: DataClient, args: Omit<NotifyArgs, "userIds"> & { workItemId: string; alsoUserIds?: Array<string | null | undefined> }): Promise<number> {
	const ids = await subscriberIds(client, args.workItemId);
	return notify(client, { ...args, userIds: [...ids, ...(args.alsoUserIds ?? [])] });
}

// ---------------------------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------------------------

export type MentionableMember = { userId: string; name: string | null; email: string | null };

const MENTION_PATTERN = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9][A-Za-z0-9._-]{0,63})/g;

function handleKeys(member: MentionableMember): string[] {
	const keys = new Set<string>();
	const local = member.email?.split("@")[0]?.trim().toLowerCase();
	if (local) keys.add(local);
	const name = member.name?.trim().toLowerCase();
	if (name) {
		keys.add(name.replace(/\s+/g, ""));
		keys.add(name.replace(/\s+/g, "."));
		keys.add(name.replace(/\s+/g, "-"));
		keys.add(name.replace(/\s+/g, "_"));
	}
	return [...keys];
}

/**
 * The members mentioned in a comment: `@handle` where the handle is a member's email local part
 * or display name (spaces removed or written as ".", "-" or "_"), or a display name's first word
 * when only one member has it. Case-insensitive; trailing punctuation is ignored.
 */
export function resolveMentions(text: string, members: MentionableMember[]): string[] {
	const handles = new Set<string>();
	for (const match of text.matchAll(MENTION_PATTERN)) {
		const handle = match[2]!.toLowerCase().replace(/[._-]+$/, "");
		if (handle) handles.add(handle);
	}
	if (!handles.size) return [];
	const byKey = new Map<string, Set<string>>();
	const add = (key: string, userId: string) => {
		const set = byKey.get(key) ?? new Set<string>();
		set.add(userId);
		byKey.set(key, set);
	};
	for (const member of members) {
		for (const key of handleKeys(member)) add(key, member.userId);
	}
	const firstWords = new Map<string, Set<string>>();
	for (const member of members) {
		const first = member.name?.trim().toLowerCase().split(/\s+/)[0];
		if (!first) continue;
		const set = firstWords.get(first) ?? new Set<string>();
		set.add(member.userId);
		firstWords.set(first, set);
	}
	const mentioned = new Set<string>();
	for (const handle of handles) {
		const exact = byKey.get(handle);
		if (exact?.size === 1) {
			mentioned.add([...exact][0]!);
			continue;
		}
		const first = firstWords.get(handle);
		if (!exact && first?.size === 1) mentioned.add([...first][0]!);
	}
	return [...mentioned];
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

export function formatWorkNotification(row: WorkNotificationRow & { item?: { number?: number | null; title?: string | null } | null }): WorkNotification {
	return {
		id: row.id,
		kind: row.kind,
		workItemId: row.work_item_id,
		workItemNumber: row.item?.number ?? null,
		workItemTitle: row.item?.title ?? null,
		actorName: row.actor_name,
		body: row.body ?? "",
		readAt: row.read_at,
		createdAt: row.created_at,
	};
}

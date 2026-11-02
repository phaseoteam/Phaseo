import { escapeHtml, sendWorkEmail, workEmailEnabled, type WorkEmailEnv } from "./email";
import { WORK_WEB_ORIGIN, workItemUrl } from "./github";
import type { DataClient } from "./items";
import type { WorkNotificationKind } from "./types";

// Notification digests: once every few minutes, each member with unread work notifications that
// haven't been emailed gets one email listing them. A notification read in the app within
// DIGEST_DELAY_MINUTES is never emailed. Members who set email_notifications to "off" get none
// (their notifications are still marked emailed, so they are not looked at again). Notifications
// older than DIGEST_MAX_AGE_HOURS are left alone, so a long outage doesn't send a flood.

export const DIGEST_EVERY_MINUTES = 10;
export const DIGEST_DELAY_MINUTES = 10;
export const DIGEST_MAX_AGE_HOURS = 48;
const MAX_ROWS = 500;
const MAX_RECIPIENTS_PER_RUN = 50;
const MAX_LINES = 20;

type DigestRow = {
	id: string;
	workspace_id: string;
	user_id: string;
	kind: WorkNotificationKind;
	actor_name: string | null;
	body: string | null;
	created_at: string;
	item: { number: number | null; title: string | null } | null;
};

export type DigestSummary = { recipients: number; emailed: number; skipped: number; failed: number };

const VERB: Record<WorkNotificationKind, string> = {
	assigned: "assigned you",
	comment: "commented",
	mention: "mentioned you",
	state: "changed the state",
	sla: "is near or past its deadline",
	stalled: "has stalled",
	error_spike: "error spike",
	agent: "agent update",
	reply_draft: "a customer reply is ready to review",
};

/** One line of the digest: who did what on which item, and the start of the note. */
export function digestLine(row: Pick<DigestRow, "kind" | "actor_name" | "body" | "item">): string {
	const item = row.item?.number ? `#${row.item.number} ${(row.item.title ?? "").slice(0, 120)}`.trim() : "Work";
	const who = row.actor_name ? `${row.actor_name.slice(0, 80)} ` : "";
	const note = (row.body ?? "").replace(/\s+/g, " ").trim();
	return `${item}: ${who}${VERB[row.kind] ?? row.kind}${note ? ` — ${note.length > 200 ? `${note.slice(0, 199)}…` : note}` : ""}`;
}

export function digestEmail(rows: DigestRow[], workspaceName: string | null, origin = WORK_WEB_ORIGIN): { subject: string; text: string; html: string } {
	const place = workspaceName ? ` in ${workspaceName}` : "";
	const subject = rows.length === 1 ? `${digestLine(rows[0]!).slice(0, 150)}` : `${rows.length} work updates${place}`;
	const shown = rows.slice(0, MAX_LINES);
	const link = (row: DigestRow) => (row.item?.number ? workItemUrl(row.item.number, origin) : `${origin}/work/inbox`);
	const more = rows.length > shown.length ? rows.length - shown.length : 0;
	const settings = `${origin}/work/settings`;
	const text = [
		`You have ${rows.length === 1 ? "a work update" : `${rows.length} work updates`}${place}:`,
		"",
		...shown.flatMap((row) => [`- ${digestLine(row)}`, `  ${link(row)}`]),
		...(more ? ["", `And ${more} more: ${origin}/work/inbox`] : []),
		"",
		`Turn these emails off in Work settings: ${settings}`,
	].join("\n");
	const html = [
		`<p style="margin:0 0 12px">You have ${rows.length === 1 ? "a work update" : `${rows.length} work updates`}${escapeHtml(place)}:</p>`,
		`<ul style="margin:0 0 12px;padding-left:20px">`,
		...shown.map((row) => `<li style="margin:0 0 6px"><a href="${escapeHtml(link(row))}">${escapeHtml(digestLine(row))}</a></li>`),
		`</ul>`,
		...(more ? [`<p style="margin:0 0 12px"><a href="${escapeHtml(`${origin}/work/inbox`)}">And ${more} more</a></p>`] : []),
		`<p style="margin:0;color:#6b7280;font-size:12px"><a href="${escapeHtml(settings)}">Turn these emails off</a> in Work settings.</p>`,
	].join("");
	return { subject, text, html };
}

async function markEmailed(client: DataClient, ids: string[], at: string): Promise<boolean> {
	if (!ids.length) return true;
	const { error } = await client.from("work_notifications").update({ emailed_at: at }).in("id", ids).is("emailed_at", null);
	if (error) console.error("[work] notifications not marked emailed", { count: ids.length, message: error.message });
	return !error;
}

export async function runNotificationDigest(args: { env: WorkEmailEnv; client: DataClient; now: Date; origin?: string; send?: typeof sendWorkEmail }): Promise<DigestSummary> {
	const send = args.send ?? sendWorkEmail;
	const summary: DigestSummary = { recipients: 0, emailed: 0, skipped: 0, failed: 0 };
	if (!workEmailEnabled(args.env)) return summary;
	const { client, now } = args;
	const dueBefore = new Date(now.getTime() - DIGEST_DELAY_MINUTES * 60_000).toISOString();
	const notBefore = new Date(now.getTime() - DIGEST_MAX_AGE_HOURS * 3_600_000).toISOString();
	const { data, error } = await client.from("work_notifications")
		.select("id,workspace_id,user_id,kind,actor_name,body,created_at,item:work_items(number,title)")
		.is("read_at", null).is("emailed_at", null).lte("created_at", dueBefore).gte("created_at", notBefore)
		.order("created_at", { ascending: true }).limit(MAX_ROWS);
	if (error) throw new Error(`work_notifications read failed: ${error.message}`);
	const rows = (data ?? []) as unknown as DigestRow[];
	if (!rows.length) return summary;

	const groups = new Map<string, DigestRow[]>();
	for (const row of rows) {
		const key = `${row.workspace_id}:${row.user_id}`;
		const list = groups.get(key) ?? [];
		list.push(row);
		groups.set(key, list);
	}
	const chosen = [...groups.entries()].slice(0, MAX_RECIPIENTS_PER_RUN);
	const workspaceIds = [...new Set(chosen.map(([, list]) => list[0]!.workspace_id))];
	const userIds = [...new Set(chosen.map(([, list]) => list[0]!.user_id))];
	const [settings, members, workspaces] = await Promise.all([
		client.from("work_member_settings").select("workspace_id,user_id,email_notifications").in("workspace_id", workspaceIds).in("user_id", userIds),
		client.from("workspace_members").select("workspace_id,user_id").in("workspace_id", workspaceIds).in("user_id", userIds),
		client.from("workspaces").select("id,name").in("id", workspaceIds),
	]);
	if (settings.error || members.error) throw new Error(`work digest lookups failed: ${(settings.error ?? members.error)!.message}`);
	const off = new Set(((settings.data ?? []) as Array<{ workspace_id: string; user_id: string; email_notifications: string }>)
		.filter((row) => row.email_notifications === "off").map((row) => `${row.workspace_id}:${row.user_id}`));
	const member = new Set(((members.data ?? []) as Array<{ workspace_id: string; user_id: string }>).map((row) => `${row.workspace_id}:${row.user_id}`));
	const names = new Map(((workspaces.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name]));
	const at = now.toISOString();

	for (const [key, list] of chosen) {
		const ids = list.map((row) => row.id);
		if (off.has(key) || !member.has(key)) {
			summary.skipped += 1;
			await markEmailed(client, ids, at);
			continue;
		}
		summary.recipients += 1;
		const userId = list[0]!.user_id;
		const user = await client.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
		const to = user.data?.user?.email?.trim();
		if (!to) {
			summary.skipped += 1;
			await markEmailed(client, ids, at);
			continue;
		}
		const email = digestEmail(list, names.get(list[0]!.workspace_id) ?? null, args.origin);
		const sent = await send(args.env, { to, ...email, fromName: "Phaseo Work", idempotencyKey: `work-digest-${ids[0]}-${ids.length}` });
		if (sent.ok === false) {
			summary.failed += 1;
			console.error("[work] digest email failed", { code: sent.code, message: sent.message });
			continue;
		}
		summary.emailed += 1;
		await markEmailed(client, ids, at);
	}
	return summary;
}

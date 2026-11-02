// Webhooks for work item events. web-api's cron sends each enabled webhook the workspace's new
// timeline events after its cursor, up to 50 at a time in one POST, signed with the webhook's
// secret:
//
//   X-Phaseo-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
//
// A 2xx answer moves the cursor past what was sent; anything else (or a timeout) leaves it, so the
// same events are sent again next minute. After MAX_FAILURES failures in a row the webhook is
// turned off. Events carry the item's number, title, state and URL, comments carry their text,
// and nothing about customers or their contact details is ever sent.

import type { Env } from "@/env";
import { decryptGithubToken, WORK_WEB_ORIGIN, workItemUrl } from "./github";
import type { DataClient } from "./items";
import { WORK_EVENT_KINDS, type WorkEventKind } from "./types";

export const WEBHOOK_EVENTS_PER_DELIVERY = 50;
export const WEBHOOKS_PER_RUN = 50;
export const MAX_FAILURES = 20;
export const MAX_WEBHOOKS_PER_WORKSPACE = 10;
const TIMEOUT_MS = 10_000;

/** Event kinds a webhook may subscribe to (everything on the timeline). */
export const WEBHOOK_EVENT_KINDS = WORK_EVENT_KINDS;

/**
 * Whether a URL is fine to send to: https, a host name (never an IP literal, localhost or an
 * internal suffix), the default port and no credentials.
 */
export function isAllowedWebhookUrl(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 2000) return false;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
	const host = url.hostname.toLowerCase().replace(/\.$/, "");
	if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
	if (host === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return false;
	return true;
}

export function parseWebhookEvents(value: unknown): WorkEventKind[] | null {
	if (value === undefined) return null;
	if (!Array.isArray(value) || !value.length) return null;
	const kinds = [...new Set(value)];
	return kinds.every((kind) => (WEBHOOK_EVENT_KINDS as readonly unknown[]).includes(kind)) ? kinds as WorkEventKind[] : null;
}

export async function signWebhook(secret: string, timestamp: number, body: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
	return `t=${timestamp},v1=${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function newWebhookSecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return `whsec_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

type EventRow = {
	id: string;
	kind: WorkEventKind;
	author_kind: string;
	author_name: string | null;
	body: string | null;
	created_at: string;
	item: { number: number; title: string; state: string; priority: number } | null;
};

type WebhookRow = { id: string; workspace_id: string; url: string; secret_ciphertext: string; events: string[]; cursor_at: string; cursor_id: string | null; failure_count: number };

/** One event as a webhook receives it. Only comments carry their text. */
export function webhookEvent(row: EventRow, origin = WORK_WEB_ORIGIN) {
	return {
		id: row.id,
		kind: row.kind,
		createdAt: row.created_at,
		author: { kind: row.author_kind, name: row.author_name },
		item: row.item ? { number: row.item.number, title: row.item.title, state: row.item.state, priority: row.item.priority, url: workItemUrl(row.item.number, origin) } : null,
		...(row.kind === "comment" && row.body ? { body: row.body.slice(0, 20_000) } : {}),
	};
}

export type WebhookSummary = { webhooks: number; delivered: number; failed: number; events: number };

/** Sends each enabled webhook its new events. Never throws for one webhook's failure. */
export async function runWebhooks(args: { env: Env; client: DataClient; now: Date; fetcher?: typeof fetch }): Promise<WebhookSummary> {
	const { client, now } = args;
	const fetcher = args.fetcher ?? fetch;
	const origin = args.env.PHASEO_WEB_ORIGIN?.trim() || WORK_WEB_ORIGIN;
	const summary: WebhookSummary = { webhooks: 0, delivered: 0, failed: 0, events: 0 };
	const { data, error } = await client.from("work_webhooks").select("id,workspace_id,url,secret_ciphertext,events,cursor_at,cursor_id,failure_count")
		.eq("enabled", true).order("cursor_at", { ascending: true }).limit(WEBHOOKS_PER_RUN);
	if (error) throw new Error(`work_webhooks read failed: ${error.message}`);
	for (const hook of (data ?? []) as WebhookRow[]) {
		summary.webhooks += 1;
		let query = client.from("work_item_events").select("id,kind,author_kind,author_name,body,created_at,item:work_items(number,title,state,priority)")
			.eq("workspace_id", hook.workspace_id).in("kind", hook.events);
		query = hook.cursor_id
			? query.or(`created_at.gt."${hook.cursor_at}",and(created_at.eq."${hook.cursor_at}",id.gt.${hook.cursor_id})`)
			: query.gt("created_at", hook.cursor_at);
		const events = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(WEBHOOK_EVENTS_PER_DELIVERY);
		if (events.error) continue;
		const rows = (events.data ?? []) as unknown as EventRow[];
		if (!rows.length) continue;
		const secret = await decryptGithubToken(args.env, hook.secret_ciphertext).catch(() => null);
		if (!secret || !isAllowedWebhookUrl(hook.url)) {
			await client.from("work_webhooks").update({ enabled: false, last_status: null }).eq("id", hook.id);
			continue;
		}
		const body = JSON.stringify({ webhookId: hook.id, events: rows.map((row) => webhookEvent(row, origin)) });
		const timestamp = Math.floor(now.getTime() / 1000);
		let status: number | null = null;
		try {
			const response = await fetcher(hook.url, {
				method: "POST",
				redirect: "manual",
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { "content-type": "application/json", "user-agent": "Phaseo-Work-Webhooks/1", "x-phaseo-signature": await signWebhook(secret, timestamp, body) },
				body,
			});
			status = response.status;
			await response.body?.cancel().catch(() => undefined);
		} catch {
			status = null;
		}
		const ok = status !== null && status >= 200 && status < 300;
		const last = rows[rows.length - 1]!;
		const failures = ok ? 0 : hook.failure_count + 1;
		await client.from("work_webhooks").update({
			last_status: status,
			last_delivery_at: now.toISOString(),
			failure_count: failures,
			...(ok ? { cursor_at: last.created_at, cursor_id: last.id } : {}),
			...(failures >= MAX_FAILURES ? { enabled: false } : {}),
		}).eq("id", hook.id);
		if (ok) { summary.delivered += 1; summary.events += rows.length; } else summary.failed += 1;
	}
	return summary;
}

import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { addWorkItemEvent, createWorkItem, MAX_TITLE_LENGTH, type DataClient } from "@/work/items";
import { subscribe } from "@/work/notifications";
import { triageWorkItem } from "@/work/triage";

// POST /api/internal/work/slack/items: the Slack agent's file_work_item tool (apps/slack,
// work-tools.ts) files work into the installation's Phaseo workspace.
//
// Auth: there is no user session. The Slack Worker signs the raw body with the secret both Workers
// already share for Slack (SLACK_STATE_SECRET), domain-separated from its link tokens:
//   x-phaseo-timestamp: <unix seconds>
//   x-phaseo-signature: v1=<hex HMAC-SHA256(SLACK_STATE_SECRET, "work-slack.v1.<timestamp>.<raw body>")>
// within 5 minutes, checked with crypto.subtle.verify (constant time).
//
// Gate: the work tracker is an internal prototype, so filing is refused (403 work_not_enabled)
// unless the installation's workspace has a Phaseo internal admin (its owner or a member whose
// public.users.role is 'admin'), the same role every internal route checks. The Slack side checks
// the same before offering the tool; this is the check that counts.
//
// kind "item": a work item, source slack, with the Slack text as its description.
// kind "ask":  a customer request (source slack, private: the Slack text is its body) and an item
//              (source ask, a generic title and no description, like intake asks) linked to it, so
//              the triage agent gives it a neutral title and the text never reaches GitHub.
// Both get a link event to the Slack thread's permalink and are triaged in the background.

export const WORK_SLACK_SIGNATURE_CONTEXT = "work-slack.v1";
const MAX_SKEW_SECONDS = 300;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_DESCRIPTION = 20_000;
const MAX_CUSTOMER = 200;
const SLACK_ID = /^[A-Z0-9]{2,32}$/;
const SLACK_TS = /^\d{1,12}\.\d{1,8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
	if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
	const bytes = new Uint8Array(32);
	for (let index = 0; index < 32; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	return bytes;
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** The signature header value for a body (also used by tests; the Slack Worker has its own copy). */
export async function signWorkSlackRequest(secret: string, timestamp: number, rawBody: string): Promise<string> {
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(`${WORK_SLACK_SIGNATURE_CONTEXT}.${timestamp}.${rawBody}`)));
	return `v1=${[...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function verifyWorkSlackRequest(secret: string | undefined, timestampHeader: string | undefined, signatureHeader: string | undefined, rawBody: string, nowMs = Date.now()): Promise<boolean> {
	const key = secret?.trim();
	if (!key || !timestampHeader || !signatureHeader?.startsWith("v1=")) return false;
	if (!/^\d{1,12}$/.test(timestampHeader)) return false;
	const timestamp = Number(timestampHeader);
	if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > MAX_SKEW_SECONDS) return false;
	const signature = hexToBytes(signatureHeader.slice(3));
	if (!signature) return false;
	return crypto.subtle.verify("HMAC", await hmacKey(key, "verify"), signature, encoder.encode(`${WORK_SLACK_SIGNATURE_CONTEXT}.${timestamp}.${rawBody}`));
}

export type SlackFileInput = {
	installationId: string;
	slackUserId: string;
	channel: string;
	threadTs: string;
	permalink: string | null;
	title: string;
	description: string;
	kind: "item" | "ask";
	customer: string | null;
};

function slackPermalink(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 500) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && (url.hostname === "slack.com" || url.hostname.endsWith(".slack.com")) ? url.toString() : null;
	} catch {
		return null;
	}
}

export function parseSlackFileInput(value: unknown): { ok: true; input: SlackFileInput } | { ok: false; message: string } {
	if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "Expected a JSON object" };
	const body = value as Record<string, unknown>;
	const installationId = typeof body.installationId === "string" && UUID.test(body.installationId) ? body.installationId.toLowerCase() : null;
	if (!installationId) return { ok: false, message: "installationId is required" };
	const slackUserId = typeof body.slackUserId === "string" && SLACK_ID.test(body.slackUserId) ? body.slackUserId : null;
	const channel = typeof body.channel === "string" && SLACK_ID.test(body.channel) ? body.channel : null;
	const threadTs = typeof body.threadTs === "string" && SLACK_TS.test(body.threadTs) ? body.threadTs : null;
	if (!slackUserId || !channel || !threadTs) return { ok: false, message: "slackUserId, channel and threadTs are required" };
	const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
	if (!title || title.length > MAX_TITLE_LENGTH) return { ok: false, message: `title is required, at most ${MAX_TITLE_LENGTH} characters` };
	const description = typeof body.description === "string" ? body.description.trim() : "";
	if (description.length > MAX_DESCRIPTION) return { ok: false, message: `description must be at most ${MAX_DESCRIPTION} characters` };
	const kind = body.kind === "ask" ? "ask" : body.kind === "item" || body.kind === undefined ? "item" : null;
	if (!kind) return { ok: false, message: "kind must be item or ask" };
	if (kind === "ask" && !description) return { ok: false, message: "An ask needs the customer's request as its description" };
	const customerRaw = typeof body.customer === "string" ? body.customer.replace(/\s+/g, " ").trim() : "";
	if (customerRaw.length > MAX_CUSTOMER) return { ok: false, message: `customer must be at most ${MAX_CUSTOMER} characters` };
	return {
		ok: true,
		input: { installationId, slackUserId, channel, threadTs, permalink: slackPermalink(body.permalink), title, description, kind, customer: customerRaw || null },
	};
}

/** Whether the workspace has a Phaseo internal admin: its owner or any member with users.role 'admin'. */
export async function workspaceHasInternalAdmin(client: DataClient, workspaceId: string): Promise<boolean> {
	const [workspace, members] = await Promise.all([
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
		client.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).limit(500),
	]);
	if (workspace.error || members.error) return false;
	const ids = new Set<string>();
	const owner = (workspace.data as { owner_user_id?: string | null } | null)?.owner_user_id;
	if (owner) ids.add(owner);
	for (const row of (members.data ?? []) as Array<{ user_id: string }>) if (row.user_id) ids.add(row.user_id);
	if (!ids.size) return false;
	const admins = await client.from("users").select("user_id").in("user_id", [...ids]).eq("role", "admin").limit(1);
	return !admins.error && ((admins.data ?? []) as unknown[]).length > 0;
}

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** The Phaseo user the Slack person linked, when they are still a member of the workspace. */
async function linkedMember(client: DataClient, installationId: string, workspaceId: string, slackUserId: string): Promise<string | null> {
	const link = await client.from("slack_user_links").select("user_id").eq("installation_id", installationId).eq("slack_user_id", slackUserId).maybeSingle();
	const userId = (link.data as { user_id?: string } | null)?.user_id;
	if (link.error || !userId) return null;
	const [member, workspace] = await Promise.all([
		client.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	return member.data || (workspace.data as { owner_user_id?: string } | null)?.owner_user_id === userId ? userId : null;
}

export const internalWorkSlackRouter = new Hono<{ Bindings: Env }>();

internalWorkSlackRouter.post("/work/slack/items", async (c) => {
	for (const [key, value] of Object.entries(PRIVATE_NO_STORE_HEADERS)) c.header(key, value);
	const length = Number(c.req.header("content-length") ?? 0);
	if (length > MAX_BODY_BYTES) return c.json({ error: "payload_too_large" }, 413);
	const raw = await c.req.text();
	if (raw.length > MAX_BODY_BYTES) return c.json({ error: "payload_too_large" }, 413);
	if (!(await verifyWorkSlackRequest(c.env.SLACK_STATE_SECRET, c.req.header("x-phaseo-timestamp"), c.req.header("x-phaseo-signature"), raw))) {
		return c.json({ error: "unauthorized" }, 401);
	}
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(raw);
	} catch {
		return c.json({ error: "bad_request", message: "Expected JSON" }, 400);
	}
	const parsed = parseSlackFileInput(parsedJson);
	if (parsed.ok === false) return c.json({ error: "bad_request", message: parsed.message }, 400);
	const input = parsed.input;
	const client = getDataClient(c.env);

	const installation = await client.from("slack_installations").select("id,workspace_id,status").eq("id", input.installationId).maybeSingle();
	if (installation.error) return c.json({ error: "work_unavailable" }, 503);
	const install = installation.data as { id: string; workspace_id: string; status: string } | null;
	if (!install || install.status !== "active") return c.json({ error: "installation_not_active" }, 404);
	const workspaceId = install.workspace_id;
	if (!(await workspaceHasInternalAdmin(client, workspaceId))) return c.json({ error: "work_not_enabled", message: "Filing work from Slack isn't available for this workspace" }, 403);

	const createdBy = await linkedMember(client, install.id, workspaceId, input.slackUserId).catch(() => null);
	const slackData = { installationId: install.id, channel: input.channel, threadTs: input.threadTs, slackUserId: input.slackUserId, permalink: input.permalink };
	const waitUntil = (promise: Promise<unknown>) => {
		try {
			c.executionCtx.waitUntil(promise);
		} catch {
			promise.catch(() => undefined);
		}
	};

	try {
		let requestId: string | null = null;
		let customer: { id: string; name: string } | null = null;
		if (input.kind === "ask" && input.customer) {
			const match = await client.from("work_customers").select("id,name").eq("workspace_id", workspaceId).ilike("name", escapeLike(input.customer)).limit(1).maybeSingle();
			customer = (match.data as { id: string; name: string } | null) ?? null;
		}
		if (input.kind === "ask") {
			const request = await client.from("work_customer_requests").insert({
				workspace_id: workspaceId,
				customer_id: customer?.id ?? null,
				source: "slack",
				status: "new",
				subject: input.title,
				body: input.description,
				created_by: createdBy,
				metadata: { slack: slackData, ...(input.customer && !customer ? { customerName: input.customer } : {}) },
			}).select("id").single();
			if (request.error || !request.data) throw new Error(`work_customer_requests insert failed: ${request.error?.message ?? "no row"}`);
			requestId = (request.data as { id: string }).id;
		}

		const item = await createWorkItem(client, {
			workspaceId,
			title: input.kind === "ask" ? "Customer request via Slack" : input.title,
			description: input.kind === "ask" ? "" : input.description,
			state: "triage",
			source: input.kind === "ask" ? "ask" : "slack",
			createdBy,
			authorKind: createdBy ? "user" : "system",
		});
		if (requestId) {
			const { error } = await client.from("work_customer_requests").update({ work_item_id: item.id, status: "linked", updated_at: new Date().toISOString() }).eq("id", requestId);
			if (error) console.error("[work] slack ask link failed", { requestId, message: error.message });
			await addWorkItemEvent(client, {
				workspaceId,
				workItemId: item.id,
				kind: "customer_request",
				authorKind: "customer",
				body: `Customer request from ${customer?.name ?? "a customer"}`,
				data: { requestId, source: "slack", ...(customer ? { customerId: customer.id } : {}) },
			}).catch((error) => console.error("[work] slack ask event failed", { itemId: item.id, message: String(error) }));
		}
		if (input.permalink) {
			await addWorkItemEvent(client, {
				workspaceId,
				workItemId: item.id,
				kind: "link",
				authorKind: createdBy ? "user" : "system",
				authorUserId: createdBy,
				authorName: "Slack",
				body: "Filed from a Slack thread",
				data: { type: "slack_thread", url: input.permalink },
			}).catch((error) => console.error("[work] slack link event failed", { itemId: item.id, message: String(error) }));
		}
		if (createdBy) await subscribe(client, { workspaceId, workItemId: item.id, userId: createdBy, reason: "creator" });
		waitUntil(
			triageWorkItem({ env: c.env, client, workspaceId, itemId: item.id, requestedBy: null, waitUntil })
				.then((result) => {
					if (!result.ok) console.warn("[work] slack triage skipped", { itemId: item.id, code: result.code });
				})
				.catch((error) => console.error("[work] slack triage failed", { itemId: item.id, message: String(error) })),
		);
		const origin = (c.env.PHASEO_WEB_ORIGIN ?? "https://phaseo.app").replace(/\/+$/, "");
		return c.json({ ok: true, item: { number: item.number, url: `${origin}/work/${item.number}` }, requestId, customerMatched: Boolean(customer) });
	} catch (error) {
		console.error("[work] slack filing failed", { installationId: install.id, message: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "work_unavailable" }, 503);
	}
});

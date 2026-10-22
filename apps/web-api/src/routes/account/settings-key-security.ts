import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireUser } from "@/auth/requireUser";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { sanitizeAuditMetadata } from "@/lib/audit/workspaceAudit";
import { CHAT_MANAGED_KEY_NAME, SLACK_AGENT_MANAGED_KEY_NAME } from "@/lib/managed-keys";
import { requireAccountWorkspace } from "./context";
import { parseKeyStorageLocations } from "./key-storage-locations";
import { invalidateGatewayKey } from "./settings-keys";

/** Most keys one bulk action can change. */
export const MAX_BULK_KEYS = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Gateway invalidation calls run a few at a time; the gateway's 60-second key
// cache bounds how long any missed invalidation can last.
const INVALIDATION_CONCURRENCY = 8;

export const BULK_KEY_ACTIONS = ["pause", "revoke", "set_monthly_spend_limit", "set_expiry", "set_storage_locations"] as const;
export type BulkKeyAction = (typeof BULK_KEY_ACTIONS)[number];

function requestId(c: { req: { header(name: string): string | undefined } }) { return c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? null; }
function isManager(role: string) { return ["owner", "admin"].includes(role.toLowerCase()); }

type BulkUpdate =
	| { ok: true; update: Record<string, unknown>; statuses: string[]; invalidate: boolean; metadata: Record<string, unknown> }
	| { ok: false; error: string; message: string };

/** The single update one bulk action applies, and which keys it may touch. */
export function bulkKeyUpdate(action: unknown, body: Record<string, unknown>, now = new Date()): BulkUpdate {
	switch (action) {
		case "pause":
			return { ok: true, update: { status: "paused" }, statuses: ["active"], invalidate: true, metadata: {} };
		case "revoke":
			return { ok: true, update: { status: "revoked", revoked_at: now.toISOString(), revoked_reason: "workspace_security_review" }, statuses: ["active", "paused"], invalidate: true, metadata: {} };
		case "set_monthly_spend_limit": {
			const value = body.monthlyCostNanos;
			if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return { ok: false, error: "invalid_limit", message: "monthlyCostNanos must be a positive whole number of nanodollars." };
			return { ok: true, update: { monthly_limit_cost_nanos: value }, statuses: ["active", "paused"], invalidate: true, metadata: { monthlyCostNanos: value } };
		}
		case "set_expiry": {
			const date = new Date(String(body.expiresAt ?? ""));
			if (!body.expiresAt || !Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) return { ok: false, error: "invalid_expiry", message: "expiresAt must be a future date." };
			return { ok: true, update: { expires_at: date.toISOString() }, statuses: ["active", "paused"], invalidate: true, metadata: { expiresAt: date.toISOString() } };
		}
		case "set_storage_locations": {
			const parsed = parseKeyStorageLocations(body.storageLocations ?? []);
			if (parsed.ok === false) return { ok: false, error: "invalid_storage_locations", message: parsed.message };
			return { ok: true, update: { storage_locations: parsed.value }, statuses: ["active", "paused"], invalidate: false, metadata: { storageLocations: parsed.value } };
		}
		default:
			return { ok: false, error: "invalid_action", message: `action must be one of: ${BULK_KEY_ACTIONS.join(", ")}.` };
	}
}

async function invalidateAll(env: Env, keyIds: string[]) {
	const queue = [...keyIds];
	let failed = 0;
	await Promise.all(Array.from({ length: Math.min(INVALIDATION_CONCURRENCY, queue.length) }, async () => {
		for (let keyId = queue.shift(); keyId; keyId = queue.shift()) {
			if (!await invalidateGatewayKey(env, keyId)) failed += 1;
		}
	}));
	if (failed) console.error("[key-security] gateway invalidation failed for some keys", { failed, total: keyIds.length });
}

export const accountSettingsKeySecurityRouter = new Hono<{ Bindings: Env }>();

accountSettingsKeySecurityRouter.get("/key-security", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: c.req.query("workspaceId")?.trim() });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const canManage = isManager(context.role);
	// Members see the overview; key owners' emails are for owners and admins.
	const [summary, keys] = await Promise.all([
		context.client.rpc("workspace_key_security_summary", { p_workspace_id: context.workspaceId }),
		context.client.rpc("workspace_key_security", { p_workspace_id: context.workspaceId }).limit(2000),
	]);
	if (summary.error || keys.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		workspaceId: context.workspaceId,
		canManage,
		maxBulkKeys: MAX_BULK_KEYS,
		observedAt: Date.now(),
		summary: summary.data,
		keys: (keys.data ?? []).map((key: Record<string, unknown>) => canManage ? key : { ...key, owner_email: null }),
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsKeySecurityRouter.post("/key-security/bulk", bodyLimit({ maxSize: 64 * 1024,
	onError: (c) => c.json({ error: "request_body_too_large" }, 413, PRIVATE_NO_STORE_HEADERS),
}), async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(body.workspaceId ?? "").trim() });
	if (!context || !isManager(context.role)) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const keyIds = Array.isArray(body.keyIds) ? [...new Set(body.keyIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))] : [];
	if (keyIds.length === 0 || keyIds.length !== (body.keyIds as unknown[]).length) return c.json({ error: "invalid_keys", message: "keyIds must be a list of distinct key ids." }, 400, PRIVATE_NO_STORE_HEADERS);
	if (keyIds.length > MAX_BULK_KEYS) return c.json({ error: "too_many_keys", message: `Change at most ${MAX_BULK_KEYS} keys at once.` }, 400, PRIVATE_NO_STORE_HEADERS);
	const plan = bulkKeyUpdate(body.action, body);
	if (plan.ok === false) return c.json({ error: plan.error, message: plan.message }, 400, PRIVATE_NO_STORE_HEADERS);

	// One statement, limited to this workspace's live dashboard keys.
	const result = await context.client.from("keys").update(plan.update)
		.eq("workspace_id", context.workspaceId)
		.eq("key_kind", "standard")
		.in("id", keyIds)
		.in("status", plan.statuses)
		.not("name", "in", `("${CHAT_MANAGED_KEY_NAME}","${SLACK_AGENT_MANAGED_KEY_NAME}")`)
		.select("id,name,prefix");
	if (result.error) return c.json({ error: "key_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const changed = (result.data ?? []) as Array<{ id: string; name: string | null; prefix: string | null }>;

	if (changed.length) {
		const action = body.action === "pause" ? "api_key.paused" : body.action === "revoke" ? "api_key.revoked" : "api_key.updated";
		const audit = await context.client.from("workspace_audit_events").insert(changed.map((key) => ({
			workspace_id: context.workspaceId,
			actor_user_id: user.id,
			action,
			target_type: "api_key",
			target_id: key.id,
			target_name: key.name?.slice(0, 200) ?? null,
			metadata: sanitizeAuditMetadata({ source: "security_review", bulkAction: body.action, changedFields: Object.keys(plan.update), prefix: key.prefix, ...plan.metadata }),
			request_id: requestId(c)?.slice(0, 200) ?? null,
		})));
		if (audit.error) console.error("[key-security] failed to record bulk audit events", { workspaceId: context.workspaceId, count: changed.length });
		if (plan.invalidate) c.executionCtx.waitUntil(invalidateAll(c.env, changed.map((key) => key.id)));
	}
	return c.json({ changed: changed.map((key) => key.id), skipped: keyIds.length - changed.length }, 200, PRIVATE_NO_STORE_HEADERS);
});

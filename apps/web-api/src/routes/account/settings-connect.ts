import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { CONNECT_MONTHLY_PRICE_NANOS } from "@/billing/connectCharges";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";

// Phaseo Connect, the desktop app's phone relay: $1 a month from the workspace's
// credits, charged in arrears for the UTC days it was on. The desktop calls
// these with the signed-in person's session token, like its profile request.
// Any member can see the state; only owners and admins switch it, because it
// bills the workspace. Days and amounts are counted in SQL (get_connect_state).
//
// GET /api/account/settings/connect?workspaceId=<uuid>
// PUT /api/account/settings/connect?workspaceId=<uuid>  { "enabled": boolean }
// 200: { connect: ConnectState }; PUT also returns { changed }.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AppContext = Context<{ Bindings: Env }>;
type StateRow = {
	enabled: boolean;
	payment_due: boolean;
	enabled_at: string | null;
	disabled_at: string | null;
	period_start: string;
	days_on: number;
	days_in_month: number;
	charge_so_far_nanos: number | string;
	estimated_nanos: number | string;
	pending_nanos: number | string;
	pending_months: number;
};

/** $0.333333333 rounded down to the cent for display: $0.33. Never shows more than is charged. */
export function formatConnectUsd(nanos: number): string {
	return `$${(Math.floor(nanos / 10_000_000) / 100).toFixed(2)}`;
}

function connectState(row: StateRow, context: AccountWorkspaceContext) {
	const chargeSoFarNanos = Number(row.charge_so_far_nanos);
	const estimatedNanos = Number(row.estimated_nanos);
	const pendingNanos = Number(row.pending_nanos);
	return {
		workspaceId: context.workspaceId,
		workspaceName: context.workspaceName,
		canManage: isManager(context),
		enabled: row.enabled,
		// Connect is off until every unpaid month is taken from credits.
		paymentDue: row.payment_due,
		active: row.enabled && !row.payment_due,
		enabledAt: row.enabled_at,
		disabledAt: row.disabled_at,
		priceNanos: CONNECT_MONTHLY_PRICE_NANOS,
		price: formatConnectUsd(CONNECT_MONTHLY_PRICE_NANOS),
		month: {
			periodStart: String(row.period_start).slice(0, 10),
			daysOn: row.days_on,
			daysInMonth: row.days_in_month,
			chargeSoFarNanos,
			chargeSoFar: formatConnectUsd(chargeSoFarNanos),
			// If Connect stays as it is until the month ends.
			estimatedNanos,
			estimated: formatConnectUsd(estimatedNanos),
		},
		unpaid: { months: row.pending_months, amountNanos: pendingNanos, amount: formatConnectUsd(pendingNanos) },
	};
}

function isManager(context: AccountWorkspaceContext) {
	return context.isOwner || ["owner", "admin"].includes(context.role.toLowerCase());
}

async function workspaceContext(c: AppContext) {
	const workspaceId = (c.req.query("workspaceId") ?? "").trim().toLowerCase();
	if (!UUID.test(workspaceId)) return { error: c.json({ error: "invalid_workspace", message: "workspaceId must be a workspace id." }, 400, PRIVATE_NO_STORE_HEADERS) };
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return { error: c.json({ error: "forbidden", message: "Sign in as a member of that workspace." }, 403, PRIVATE_NO_STORE_HEADERS) };
	return { context };
}

async function readState(context: AccountWorkspaceContext) {
	const result = await context.client.rpc("get_connect_state", { p_workspace_id: context.workspaceId });
	const row = (Array.isArray(result.data) ? result.data[0] : result.data) as StateRow | undefined;
	if (result.error || !row) {
		console.error("[web-api/settings] connect state failed", result.error?.message ?? "no_result");
		return null;
	}
	return connectState(row, context);
}

const unavailable = (c: AppContext) =>
	c.json({ error: "connect_unavailable", message: "Phaseo Connect is unavailable right now. Try again shortly." }, 503, PRIVATE_NO_STORE_HEADERS);

export const accountSettingsConnectRouter = new Hono<{ Bindings: Env }>();

accountSettingsConnectRouter.get("/connect", async (c) => {
	const { context, error } = await workspaceContext(c);
	if (!context) return error;
	const connect = await readState(context);
	return connect ? c.json({ connect }, 200, PRIVATE_NO_STORE_HEADERS) : unavailable(c);
});

accountSettingsConnectRouter.put("/connect", bodyLimit({ maxSize: 1024 }), async (c) => {
	const { context, error } = await workspaceContext(c);
	if (!context) return error;
	if (!isManager(context)) {
		return c.json({ error: "forbidden", message: "Only workspace owners and admins can turn Phaseo Connect on or off." }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const body = await c.req.json().catch(() => null) as { enabled?: unknown } | null;
	if (typeof body?.enabled !== "boolean") {
		return c.json({ error: "invalid_body", message: 'Send { "enabled": true } or { "enabled": false }.' }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const result = await context.client.rpc("set_connect_enabled", {
		p_workspace_id: context.workspaceId,
		p_enabled: body.enabled,
		p_user_id: context.user.id,
	});
	if (result.error) {
		console.error("[web-api/settings] connect switch failed", result.error.message);
		return unavailable(c);
	}
	const changed = result.data === true;
	if (changed) {
		await recordWorkspaceAuditEvent(context.client as never, {
			workspaceId: context.workspaceId,
			actorUserId: context.user.id,
			action: body.enabled ? "connect.enabled" : "connect.disabled",
			targetType: "connect_subscription",
			targetId: context.workspaceId,
			targetName: "Phaseo Connect",
			requestId: c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? null,
		});
	}
	const connect = await readState(context);
	return connect ? c.json({ changed, connect }, 200, PRIVATE_NO_STORE_HEADERS) : unavailable(c);
});

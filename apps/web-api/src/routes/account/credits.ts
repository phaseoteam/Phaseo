import { Hono } from "hono";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

const EMPTY_TIER_SUMMARY = { lastMonthCents: 0, mtdCents: 0, teamTier: "basic" as const };

function nanosToCredits(value: unknown): number | null {
	const nanos = Number(value ?? 0);
	return Number.isFinite(nanos) ? nanos / 1_000_000_000 : null;
}

function cookieValue(request: Request, name: string): string | null {
	const cookieHeader = request.headers.get("cookie") ?? "";
	for (const segment of cookieHeader.split(";")) {
		const separator = segment.indexOf("=");
		if (separator < 0) continue;
		const key = segment.slice(0, separator).trim();
		if (key !== name) continue;
		const value = segment.slice(separator + 1).trim();
		try {
			return decodeURIComponent(value) || null;
		} catch {
			return value || null;
		}
	}
	return null;
}

async function requireWorkspace(c: { req: { raw: Request; query: (key: string) => string | undefined }; env: Env }) {
	const user = await requireUser(c.req.raw, c.env);
	const workspaceId = c.req.query("workspaceId")?.trim()
		?? cookieValue(c.req.raw, "activeWorkspaceId")?.trim();
	if (!user || !workspaceId) return null;
	const client = getDataClient(c.env);
	const { data, error } = await client
		.from("workspace_members")
		.select("workspace_id")
		.eq("workspace_id", workspaceId)
		.eq("user_id", user.id)
		.maybeSingle();
	if (error || !data) return null;
	return { client, user, workspaceId };
}

export const creditsRouter = new Hono<{ Bindings: Env }>();

creditsRouter.get("/redeem-initial", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ activeWorkspaceId: null, invoiceTeamIds: [], signedIn: false, teamOptions: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const result = await client.from("workspace_members").select("workspace_id,teams:workspaces(id,name,billing_mode)").eq("user_id", user.id);
	if (result.error) return c.json({ error: "redeem_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const teamOptions: Array<{ id: string; name: string }> = [];
	const invoiceTeamIds: string[] = [];
	for (const row of result.data ?? []) {
		const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
		const id = String(team?.id ?? row.workspace_id ?? "").trim();
		if (!id || teamOptions.some((entry) => entry.id === id)) continue;
		teamOptions.push({ id, name: String(team?.name ?? "Team").trim() || "Team" });
		if (String(team?.billing_mode ?? "wallet").toLowerCase() === "invoice") invoiceTeamIds.push(id);
	}
	const requested = String(c.req.query("workspaceId") ?? "").trim();
	if (requested && !teamOptions.some((entry) => entry.id === requested)) teamOptions.unshift({ id: requested, name: "Current Team" });
	return c.json({ activeWorkspaceId: requested || null, invoiceTeamIds, signedIn: true, teamOptions }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.get("/admin/grants", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("credit_grants").select("id,code,amount_nanos,max_redemptions,redemptions_count,expires_at,is_active,created_at,disabled_at,note").order("created_at", { ascending: false }).limit(250);
	if (result.error) return c.json({ error: "credit_grants_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ grants: result.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.post("/admin/grants", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "admin_check_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const code = String(body.code ?? "").trim().toUpperCase();
	const amountNanos = Number(body.amount_nanos);
	const maxRedemptions = Math.trunc(Number(body.max_redemptions));
	if (!/^[A-Z0-9_-]{2,}$/.test(code) || !Number.isFinite(amountNanos) || amountNanos <= 0 || !Number.isFinite(maxRedemptions) || maxRedemptions <= 0) return c.json({ error: "invalid_grant" }, 400, PRIVATE_NO_STORE_HEADERS);
	const payload = { code, code_normalized: code, amount_nanos: Math.round(amountNanos), max_redemptions: maxRedemptions, expires_at: body.expires_at ?? null, is_active: true, created_by: user.id, note: body.note ?? null };
	const inserted = await client.from("credit_grants").insert(payload);
	if (!inserted.error) return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
	if (String(inserted.error.code ?? "") !== "23505") return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const existing = await client.from("credit_grants").select("id,is_active").eq("code_normalized", code).maybeSingle();
	if (existing.error || !existing.data) return c.json({ error: "credit_grant_exists" }, 409, PRIVATE_NO_STORE_HEADERS);
	if (existing.data.is_active) return c.json({ error: "credit_grant_active" }, 409, PRIVATE_NO_STORE_HEADERS);
	const history = await client.from("credit_grant_redemptions").select("id", { count: "exact", head: true }).eq("grant_id", existing.data.id);
	if (history.error) return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if ((history.count ?? 0) > 0) return c.json({ error: "credit_grant_has_history" }, 409, PRIVATE_NO_STORE_HEADERS);
	const reactivated = await client.from("credit_grants").update({ ...payload, redemptions_count: 0, disabled_at: null }).eq("id", existing.data.id);
	if (reactivated.error) return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.put("/admin/grants/:grantId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error || String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const maxRedemptions = Math.max(1, Math.trunc(Number(body.max_redemptions) || 1));
	const redemptionsCount = Math.min(Math.max(0, Math.trunc(Number(body.redemptions_count) || 0)), maxRedemptions);
	const isActive = body.is_active === true;
	const result = await client.from("credit_grants").update({ max_redemptions: maxRedemptions, redemptions_count: redemptionsCount, expires_at: body.expires_at ?? null, note: body.note ?? null, is_active: isActive, disabled_at: isActive ? null : new Date().toISOString() }).eq("id", c.req.param("grantId"));
	if (result.error) return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.post("/admin/grants/:grantId/disable", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error || String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("credit_grants").update({ is_active: false, disabled_at: new Date().toISOString() }).eq("id", c.req.param("grantId"));
	if (result.error) return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.delete("/admin/grants/:grantId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error || String(role.data?.role ?? "").toLowerCase() !== "admin") return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const grantId = c.req.param("grantId");
	const history = await client.from("credit_grant_redemptions").select("id", { count: "exact", head: true }).eq("grant_id", grantId);
	if (history.error) return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if ((history.count ?? 0) > 0) return c.json({ error: "credit_grant_has_history" }, 409, PRIVATE_NO_STORE_HEADERS);
	const result = await client.from("credit_grants").delete().eq("id", grantId);
	if (result.error) return c.json({ error: "credit_grant_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.get("/balance", async (c) => {
	const context = await requireWorkspace(c);
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	try {
		const { data: wallet, error: walletError } = await context.client
			.from("wallets")
			.select("balance_nanos")
			.eq("workspace_id", context.workspaceId)
			.maybeSingle();
		if (!walletError && wallet) {
			return c.json({ initialBalance: nanosToCredits(wallet.balance_nanos) }, 200, PRIVATE_NO_STORE_HEADERS);
		}
		const { data: ledger } = await context.client
			.from("credit_ledger")
			.select("after_balance_nanos,event_time")
			.eq("workspace_id", context.workspaceId)
			.order("event_time", { ascending: false })
			.limit(1)
			.maybeSingle();
		return c.json({ initialBalance: nanosToCredits(ledger?.after_balance_nanos) }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account] credits balance failed", { workspaceId: context.workspaceId, error });
		return c.json({ initialBalance: null }, 200, PRIVATE_NO_STORE_HEADERS);
	}
});

creditsRouter.get("/tier-summary", async (c) => {
	const context = await requireWorkspace(c);
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	try {
		const [prevResult, mtdResult, workspaceResult] = await Promise.all([
			context.client.rpc("monthly_spend_prev_cents", { p_team: context.workspaceId }),
			context.client.rpc("mtd_spend_cents", { p_team: context.workspaceId }),
			context.client.from("workspaces").select("tier").eq("id", context.workspaceId).maybeSingle(),
		]);
		return c.json({
			lastMonthCents: Number(prevResult.data ?? 0),
			mtdCents: Number(mtdResult.data ?? 0),
			teamTier: String(workspaceResult.data?.tier ?? "").toLowerCase() === "enterprise" ? "enterprise" : "basic",
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/account] credits tier summary failed", { workspaceId: context.workspaceId, error });
		return c.json(EMPTY_TIER_SUMMARY, 200, PRIVATE_NO_STORE_HEADERS);
	}
});

creditsRouter.put("/auto-top-up", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	const context = await requireWorkspace({ req: { raw: c.req.raw, query: (key) => key === "workspaceId" ? workspaceId : undefined }, env: c.env });
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const membership = await context.client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", context.user.id).maybeSingle();
	if (membership.error || !["owner", "admin"].includes(String(membership.data?.role ?? "").toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const enabled = body.enabled !== false;
	const topUpAmount = Number(body.topUpAmount ?? 0);
	if (enabled && (!Number.isFinite(topUpAmount) || topUpAmount < 1_000_000_000)) return c.json({ error: "minimum_top_up" }, 400, PRIVATE_NO_STORE_HEADERS);
	const payload = enabled ? { auto_top_up_enabled: true, low_balance_threshold: Number(body.balanceThreshold ?? 0), auto_top_up_amount: topUpAmount, auto_top_up_account_id: body.paymentMethodId ?? null, updated_at: new Date().toISOString() } : { auto_top_up_enabled: false, low_balance_threshold: 0, auto_top_up_amount: 0, auto_top_up_account_id: null, updated_at: new Date().toISOString() };
	const result = await context.client.from("wallets").update(payload).eq("workspace_id", workspaceId).select();
	if (result.error) return c.json({ error: "credits_update_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ data: result.data ?? [] }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.put("/low-balance-alert", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	const context = await requireWorkspace({ req: { raw: c.req.raw, query: (key) => key === "workspaceId" ? workspaceId : undefined }, env: c.env });
	if (!context) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const membership = await context.client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", context.user.id).maybeSingle();
	if (membership.error || !["owner", "admin"].includes(String(membership.data?.role ?? "").toLowerCase())) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const enabled = body.enabled === true;
	const thresholdUsd = Number(body.thresholdUsd ?? 0);
	if (enabled && (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0)) return c.json({ error: "invalid_threshold" }, 400, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_settings").upsert({ workspace_id: workspaceId, low_balance_email_enabled: enabled, low_balance_email_threshold_nanos: enabled ? Math.round(thresholdUsd * 1_000_000_000) : 0, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
	if (result.error) return c.json({ error: "credits_update_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

creditsRouter.post("/redeem", async (c) => {
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const workspaceId = String(body.workspaceId ?? "").trim();
	const code = String(body.code ?? "").trim().toUpperCase();
	if (!/^[A-Z0-9_-]{2,}$/.test(code)) return c.json({ status: "invalid_code_format", message: "Credit code format is invalid." }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireWorkspace({ req: { raw: c.req.raw, query: (key) => key === "workspaceId" ? workspaceId : undefined }, env: c.env });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.rpc("redeem_credit_code", { p_code: code, p_workspace_id: workspaceId });
	if (result.error) return c.json({ status: "error", message: "We could not redeem that credit code right now." }, 503, PRIVATE_NO_STORE_HEADERS);
	const row = Array.isArray(result.data) ? result.data[0] : result.data;
	return c.json({ result: row ?? null }, 200, PRIVATE_NO_STORE_HEADERS);
});

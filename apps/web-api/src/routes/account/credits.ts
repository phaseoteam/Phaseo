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

async function requireWorkspace(c: { req: { raw: Request; query: (key: string) => string | undefined }; env: Env }) {
	const user = await requireUser(c.req.raw, c.env);
	const workspaceId = c.req.query("workspaceId")?.trim();
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

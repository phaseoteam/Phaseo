// Purpose: Tell, without waking the spend-limit Durable Object, that nothing it enforces can apply
//          to an API key: the key has no request or cost cap and is not soft-blocked, and its
//          workspace has no workspace budget, no department budget and no blocking spend guardrail.
// Why: In enforce mode every API-key request awaits the coordinator. For a key and workspace with
//      nothing to enforce it only ever answers "unlimited", yet a cold object (Worker start-up, new
//      connection to Supabase, seed) held requests for 150–390 ms in production on 2026-11-04.
// How: Four small indexed reads (the key's limit columns, any workspace budget, any department
//      budget, any enabled blocking spend guardrail) cached per workspace and key. A copy is never used once it is older than
//      SPEND_LEASE.reseedMs, the interval at which the coordinator itself rereads limits, so a limit
//      added later is enforced no later than it is today. Department budgets are checked per
//      workspace, not per department, so any department budget sends every key to the coordinator.
//      Spend guardrails are too: any enabled blocking spend guardrail sends every key.

import { getSupabaseAdmin } from "@/runtime/env";
import { tieredRead } from "@core/tiered-cache";
import { SPEND_LEASE } from "@core/spend-limits.shared";

export type SpendLimitFootprint = {
	/** Any daily, weekly or monthly request or cost cap on the key. */
	keyLimited: boolean;
	softBlocked: boolean;
	/** Any row in workspace_budgets for the workspace. */
	workspaceBudgets: boolean;
	/** Any row in workspace_department_budgets for the workspace. */
	departmentBudgets: boolean;
	/** Any enabled spend guardrail that blocks, in the workspace. */
	spendGuardrails: boolean;
};

const KEY_COLUMNS = [
	"soft_blocked",
	"daily_limit_requests",
	"weekly_limit_requests",
	"monthly_limit_requests",
	"daily_limit_cost_nanos",
	"weekly_limit_cost_nanos",
	"monthly_limit_cost_nanos",
] as const;
const LIMIT_COLUMNS = KEY_COLUMNS.slice(1);

/** True only when the footprint shows nothing the coordinator could enforce. */
export function footprintIsEmpty(footprint: SpendLimitFootprint | null | undefined): boolean {
	return Boolean(footprint) && !footprint!.keyLimited && !footprint!.softBlocked &&
		!footprint!.workspaceBudgets && !footprint!.departmentBudgets && !footprint!.spendGuardrails;
}

function isFootprint(value: unknown): value is SpendLimitFootprint {
	if (!value || typeof value !== "object") return false;
	const footprint = value as Record<string, unknown>;
	return ["keyLimited", "softBlocked", "workspaceBudgets", "departmentBudgets", "spendGuardrails"]
		.every((field) => typeof footprint[field] === "boolean");
}

/** Reads the footprint from Postgres. Null when the key is not a key of this workspace. Throws on errors. */
export async function loadSpendLimitFootprint(workspaceId: string, keyId: string): Promise<SpendLimitFootprint | null> {
	const supabase = getSupabaseAdmin();
	const [key, budgets, departments, guardrails] = await Promise.all([
		supabase.from("keys").select(KEY_COLUMNS.join(",")).eq("id", keyId).eq("workspace_id", workspaceId).maybeSingle(),
		supabase.from("workspace_budgets").select("id").eq("workspace_id", workspaceId).limit(1),
		supabase.from("workspace_department_budgets").select("id").eq("workspace_id", workspaceId).limit(1),
		supabase.from("workspace_guardrails").select("id").eq("workspace_id", workspaceId).eq("kind", "spend")
			.eq("enabled", true).eq("spend_action", "block").limit(1),
	]);
	if (key.error || budgets.error || departments.error || guardrails.error) throw new Error("spend_limit_footprint_failed");
	const row = key.data as unknown as Record<string, unknown> | null;
	if (!row) return null;
	return {
		// A value that is not a number (unexpected) counts as a limit, so the coordinator decides.
		keyLimited: LIMIT_COLUMNS.some((column) => {
			const value = row[column];
			if (value === null || value === undefined) return false;
			const limit = Number(value);
			return !Number.isFinite(limit) || limit > 0;
		}),
		softBlocked: row.soft_blocked === true,
		workspaceBudgets: (budgets.data ?? []).length > 0,
		departmentBudgets: (departments.data ?? []).length > 0,
		spendGuardrails: (guardrails.data ?? []).length > 0,
	};
}

export function spendLimitFootprintKey(workspaceId: string, keyId: string): string {
	return `gateway:spend-limit-footprint:v2:${workspaceId}:${keyId}`;
}

/**
 * The cached footprint of `keyId`, at most SPEND_LEASE.reseedMs old. Null when the key is unknown.
 * Throws when it cannot be read; callers then ask the coordinator.
 */
export function readSpendLimitFootprint(workspaceId: string, keyId: string): Promise<SpendLimitFootprint | null> {
	return tieredRead<SpendLimitFootprint>({
		key: spendLimitFootprintKey(workspaceId, keyId),
		loader: () => loadSpendLimitFootprint(workspaceId, keyId),
		l1FreshMs: 10_000,
		// Older copies are reloaded before use, never served stale.
		maxStaleMs: SPEND_LEASE.reseedMs,
		l2: { freshS: 10, storeS: Math.ceil(SPEND_LEASE.reseedMs / 1000) },
		l3: false,
		negativeFreshMs: 10_000,
		validate: isFootprint,
	});
}

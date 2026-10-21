// Spend blocks management API (beta): /v1/control/spend-blocks.
//
// Blocks started by spend rules with action "block" (grace-margin blocking). Owners and admins
// only: OAuth callers by workspace role; management keys by scope (spend_rules:read to list,
// spend_rules:write to lift). A manual lift is audit-logged, queues the spend_blocked "lifted"
// event, holds until the rule's period resets, and republishes the gateway's entry at once, so
// requests stop being refused within about a minute. The list and lift are SQL functions
// (public.list_workspace_spend_blocks, public.lift_workspace_spend_block).
import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import { publishSpendBlockEntry } from "@core/spend-blocks";
import { formatSpendBlock, formatSpendBlocks, isSpendRuleUuid, parseSpendBlockListQuery, spendBlockLiftError } from "@/core/spend-rules";
import { internalServerError, requireCapability, requireOAuthWorkspaceRole } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };

type Auth = { workspaceId: string; userId?: string | null; requestId?: string | null };

async function authorize(req: Request, access: "read" | "write") {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const scopeError = requireCapability(auth.value, access === "read" ? CAPABILITIES.SPEND_RULES_READ : CAPABILITIES.SPEND_RULES_WRITE);
	if (scopeError) return { response: scopeError } as const;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return { response: roleError } as const;
	return { auth: auth.value as Auth } as const;
}

/** The block id in /spend-blocks/{id}/lift. */
function blockIdFrom(req: Request): string | null {
	const match = new URL(req.url).pathname.match(/\/([^/]+)\/lift\/?$/);
	const id = match ? decodeURIComponent(match[1]).trim() : "";
	return isSpendRuleUuid(id) ? id.toLowerCase() : null;
}

async function handleList(req: Request) {
	const access = await authorize(req, "read");
	if ("response" in access) return access.response;
	const url = new URL(req.url);
	const query = parseSpendBlockListQuery(url.searchParams.get("include_lifted"), url.searchParams.get("limit"));
	if (query.ok === false) return json({ error: "bad_request", message: query.message }, 400, NO_STORE);
	try {
		const { data, error } = await getSupabaseAdmin().rpc("list_workspace_spend_blocks", {
			p_workspace_id: access.auth.workspaceId,
			p_include_lifted: query.value.includeLifted,
			p_limit: query.value.limit,
		});
		if (error) throw error;
		return json({ data: formatSpendBlocks(data) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_blocks.list", error);
	}
}

async function handleLift(req: Request) {
	const access = await authorize(req, "write");
	if ("response" in access) return access.response;
	const id = blockIdFrom(req);
	if (!id) return json({ error: "bad_request", message: "A spend block id (uuid) is required" }, 400, NO_STORE);
	const actor = access.auth.userId?.trim() || null;
	try {
		const { data, error } = await getSupabaseAdmin().rpc("lift_workspace_spend_block", {
			p_workspace_id: access.auth.workspaceId,
			p_block_id: id,
			p_actor_user_id: actor,
		});
		if (error) {
			const mapped = spendBlockLiftError(error);
			if (mapped) return json({ error: mapped.error, message: mapped.message }, mapped.status, NO_STORE);
			throw error;
		}
		const block = formatSpendBlock((data ?? {}) as Record<string, unknown>);
		await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
			workspaceId: access.auth.workspaceId,
			actorUserId: actor,
			action: "spend_block.lifted",
			targetType: "spend_block",
			targetId: block.id,
			targetName: block.rule_name ?? block.scope_label,
			metadata: { rule_id: block.rule_id, scope_type: block.scope_type, scope_id: block.scope_id, resets_at: block.resets_at },
			requestId: access.auth.requestId ?? null,
		});
		await publishSpendBlockEntry(access.auth.workspaceId);
		return json({ data: block }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_blocks.lift", error);
	}
}

export const spendBlocksRoutes = new Hono<Env>();
spendBlocksRoutes.get("/", withRuntime(handleList));
spendBlocksRoutes.post("/:id/lift", withRuntime(handleLift));

// Spend rules management API (beta): /v1/control/spend-rules.
//
// Members read; owners and admins write, test and delete (OAuth callers by workspace role;
// management keys by scope: spend_rules:read, spend_rules:write, spend_rules:delete).
// Validation is the shared module also used by the settings page (@/core/spend-rules, a
// generated copy of packages/shared/spend-rules); the table's trigger and constraints still
// decide, and their errors are mapped to 400/404/409. Every metric the table allows is
// accepted. Rules the evaluator does not handle (a metric with a period or base it does not
// support, see private.spend_rule_evaluable) are saved and returned with evaluated: false.
// Preview and history are SQL functions (public.preview_workspace_spend_rule,
// public.list_workspace_spend_rule_history) that reuse the evaluator's value query.
import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { parseIanaTimeZone } from "@/lib/time-zones";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { SpendRuleTestError, sendSpendRuleTest } from "@/pipeline/notifications/spend-rule-test";
import { getSupabaseAdmin } from "@/runtime/env";
import { publishSpendBlockEntry, spendRuleBlocksEnabled } from "@core/spend-blocks";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import {
	MAX_SPEND_RULES_PER_WORKSPACE,
	SPEND_RULE_COLUMNS,
	embeddedDestinationIds,
	formatSpendRule,
	formatSpendRuleHistory,
	formatSpendRulePreview,
	isSpendRuleUuid,
	parseSpendRuleHistoryPage,
	parseSpendRuleInput,
	spendRuleFieldsFromRow,
	spendRuleWriteError,
	type SpendRule,
	type SpendRuleRow,
} from "@/core/spend-rules";
import { internalServerError, isResponse, requireCapability, requireJsonBody, requireOAuthWorkspaceRole } from "./route-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const RULE_SELECT = `${SPEND_RULE_COLUMNS},workspace_spend_rule_destinations(destination_id)`;

type Access = "read" | "write" | "delete";
type Auth = { workspaceId: string; userId?: string | null; requestId?: string | null };

function badRequest(message: string) {
	return json({ error: "bad_request", message }, 400, NO_STORE);
}

function notFound() {
	return json({ error: "not_found", message: "Spend rule not found" }, 404, NO_STORE);
}

function actorUserId(auth: { userId?: string | null }): string | null {
	return auth.userId?.trim() || null;
}

/** The rule id in /spend-rules/{id}[/test|/preview|/history]. */
function ruleIdFrom(req: Request): string | null {
	const match = new URL(req.url).pathname.match(/\/([^/]+)(?:\/(?:test|preview|history))?\/?$/);
	const id = match ? decodeURIComponent(match[1]).trim() : "";
	return isSpendRuleUuid(id) ? id.toLowerCase() : null;
}

async function authorize(req: Request, access: Access) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response } as const;
	const capability = access === "read" ? CAPABILITIES.SPEND_RULES_READ : access === "write" ? CAPABILITIES.SPEND_RULES_WRITE : CAPABILITIES.SPEND_RULES_DELETE;
	const scopeError = requireCapability(auth.value, capability);
	if (scopeError) return { response: scopeError } as const;
	const roles = access === "read" ? ["owner", "admin", "member"] : ["owner", "admin"];
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, roles);
	if (roleError) return { response: roleError } as const;
	return { auth: auth.value as Auth } as const;
}

async function audit(auth: Auth, action: "created" | "updated" | "deleted" | "tested", rule: Pick<SpendRule, "id" | "name">, metadata: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: actorUserId(auth),
		action: `spend_rule.${action}`,
		targetType: "spend_rule",
		targetId: rule.id,
		targetName: rule.name,
		metadata,
		requestId: auth.requestId ?? null,
	});
}

function ruleMetadata(rule: SpendRule): Record<string, unknown> {
	return {
		metric: rule.metric,
		scope_type: rule.scope_type,
		scope_id: rule.scope_id,
		period: rule.period,
		action: rule.action,
		enabled: rule.enabled,
		threshold_percents: rule.threshold_percents,
		threshold_amount_nanos: rule.threshold_amount_nanos,
		destination_count: rule.destination_ids.length,
	};
}

async function loadRule(workspaceId: string, id: string): Promise<SpendRule | null> {
	const { data, error } = await getSupabaseAdmin().from("workspace_spend_rules").select(RULE_SELECT)
		.eq("workspace_id", workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
	if (error) throw error;
	return data ? formatSpendRule(data as unknown as SpendRuleRow, embeddedDestinationIds(data as never)) : null;
}

function writeErrorResponse(error: { code?: string; message?: string }) {
	const mapped = spendRuleWriteError(error);
	return mapped ? json({ error: mapped.error, message: mapped.message }, mapped.status, NO_STORE) : null;
}

async function saveRule(auth: Auth, ruleId: string | null, fields: unknown, destinationIds: string[] | null) {
	return getSupabaseAdmin().rpc("save_workspace_spend_rule", {
		p_workspace_id: auth.workspaceId,
		p_rule_id: ruleId,
		p_rule: fields,
		p_destination_ids: destinationIds,
		p_actor_user_id: actorUserId(auth),
	});
}

function savedRule(data: unknown): SpendRule {
	const result = (data ?? {}) as { rule?: SpendRuleRow; destination_ids?: string[] };
	return formatSpendRule(result.rule as SpendRuleRow, result.destination_ids ?? []);
}

async function handleList(req: Request) {
	const access = await authorize(req, "read");
	if ("response" in access) return access.response;
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_spend_rules").select(RULE_SELECT)
			.eq("workspace_id", access.auth.workspaceId).is("deleted_at", null)
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.limit(MAX_SPEND_RULES_PER_WORKSPACE);
		if (error) throw error;
		const rules = (data ?? []).map((row) => formatSpendRule(row as unknown as SpendRuleRow, embeddedDestinationIds(row as never)));
		return json({ data: rules, max_rules: MAX_SPEND_RULES_PER_WORKSPACE }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_rules.list", error);
	}
}

async function handleCreate(req: Request) {
	const access = await authorize(req, "write");
	if ("response" in access) return access.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const parsed = parseSpendRuleInput(body, { parseTimeZone: parseIanaTimeZone, blocksEnabled: spendRuleBlocksEnabled() });
	if (parsed.ok === false) return badRequest(parsed.message);
	try {
		const { data, error } = await saveRule(access.auth, null, parsed.value.fields, parsed.value.destinationIds);
		if (error) {
			const response = writeErrorResponse(error);
			if (response) return response;
			throw error;
		}
		const rule = savedRule(data);
		await audit(access.auth, "created", rule, ruleMetadata(rule));
		return json({ data: rule }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("spend_rules.create", error);
	}
}

async function handleGet(req: Request) {
	const access = await authorize(req, "read");
	if ("response" in access) return access.response;
	const id = ruleIdFrom(req);
	if (!id) return badRequest("A spend rule id (uuid) is required");
	try {
		const rule = await loadRule(access.auth.workspaceId, id);
		return rule ? json({ data: rule }, 200, NO_STORE) : notFound();
	} catch (error) {
		return internalServerError("spend_rules.get", error);
	}
}

async function handleUpdate(req: Request) {
	const access = await authorize(req, "write");
	if ("response" in access) return access.response;
	const id = ruleIdFrom(req);
	if (!id) return badRequest("A spend rule id (uuid) is required");
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	try {
		const { data: existing, error: loadError } = await getSupabaseAdmin().from("workspace_spend_rules").select(SPEND_RULE_COLUMNS)
			.eq("workspace_id", access.auth.workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
		if (loadError) throw loadError;
		if (!existing) return notFound();
		const parsed = parseSpendRuleInput(body, { existing: spendRuleFieldsFromRow(existing as unknown as SpendRuleRow), parseTimeZone: parseIanaTimeZone, blocksEnabled: spendRuleBlocksEnabled() });
		if (parsed.ok === false) return badRequest(parsed.message);
		const { data, error } = await saveRule(access.auth, id, parsed.value.fields, parsed.value.destinationIds);
		if (error) {
			const response = writeErrorResponse(error);
			if (response) return response;
			throw error;
		}
		const rule = savedRule(data);
		await audit(access.auth, "updated", rule, { ...ruleMetadata(rule), changed: Object.keys(body).sort() });
		// A disabled, rescoped or raised rule lifts its block in the same transaction.
		if (rule.action === "block" || "action" in body) await publishSpendBlockEntry(access.auth.workspaceId);
		return json({ data: rule }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_rules.update", error);
	}
}

async function handleDelete(req: Request) {
	const access = await authorize(req, "delete");
	if ("response" in access) return access.response;
	const id = ruleIdFrom(req);
	if (!id) return badRequest("A spend rule id (uuid) is required");
	try {
		const { data, error } = await getSupabaseAdmin().from("workspace_spend_rules")
			.update({ deleted_at: new Date().toISOString() })
			.eq("workspace_id", access.auth.workspaceId).eq("id", id).is("deleted_at", null)
			.select(SPEND_RULE_COLUMNS).maybeSingle();
		if (error) throw error;
		if (!data) return notFound();
		const rule = formatSpendRule(data as unknown as SpendRuleRow);
		await audit(access.auth, "deleted", rule, { metric: rule.metric, scope_type: rule.scope_type, scope_id: rule.scope_id });
		if (rule.action === "block") await publishSpendBlockEntry(access.auth.workspaceId);
		return json({ data: { id: rule.id, deleted: true } }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_rules.delete", error);
	}
}

async function handleTest(req: Request) {
	const access = await authorize(req, "write");
	if ("response" in access) return access.response;
	const id = ruleIdFrom(req);
	if (!id) return badRequest("A spend rule id (uuid) is required");
	try {
		const result = await sendSpendRuleTest({ workspaceId: access.auth.workspaceId, ruleId: id });
		await audit(access.auth, "tested", { id: result.rule_id, name: result.rule_name }, { source: result.source, delivered: result.delivered, failed: result.failed });
		return json({ data: result }, 200, NO_STORE);
	} catch (error) {
		if (error instanceof SpendRuleTestError) {
			const headers = error.retryAfterSeconds ? { ...NO_STORE, "Retry-After": String(error.retryAfterSeconds) } : NO_STORE;
			return json({ error: error.code, message: error.message }, error.status, headers);
		}
		return internalServerError("spend_rules.test", error);
	}
}

async function handlePreview(req: Request) {
	const access = await authorize(req, "read");
	if ("response" in access) return access.response;
	const id = ruleIdFrom(req);
	if (!id) return badRequest("A spend rule id (uuid) is required");
	try {
		const { data, error } = await getSupabaseAdmin().rpc("preview_workspace_spend_rule", { p_workspace_id: access.auth.workspaceId, p_rule_id: id });
		if (error) {
			if (error.message?.includes("spend_rule_not_found")) return notFound();
			throw error;
		}
		return json({ data: formatSpendRulePreview((data ?? {}) as Record<string, unknown>) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_rules.preview", error);
	}
}

async function handleHistory(req: Request) {
	const access = await authorize(req, "read");
	if ("response" in access) return access.response;
	const id = ruleIdFrom(req);
	if (!id) return badRequest("A spend rule id (uuid) is required");
	const url = new URL(req.url);
	const page = parseSpendRuleHistoryPage(url.searchParams.get("limit"), url.searchParams.get("offset"));
	if (page.ok === false) return badRequest(page.message);
	try {
		const { data, error } = await getSupabaseAdmin().rpc("list_workspace_spend_rule_history", {
			p_workspace_id: access.auth.workspaceId,
			p_rule_id: id,
			p_limit: page.value.limit,
			p_offset: page.value.offset,
		});
		if (error) {
			if (error.message?.includes("spend_rule_not_found")) return notFound();
			throw error;
		}
		return json({ data: formatSpendRuleHistory((data ?? {}) as Record<string, unknown>) }, 200, NO_STORE);
	} catch (error) {
		return internalServerError("spend_rules.history", error);
	}
}

export const spendRulesRoutes = new Hono<Env>();
spendRulesRoutes.get("/", withRuntime(handleList));
spendRulesRoutes.post("/", withRuntime(handleCreate));
spendRulesRoutes.get("/:id", withRuntime(handleGet));
spendRulesRoutes.patch("/:id", withRuntime(handleUpdate));
spendRulesRoutes.delete("/:id", withRuntime(handleDelete));
spendRulesRoutes.post("/:id/test", withRuntime(handleTest));
spendRulesRoutes.get("/:id/preview", withRuntime(handlePreview));
spendRulesRoutes.get("/:id/history", withRuntime(handleHistory));

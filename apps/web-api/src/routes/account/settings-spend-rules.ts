import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { parseIanaTimeZone } from "@/lib/notification-destinations";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import {
	MAX_SPEND_RULES_PER_WORKSPACE,
	SPEND_RULE_COLUMNS,
	SPEND_RULE_TEST_SENDS_PER_MINUTE,
	embeddedDestinationIds,
	formatSpendBlock,
	formatSpendBlocks,
	formatSpendRule,
	formatSpendRuleHistory,
	formatSpendRulePreview,
	isSpendRuleUuid,
	parseSpendBlockListQuery,
	parseSpendRuleHistoryPage,
	parseSpendRuleInput,
	spendBlockLiftError,
	spendRuleFieldsFromRow,
	spendRuleWriteError,
	type SpendRule,
	type SpendRuleRow,
	type SpendRuleTestResult,
} from "./spend-rules";

// Spend rules for Settings → Notifications (PR 7 of the spend rules stack builds the page).
// The same validation and formatting as the control API (/v1/control/spend-rules), from the
// shared module (a generated copy of packages/shared/spend-rules), and the same SQL functions:
// public.save_workspace_spend_rule (rule and destinations in one transaction),
// public.preview_workspace_spend_rule and public.list_workspace_spend_rule_history.
// Members read rules, previews and history; owners and admins create, change, delete and test.
// Test sends go through the gateway's internal endpoint, which applies the workspace's
// 5-a-minute allowance shared with the control API.
// Spend blocks (PR 8): members list them; owners and admins lift them
// (public.lift_workspace_spend_block). After a lift or a change to a block rule, the gateway's
// internal endpoint republishes the KV entry it enforces blocks from.

const RULE_SELECT = `${SPEND_RULE_COLUMNS},workspace_spend_rule_destinations(destination_id)`;
const TEST_TIMEOUT_MS = 30_000;

type Body = Record<string, unknown>;

function json(c: any, body: unknown, status = 200, headers: Record<string, string> = {}) {
	return c.json(body, status, { ...PRIVATE_NO_STORE_HEADERS, ...headers });
}

function badRequest(c: any, message: string) {
	return json(c, { error: "bad_request", message }, 400);
}

function notFound(c: any) {
	return json(c, { error: "not_found", message: "Spend rule not found" }, 404);
}

async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

function isManager(context: AccountWorkspaceContext): boolean {
	return context.isOwner || ["owner", "admin"].includes(context.role.toLowerCase());
}

/** The body also carries workspaceId, which the shared parser would reject as an unknown field. */
function ruleInput(body: Body): Body {
	const { workspaceId: _workspaceId, ...input } = body;
	return input;
}

function ruleId(c: any): string | null {
	const id = String(c.req.param("ruleId") ?? "").trim();
	return isSpendRuleUuid(id) ? id.toLowerCase() : null;
}

async function memberContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") });
	return context ? { context } as const : { response: json(c, { error: "forbidden" }, 403) } as const;
}

async function managerContext(c: any, workspaceId: unknown) {
	const access = await memberContext(c, workspaceId);
	if ("response" in access) return access;
	if (!isManager(access.context)) return { response: json(c, { error: "forbidden", message: "Only workspace owners and admins can manage spend rules" }, 403) } as const;
	return access;
}

async function audit(context: AccountWorkspaceContext, action: "created" | "updated" | "deleted" | "tested", rule: Pick<SpendRule, "id" | "name">, metadata: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: `spend_rule.${action}`,
		targetType: "spend_rule",
		targetId: rule.id,
		targetName: rule.name,
		metadata,
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

function writeError(c: any, error: { code?: string; message?: string }) {
	const mapped = spendRuleWriteError(error);
	return mapped ? json(c, { error: mapped.error, message: mapped.message }, mapped.status) : json(c, { error: "spend_rule_write_failed" }, 503);
}

function savedRule(data: unknown): SpendRule {
	const result = (data ?? {}) as { rule?: SpendRuleRow; destination_ids?: string[] };
	return formatSpendRule(result.rule as SpendRuleRow, result.destination_ids ?? []);
}

const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * Asks the gateway to republish the workspace's spend block entry after a lift or a change to a
 * block rule (the database has already lifted what the change ends), so requests stop being
 * refused within about a minute. Best effort: the sweep and the scheduled reconcile republish
 * anyway, so a failure is only logged.
 */
async function publishSpendBlocks(c: any, workspaceId: string): Promise<void> {
	try {
		const response = await fetch(`${String(c.env.GATEWAY_API_ORIGIN ?? "https://api.phaseo.app").replace(/\/$/, "")}/internal/spend-blocks/publish`, {
			method: "POST",
			headers: { authorization: `Bearer ${c.env.GATEWAY_INTERNAL_TEST_TOKEN ?? ""}`, "content-type": "application/json" },
			body: JSON.stringify({ workspaceId }),
			signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
		});
		if (!response.ok) console.warn("spend_block_publish_failed", { workspaceId, status: response.status });
	} catch (error) {
		console.warn("spend_block_publish_failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
	}
}

function blockId(c: any): string | null {
	const id = String(c.req.param("blockId") ?? "").trim();
	return isSpendRuleUuid(id) ? id.toLowerCase() : null;
}

export const accountSettingsSpendRulesRouter = new Hono<{ Bindings: Env }>();

/**
 * The workspace's spend blocks (active only, or with includeLifted=true the latest lifted ones
 * too). Members can read them, as they can read the table; only owners and admins lift.
 * Registered before /spend-rules/:ruleId so "blocks" is not read as a rule id.
 */
accountSettingsSpendRulesRouter.get("/spend-rules/blocks", async (c) => {
	const access = await memberContext(c, c.req.query("workspaceId")?.trim());
	if ("response" in access) return access.response;
	const query = parseSpendBlockListQuery(c.req.query("includeLifted"), c.req.query("limit"));
	if (query.ok === false) return badRequest(c, query.message);
	const result = await access.context.client.rpc("list_workspace_spend_blocks", {
		p_workspace_id: access.context.workspaceId,
		p_include_lifted: query.value.includeLifted,
		p_limit: query.value.limit,
	});
	if (result.error) return json(c, { error: "settings_unavailable" }, 503);
	return json(c, { workspaceId: access.context.workspaceId, canLift: isManager(access.context), blocks: formatSpendBlocks(result.data) });
});

accountSettingsSpendRulesRouter.post("/spend-rules/blocks/:blockId/lift", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const id = blockId(c);
	if (!id) return badRequest(c, "A spend block id is required");
	const { context } = access;
	const result = await context.client.rpc("lift_workspace_spend_block", {
		p_workspace_id: context.workspaceId,
		p_block_id: id,
		p_actor_user_id: context.user.id,
	});
	if (result.error) {
		const mapped = spendBlockLiftError(result.error);
		return mapped ? json(c, { error: mapped.error, message: mapped.message }, mapped.status) : json(c, { error: "spend_block_lift_failed" }, 503);
	}
	const block = formatSpendBlock((result.data ?? {}) as Record<string, unknown>);
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: "spend_block.lifted",
		targetType: "spend_block",
		targetId: block.id,
		targetName: block.rule_name ?? block.scope_label,
		metadata: { rule_id: block.rule_id, scope_type: block.scope_type, scope_id: block.scope_id, resets_at: block.resets_at },
	});
	await publishSpendBlocks(c, context.workspaceId);
	return json(c, { block });
});

accountSettingsSpendRulesRouter.get("/spend-rules", async (c) => {
	const access = await memberContext(c, c.req.query("workspaceId")?.trim());
	if ("response" in access) return access.response;
	const { context } = access;
	const [rules, settings] = await Promise.all([
		context.client.from("workspace_spend_rules").select(RULE_SELECT)
			.eq("workspace_id", context.workspaceId).is("deleted_at", null)
			.order("created_at", { ascending: true }).order("id", { ascending: true })
			.limit(MAX_SPEND_RULES_PER_WORKSPACE),
		context.client.from("workspace_settings").select("billing_time_zone").eq("workspace_id", context.workspaceId).maybeSingle(),
	]);
	if (rules.error || settings.error) return json(c, { error: "settings_unavailable" }, 503);
	return json(c, {
		workspaceId: context.workspaceId,
		canManageSpendRules: isManager(context),
		maxRules: MAX_SPEND_RULES_PER_WORKSPACE,
		testSendsPerMinute: SPEND_RULE_TEST_SENDS_PER_MINUTE,
		// Whether block rules block yet; until then they only notify (SPEND_RULE_BLOCKS_ENABLED).
		blocksEnabled: c.env.SPEND_RULE_BLOCKS_ENABLED === "true",
		billingTimeZone: parseIanaTimeZone((settings.data as { billing_time_zone?: unknown } | null)?.billing_time_zone) ?? "UTC",
		rules: (rules.data ?? []).map((row) => formatSpendRule(row as unknown as SpendRuleRow, embeddedDestinationIds(row as never))),
	});
});

const SCOPE_OPTION_LIMIT = 1000;
const usdOrNull = (nanos: unknown) => {
	const value = Number(nanos ?? 0);
	return Number.isFinite(value) && value > 0 ? value / 1_000_000_000 : null;
};

/**
 * What the rule editor offers: keys (with their cost limits, for a key_limit base), members,
 * departments, routable providers and the workspace budgets (for a workspace_budget base).
 * Registered before /spend-rules/:ruleId so "options" is not read as a rule id.
 */
accountSettingsSpendRulesRouter.get("/spend-rules/options", async (c) => {
	const access = await memberContext(c, c.req.query("workspaceId")?.trim());
	if ("response" in access) return access.response;
	const { context } = access;
	const [keys, members, departments, providers, budgets] = await Promise.all([
		context.client.from("keys").select("id,name,prefix,status,daily_limit_cost_nanos,weekly_limit_cost_nanos,monthly_limit_cost_nanos")
			.eq("workspace_id", context.workspaceId).neq("status", "deleted").neq("name", "__chat_route_managed_key__")
			.order("name", { ascending: true }).limit(SCOPE_OPTION_LIMIT),
		context.client.from("workspace_members").select("user_id,role,users(display_name)")
			.eq("workspace_id", context.workspaceId).limit(SCOPE_OPTION_LIMIT),
		context.client.from("workspace_departments").select("id,name")
			.eq("workspace_id", context.workspaceId).order("name", { ascending: true }).limit(SCOPE_OPTION_LIMIT),
		context.client.from("v2_providers").select("provider_slug,name")
			.eq("routable", true).eq("routing_enabled", true).in("status", ["active", "degraded"])
			.order("name", { ascending: true }).limit(SCOPE_OPTION_LIMIT),
		context.client.from("workspace_budgets").select("interval,limit_nanos").eq("workspace_id", context.workspaceId),
	]);
	if ([keys, members, departments, providers, budgets].some((result) => result.error)) return json(c, { error: "settings_unavailable" }, 503);
	return json(c, {
		workspaceId: context.workspaceId,
		keys: (keys.data ?? []).map((key: any) => ({
			id: String(key.id),
			name: String(key.name ?? ""),
			prefix: String(key.prefix ?? ""),
			status: String(key.status ?? ""),
			limitsUsd: { daily: usdOrNull(key.daily_limit_cost_nanos), weekly: usdOrNull(key.weekly_limit_cost_nanos), monthly: usdOrNull(key.monthly_limit_cost_nanos) },
		})),
		members: (members.data ?? []).map((member: any) => ({
			id: String(member.user_id),
			name: String((Array.isArray(member.users) ? member.users[0] : member.users)?.display_name ?? "").trim() || null,
			role: String(member.role ?? "member"),
		})),
		departments: (departments.data ?? []).map((department: any) => ({ id: String(department.id), name: String(department.name ?? "") })),
		providers: (providers.data ?? []).map((provider: any) => ({ id: String(provider.provider_slug), name: String(provider.name ?? provider.provider_slug) })),
		budgetsUsd: Object.fromEntries((budgets.data ?? []).map((budget: any) => [String(budget.interval), usdOrNull(budget.limit_nanos)])),
	});
});

accountSettingsSpendRulesRouter.post("/spend-rules", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const parsed = parseSpendRuleInput(ruleInput(body), { parseTimeZone: parseIanaTimeZone, blocksEnabled: c.env.SPEND_RULE_BLOCKS_ENABLED === "true" });
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { context } = access;
	const result = await context.client.rpc("save_workspace_spend_rule", {
		p_workspace_id: context.workspaceId,
		p_rule_id: null,
		p_rule: parsed.value.fields,
		p_destination_ids: parsed.value.destinationIds,
		p_actor_user_id: context.user.id,
	});
	if (result.error) return writeError(c, result.error);
	const rule = savedRule(result.data);
	await audit(context, "created", rule, ruleMetadata(rule));
	return json(c, { rule }, 201);
});

accountSettingsSpendRulesRouter.get("/spend-rules/:ruleId", async (c) => {
	const access = await memberContext(c, c.req.query("workspaceId")?.trim());
	if ("response" in access) return access.response;
	const id = ruleId(c);
	if (!id) return badRequest(c, "A spend rule id is required");
	const { context } = access;
	const result = await context.client.from("workspace_spend_rules").select(RULE_SELECT)
		.eq("workspace_id", context.workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
	if (result.error) return json(c, { error: "settings_unavailable" }, 503);
	if (!result.data) return notFound(c);
	return json(c, { rule: formatSpendRule(result.data as unknown as SpendRuleRow, embeddedDestinationIds(result.data as never)) });
});

accountSettingsSpendRulesRouter.patch("/spend-rules/:ruleId", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const id = ruleId(c);
	if (!id) return badRequest(c, "A spend rule id is required");
	const { context } = access;
	const existing = await context.client.from("workspace_spend_rules").select(SPEND_RULE_COLUMNS)
		.eq("workspace_id", context.workspaceId).eq("id", id).is("deleted_at", null).maybeSingle();
	if (existing.error) return json(c, { error: "settings_unavailable" }, 503);
	if (!existing.data) return notFound(c);
	const input = ruleInput(body);
	const parsed = parseSpendRuleInput(input, { existing: spendRuleFieldsFromRow(existing.data as unknown as SpendRuleRow), parseTimeZone: parseIanaTimeZone, blocksEnabled: c.env.SPEND_RULE_BLOCKS_ENABLED === "true" });
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const result = await context.client.rpc("save_workspace_spend_rule", {
		p_workspace_id: context.workspaceId,
		p_rule_id: id,
		p_rule: parsed.value.fields,
		p_destination_ids: parsed.value.destinationIds,
		p_actor_user_id: context.user.id,
	});
	if (result.error) return writeError(c, result.error);
	const rule = savedRule(result.data);
	await audit(context, "updated", rule, { ...ruleMetadata(rule), changed: Object.keys(input).sort() });
	// A disabled, rescoped or raised block rule lifts its block in the same transaction.
	if (rule.action === "block" || "action" in input) await publishSpendBlocks(c, context.workspaceId);
	return json(c, { rule });
});

accountSettingsSpendRulesRouter.delete("/spend-rules/:ruleId", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const id = ruleId(c);
	if (!id) return badRequest(c, "A spend rule id is required");
	const { context } = access;
	const result = await context.client.from("workspace_spend_rules").update({ deleted_at: new Date().toISOString() })
		.eq("workspace_id", context.workspaceId).eq("id", id).is("deleted_at", null)
		.select(SPEND_RULE_COLUMNS).maybeSingle();
	if (result.error) return json(c, { error: "spend_rule_write_failed" }, 503);
	if (!result.data) return notFound(c);
	const rule = formatSpendRule(result.data as unknown as SpendRuleRow);
	await audit(context, "deleted", rule, { metric: rule.metric, scope_type: rule.scope_type, scope_id: rule.scope_id });
	if (rule.action === "block") await publishSpendBlocks(c, context.workspaceId);
	return json(c, { id: rule.id, deleted: true });
});

accountSettingsSpendRulesRouter.post("/spend-rules/:ruleId/test", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const id = ruleId(c);
	if (!id) return badRequest(c, "A spend rule id is required");
	const { context } = access;
	try {
		const response = await fetch(`${String(c.env.GATEWAY_API_ORIGIN ?? "https://api.phaseo.app").replace(/\/$/, "")}/internal/notification-tests/spend-rule`, {
			method: "POST",
			headers: { authorization: `Bearer ${c.env.GATEWAY_INTERNAL_TEST_TOKEN ?? ""}`, "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: context.workspaceId, ruleId: id }),
			signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
		});
		const payload = await response.json().catch(() => ({})) as { result?: SpendRuleTestResult; error?: string; message?: string };
		if (!response.ok || !payload.result) {
			const status = [404, 409, 429].includes(response.status) ? response.status : 502;
			const retryAfter = response.headers.get("retry-after");
			return json(c, { error: payload.error ?? "spend_rule_test_failed", ...(payload.message ? { message: payload.message } : {}) }, status, retryAfter ? { "Retry-After": retryAfter } : {});
		}
		const result = payload.result;
		await audit(context, "tested", { id: result.rule_id, name: result.rule_name }, { source: result.source, delivered: result.delivered, failed: result.failed });
		return json(c, { result });
	} catch (error) {
		console.error("spend_rule_test_failed", { workspaceId: context.workspaceId, ruleId: id, error: error instanceof Error ? error.message : String(error) });
		return json(c, { error: "spend_rule_test_failed" }, 502);
	}
});

accountSettingsSpendRulesRouter.get("/spend-rules/:ruleId/preview", async (c) => {
	const access = await memberContext(c, c.req.query("workspaceId")?.trim());
	if ("response" in access) return access.response;
	const id = ruleId(c);
	if (!id) return badRequest(c, "A spend rule id is required");
	const result = await access.context.client.rpc("preview_workspace_spend_rule", { p_workspace_id: access.context.workspaceId, p_rule_id: id });
	if (result.error) return result.error.message?.includes("spend_rule_not_found") ? notFound(c) : json(c, { error: "settings_unavailable" }, 503);
	return json(c, { preview: formatSpendRulePreview((result.data ?? {}) as Record<string, unknown>) });
});

accountSettingsSpendRulesRouter.get("/spend-rules/:ruleId/history", async (c) => {
	const access = await memberContext(c, c.req.query("workspaceId")?.trim());
	if ("response" in access) return access.response;
	const id = ruleId(c);
	if (!id) return badRequest(c, "A spend rule id is required");
	const page = parseSpendRuleHistoryPage(c.req.query("limit"), c.req.query("offset"));
	if (page.ok === false) return badRequest(c, page.message);
	const result = await access.context.client.rpc("list_workspace_spend_rule_history", {
		p_workspace_id: access.context.workspaceId,
		p_rule_id: id,
		p_limit: page.value.limit,
		p_offset: page.value.offset,
	});
	if (result.error) return result.error.message?.includes("spend_rule_not_found") ? notFound(c) : json(c, { error: "settings_unavailable" }, 503);
	return json(c, { history: formatSpendRuleHistory((result.data ?? {}) as Record<string, unknown>) });
});

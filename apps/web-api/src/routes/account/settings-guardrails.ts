import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";
import { MAX_ASSIGNMENT_GUARDRAILS, MAX_ASSIGNMENT_TARGETS } from "./guardrailAssignmentLimits";

type GuardrailPayload = Record<string, any>;

export function guardrailRow(payload: GuardrailPayload, includeName = true): Record<string, unknown> {
	const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (includeName) {
		const name = String(payload.name ?? "").trim();
		if (!name) throw new Error("Name is required");
		row.name = name;
		row.description = payload.description ?? null;
		row.enabled = payload.enabled ?? true;
	}
	// A legacy `budgets` object (the removed guardrail request and spend limits) is ignored.
	const fields: Array<[string, string]> = [
		["privacyEnablePaidMayTrain", "privacy_enable_paid_may_train"],
		["privacyEnableFreeMayTrain", "privacy_enable_free_may_train"],
		["privacyEnableFreeMayPublishPrompts", "privacy_enable_free_may_publish_prompts"],
		["privacyEnableInputOutputLogging", "privacy_enable_input_output_logging"],
		["privacyZdrOnly", "privacy_zdr_only"],
		["providerRestrictionMode", "provider_restriction_mode"],
		["providerRestrictionProviderIds", "provider_restriction_provider_ids"],
		["providerRestrictionEnforceAllowed", "provider_restriction_enforce_allowed"],
		["modelRestrictionMode", "model_restriction_mode"],
		["modelRestrictionModelIds", "model_restriction_model_ids"],
		["allowedApiModelIds", "allowed_api_model_ids"],
		["promptInjectionEnabled", "prompt_injection_enabled"],
		["promptInjectionAction", "prompt_injection_action"],
		["sensitiveInfoEnabled", "sensitive_info_enabled"],
		["sensitiveInfoDefaultAction", "sensitive_info_default_action"],
		["sensitiveInfoRules", "sensitive_info_rules"],
	];
	for (const [input, column] of fields) if (payload[input] !== undefined) row[column] = payload[input];
	const ioLoggingUpdated =
		typeof payload.ioLoggingEnabled === "boolean" ||
		typeof payload.ioLoggingRetentionDays === "number" ||
		typeof payload.ioLoggingIncludeProviderPayloads === "boolean" ||
		payload.ioLoggingContentsAccess === "members" ||
		payload.ioLoggingContentsAccess === "admins";
	if (typeof payload.ioLoggingEnabled === "boolean") {
		row.io_logging_enabled = payload.ioLoggingEnabled;
	}
	if (typeof payload.ioLoggingRetentionDays === "number") {
		row.io_logging_retention_days = Math.max(
			90,
			Math.min(365, Math.trunc(payload.ioLoggingRetentionDays)),
		);
	}
	if (typeof payload.ioLoggingIncludeProviderPayloads === "boolean") {
		row.io_logging_include_provider_payloads =
			payload.ioLoggingIncludeProviderPayloads;
	}
	if (payload.ioLoggingContentsAccess === "members" || payload.ioLoggingContentsAccess === "admins") {
		row.io_logging_contents_access = payload.ioLoggingContentsAccess;
	}
	if (ioLoggingUpdated) row.io_logging_updated_at = row.updated_at;
	return row;
}

export const GUARDRAIL_KINDS = ["access", "safety", "spend", "rate"] as const;
export type GuardrailKind = (typeof GUARDRAIL_KINDS)[number];

/** Spend and rate guardrails have no settings yet (they come with later phases), so only these can be written. */
const WRITABLE_GUARDRAIL_KINDS: ReadonlySet<GuardrailKind> = new Set(["access", "safety"]);

/**
 * The kind of a guardrail payload that names none: safety when prompt injection or sensitive info is
 * on and no access setting is (the rule the migration backfilled existing guardrails with), else access.
 * Lets the current editor, which sends no kind, keep creating guardrails.
 */
export function inferGuardrailKind(payload: GuardrailPayload): "access" | "safety" {
	const restricted = (mode: unknown) => mode === "allowlist" || mode === "blocklist";
	const accessSetting = payload.privacyEnablePaidMayTrain === false
		|| payload.privacyEnableFreeMayTrain === false
		|| payload.privacyEnableFreeMayPublishPrompts === false
		|| payload.privacyEnableInputOutputLogging === false
		|| payload.privacyZdrOnly === true
		|| restricted(payload.providerRestrictionMode)
		|| payload.providerRestrictionEnforceAllowed === true
		|| restricted(payload.modelRestrictionMode);
	const safetySetting = payload.promptInjectionEnabled === true || payload.sensitiveInfoEnabled === true;
	return safetySetting && !accessSetting ? "safety" : "access";
}

/**
 * The kind to write: the payload's own when it names one, else on create the inferred kind and on
 * update none (an edit without a kind keeps the stored one, so a partial update cannot flip it).
 */
export function guardrailKindForWrite(payload: GuardrailPayload, mode: "create" | "update"): { kind: GuardrailKind | null } | { error: string } {
	if (payload.kind === undefined || payload.kind === null) return { kind: mode === "create" ? inferGuardrailKind(payload) : null };
	const kind = String(payload.kind).trim().toLowerCase();
	if (!(GUARDRAIL_KINDS as readonly string[]).includes(kind)) return { error: `kind must be one of ${GUARDRAIL_KINDS.join(", ")}` };
	if (!WRITABLE_GUARDRAIL_KINDS.has(kind as GuardrailKind)) return { error: "Spend and rate guardrails are not available yet" };
	return { kind: kind as GuardrailKind };
}

async function adminContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") });
	return context && ["owner", "admin"].includes(context.role.toLowerCase()) ? context : null;
}

export const accountSettingsGuardrailsRouter = new Hono<{ Bindings: Env }>();

const KEY_PAGE_SIZE = 1000;

/** Reads every page of an ordered key query; PostgREST caps one response at 1,000 rows without saying so. */
async function readKeyIds(page: (from: number, to: number) => PromiseLike<{ data: Array<{ id: unknown }> | null; error: unknown }>): Promise<string[] | null> {
	const ids: string[] = [];
	for (let offset = 0; ; offset += KEY_PAGE_SIZE) {
		const result = await page(offset, offset + KEY_PAGE_SIZE - 1);
		if (result.error) return null;
		ids.push(...(result.data ?? []).map((key) => String(key.id)));
		if ((result.data?.length ?? 0) < KEY_PAGE_SIZE) return ids;
	}
}

async function invalidateKeys(c: any, keyIds: string[]): Promise<void> {
	const origin = String(c.env.GATEWAY_API_ORIGIN ?? "http://localhost:8787").replace(/\/$/, "");
	const controlKey = c.env.PHASEO_CONTROL_KEY;
	const controlSecret = c.env.PHASEO_CONTROL_SECRET;
	if (!controlKey || !controlSecret) return;
	await Promise.allSettled([...new Set(keyIds)].map((keyId) => fetch(`${origin}/v1/keys/${encodeURIComponent(keyId)}/invalidate`, {
		method: "POST",
		headers: { authorization: `Bearer ${controlKey}`, "x-control-secret": controlSecret },
	})));
}

async function invalidateWorkspaceKeys(c: any, context: any): Promise<void> {
	const keyIds = await readKeyIds((from, to) => context.client.from("keys").select("id")
		.eq("workspace_id", context.workspaceId).neq("status", "deleted").order("id").range(from, to));
	if (keyIds) await invalidateKeys(c, keyIds);
}

/** The keys a change to these members' guardrails reaches: the gateway applies the member guardrails of a key's principal (oauth_user_id, else created_by). */
async function invalidateMemberKeys(c: any, context: any, userIds: string[]): Promise<void> {
	const [byOauthUser, byCreator] = await Promise.all([
		readKeyIds((from, to) => context.client.from("keys").select("id").eq("workspace_id", context.workspaceId)
			.neq("status", "deleted").in("oauth_user_id", userIds).order("id").range(from, to)),
		readKeyIds((from, to) => context.client.from("keys").select("id").eq("workspace_id", context.workspaceId)
			.neq("status", "deleted").in("created_by", userIds).order("id").range(from, to)),
	]);
	// A key one of them created for someone else's OAuth grant is refreshed too; an extra refresh is harmless.
	if (byOauthUser && byCreator) await invalidateKeys(c, [...byOauthUser, ...byCreator]);
	else await invalidateWorkspaceKeys(c, context);
}

function scheduleInvalidation(c: any, context: any): void {
	c.executionCtx.waitUntil(invalidateWorkspaceKeys(c, context));
}

/** null when every target is valid. */
type TargetProblem = { status: 409 | 503; error: string } | null;

/** Every key is in this workspace and not deleted. */
async function checkWorkspaceKeys(context: any, keyIds: string[]): Promise<TargetProblem> {
	if (!keyIds.length) return null;
	const keys = await context.client.from("keys").select("id,workspace_id,status").in("id", keyIds);
	if (keys.error) return { status: 503, error: "guardrail_write_failed" };
	const valid = new Map<string, any>((keys.data ?? []).map((key: any) => [String(key.id), key]));
	if (keyIds.some((id) => valid.get(id)?.workspace_id !== context.workspaceId || String(valid.get(id)?.status).toLowerCase() === "deleted")) {
		return { status: 409, error: "One or more keys do not belong to this workspace" };
	}
	return null;
}

/** Every user is a current member of this workspace. */
async function checkWorkspaceMembers(context: any, userIds: string[]): Promise<TargetProblem> {
	if (!userIds.length) return null;
	const members = await context.client.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).in("user_id", userIds);
	if (members.error) return { status: 503, error: "guardrail_write_failed" };
	const validIds = new Set((members.data ?? []).map((member: any) => String(member.user_id)));
	if (userIds.some((id) => !validIds.has(id))) return { status: 409, error: "One or more users do not belong to this workspace" };
	return null;
}

/** Every department is in this workspace. */
async function checkWorkspaceDepartments(context: any, departmentIds: string[]): Promise<TargetProblem> {
	if (!departmentIds.length) return null;
	const departments = await context.client.from("workspace_departments").select("id").eq("workspace_id", context.workspaceId).in("id", departmentIds);
	if (departments.error) return { status: 503, error: "guardrail_write_failed" };
	const validIds = new Set((departments.data ?? []).map((department: any) => String(department.id)));
	if (departmentIds.some((id) => !validIds.has(id))) return { status: 409, error: "One or more departments do not belong to this workspace" };
	return null;
}

function idList(value: unknown): string[] {
	return Array.isArray(value) ? [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))] : [];
}

accountSettingsGuardrailsRouter.put("/guardrails/global", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const requestedModels = Array.isArray(body.modelRestrictionModelIds)
			? [...new Set(body.modelRestrictionModelIds.map(String).map((value) => value.trim()).filter(Boolean))]
			: [];
		if (requestedModels.length) {
			const models = await context.client
				.from("v2_model_provider_routes")
				.select("model_slug")
				.in("model_slug", requestedModels)
				.eq("routing_enabled", true)
				.in("status", ["active", "degraded"]);
			if (models.error) throw models.error;
			const validModels = new Set((models.data ?? []).map((row) => String(row.model_slug)));
			if (requestedModels.some((model) => !validModels.has(model))) {
				return c.json({ error: "invalid_route_restriction" }, 400, PRIVATE_NO_STORE_HEADERS);
			}
			body.modelRestrictionModelIds = requestedModels;
		}
		const result = await context.client.from("workspace_settings").upsert({ workspace_id: context.workspaceId, ...guardrailRow(body, false) }, { onConflict: "workspace_id" });
		if (result.error) throw result.error;
		scheduleInvalidation(c, context);
		return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsGuardrailsRouter.post("/guardrails", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const kind = guardrailKindForWrite(body, "create");
	if ("error" in kind) return c.json({ error: kind.error }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await context.client.from("workspace_guardrails").insert({ workspace_id: context.workspaceId, ...guardrailRow(body), kind: kind.kind }).select("id,kind").maybeSingle();
		if (result.error) throw result.error;
		scheduleInvalidation(c, context);
		return c.json({ id: result.data?.id, kind: result.data?.kind ?? kind.kind }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "guardrail_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsGuardrailsRouter.put("/guardrails/:guardrailId", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const kind = guardrailKindForWrite(body, "update");
	if ("error" in kind) return c.json({ error: kind.error }, 400, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await context.client.from("workspace_guardrails").update({ ...guardrailRow(body), ...(kind.kind ? { kind: kind.kind } : {}) })
			.eq("id", c.req.param("guardrailId")).eq("workspace_id", context.workspaceId).select("kind");
		if (result.error) throw result.error;
		scheduleInvalidation(c, context);
		return c.json({ success: true, kind: result.data?.[0]?.kind ?? kind.kind }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "guardrail_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsGuardrailsRouter.delete("/guardrails/:guardrailId", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_guardrails").delete().eq("id", c.req.param("guardrailId")).eq("workspace_id", context.workspaceId);
	if (result.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	scheduleInvalidation(c, context);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsGuardrailsRouter.put("/guardrails/:guardrailId/keys", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const guardrailId = c.req.param("guardrailId");
	const keyIds = idList(body.keyIds);
	const guardrail = await context.client.from("workspace_guardrails").select("id").eq("id", guardrailId).eq("workspace_id", context.workspaceId).maybeSingle();
	if (guardrail.error || !guardrail.data) return c.json({ error: "Guardrail not found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const keyProblem = await checkWorkspaceKeys(context, keyIds);
	if (keyProblem) return c.json({ error: keyProblem.error }, keyProblem.status, PRIVATE_NO_STORE_HEADERS);
	const removed = await context.client.from("key_guardrails").delete().eq("guardrail_id", guardrailId);
	if (removed.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (keyIds.length) {
		const inserted = await context.client.from("key_guardrails").insert(keyIds.map((keyId) => ({ key_id: keyId, guardrail_id: guardrailId })));
		if (inserted.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	scheduleInvalidation(c, context);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsGuardrailsRouter.put("/guardrails/:guardrailId/members", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const guardrailId = c.req.param("guardrailId");
	const userIds = idList(body.userIds);
	const guardrail = await context.client.from("workspace_guardrails").select("id").eq("id", guardrailId).eq("workspace_id", context.workspaceId).maybeSingle();
	if (guardrail.error || !guardrail.data) return c.json({ error: "Guardrail not found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const memberProblem = await checkWorkspaceMembers(context, userIds);
	if (memberProblem) return c.json({ error: memberProblem.error }, memberProblem.status, PRIVATE_NO_STORE_HEADERS);
	const removed = await context.client.from("workspace_member_guardrails").delete().eq("workspace_id", context.workspaceId).eq("guardrail_id", guardrailId);
	if (removed.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (userIds.length) {
		const inserted = await context.client.from("workspace_member_guardrails").insert(userIds.map((userId) => ({ workspace_id: context.workspaceId, user_id: userId, guardrail_id: guardrailId })));
		if (inserted.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	scheduleInvalidation(c, context);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

export { MAX_ASSIGNMENT_GUARDRAILS, MAX_ASSIGNMENT_TARGETS };

export const GUARDRAIL_ASSIGNMENT_TARGET_TYPES = ["workspace", "department", "member", "key"] as const;

export type GuardrailAssignmentChange = {
	targetType: (typeof GUARDRAIL_ASSIGNMENT_TARGET_TYPES)[number];
	/** Always empty for "workspace": the workspace itself is the target. */
	targetIds: string[];
	addGuardrailIds: string[];
	removeGuardrailIds: string[];
};

/**
 * Reads an add/remove change for the whole workspace or many departments, members or keys; unlike the
 * per-guardrail PUTs, it leaves every other assignment as it is. A workspace change names no targets
 * (targetIds absent or empty).
 */
export function parseGuardrailAssignmentChange(body: GuardrailPayload): GuardrailAssignmentChange | { error: string } {
	const targetType = GUARDRAIL_ASSIGNMENT_TARGET_TYPES.find((type) => type === body.targetType);
	if (!targetType) return { error: `targetType must be one of ${GUARDRAIL_ASSIGNMENT_TARGET_TYPES.join(", ")}` };
	const targetIds = idList(body.targetIds);
	const addGuardrailIds = idList(body.addGuardrailIds);
	const removeGuardrailIds = idList(body.removeGuardrailIds);
	if (targetType === "workspace" && targetIds.length) return { error: "A workspace change takes no targetIds" };
	if (targetType !== "workspace" && !targetIds.length) return { error: "Choose at least one target" };
	if (targetIds.length > MAX_ASSIGNMENT_TARGETS) return { error: `Change at most ${MAX_ASSIGNMENT_TARGETS} targets at once` };
	if (!addGuardrailIds.length && !removeGuardrailIds.length) return { error: "Nothing to change" };
	if (addGuardrailIds.length + removeGuardrailIds.length > MAX_ASSIGNMENT_GUARDRAILS) return { error: `Change at most ${MAX_ASSIGNMENT_GUARDRAILS} guardrails at once` };
	if (addGuardrailIds.some((id) => removeGuardrailIds.includes(id))) return { error: "A guardrail cannot be added and removed in one change" };
	return { targetType, targetIds, addGuardrailIds, removeGuardrailIds };
}

accountSettingsGuardrailsRouter.patch("/guardrails/assignments", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const change = parseGuardrailAssignmentChange(body);
	if ("error" in change) return c.json({ error: change.error }, 400, PRIVATE_NO_STORE_HEADERS);
	const { targetType, targetIds, addGuardrailIds, removeGuardrailIds } = change;
	const guardrailIds = [...addGuardrailIds, ...removeGuardrailIds];
	const guardrails = await context.client.from("workspace_guardrails").select("id").eq("workspace_id", context.workspaceId).in("id", guardrailIds);
	if (guardrails.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if ((guardrails.data ?? []).length !== guardrailIds.length) return c.json({ error: "Guardrail not found" }, 404, PRIVATE_NO_STORE_HEADERS);
	// Adding needs current members. Removing does not: the gateway keeps applying a former member's
	// guardrails to the keys they created, and this is the only way to take them off.
	const problem = targetType === "key"
		? await checkWorkspaceKeys(context, targetIds)
		: targetType === "member"
			? await checkWorkspaceMembers(context, addGuardrailIds.length ? targetIds : [])
			: await checkWorkspaceDepartments(context, targetIds);
	if (problem) return c.json({ error: problem.error }, problem.status, PRIVATE_NO_STORE_HEADERS);
	// One transaction, so a failed change leaves every assignment as it was.
	const result = await context.client.rpc("apply_guardrail_assignment_change", {
		p_workspace_id: context.workspaceId,
		p_target_type: targetType,
		p_target_ids: targetIds,
		p_add_guardrail_ids: addGuardrailIds,
		p_remove_guardrail_ids: removeGuardrailIds,
	});
	if (result.error) {
		const message = String(result.error.message ?? "");
		if (message.includes("slack_agent_guardrail_protected")) return c.json({ error: "guardrail_protected" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (message.includes("guardrail_assignment_target_not_found")) return c.json({ error: "One or more targets do not belong to this workspace" }, 409, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	// A workspace or department change reaches keys through their principal's departments, so every
	// key in the workspace is refreshed. The database also queues a workspace publication for it,
	// which the gateway drains within about a minute even if these calls fail.
	c.executionCtx.waitUntil(targetType === "key"
		? invalidateKeys(c, targetIds)
		: targetType === "member" ? invalidateMemberKeys(c, context, targetIds) : invalidateWorkspaceKeys(c, context));
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

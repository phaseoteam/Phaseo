import { Hono } from "hono";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";

type GuardrailPayload = Record<string, any>;

function guardrailRow(payload: GuardrailPayload, includeName = true): Record<string, unknown> {
	const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (includeName) {
		const name = String(payload.name ?? "").trim();
		if (!name) throw new Error("Name is required");
		row.name = name;
		row.description = payload.description ?? null;
		row.enabled = payload.enabled ?? true;
	}
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
		typeof payload.ioLoggingIncludeProviderPayloads === "boolean";
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
	if (ioLoggingUpdated) row.io_logging_updated_at = row.updated_at;
	if (includeName) {
		const budgets = payload.budgets ?? {};
		Object.assign(row, {
			daily_limit_requests: budgets.dailyRequests ?? 0,
			weekly_limit_requests: budgets.weeklyRequests ?? 0,
			monthly_limit_requests: budgets.monthlyRequests ?? 0,
			daily_limit_cost_nanos: budgets.dailyCostNanos ?? 0,
			weekly_limit_cost_nanos: budgets.weeklyCostNanos ?? 0,
			monthly_limit_cost_nanos: budgets.monthlyCostNanos ?? 0,
		});
	}
	return row;
}

async function adminContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") });
	return context && ["owner", "admin"].includes(context.role.toLowerCase()) ? context : null;
}

export const accountSettingsGuardrailsRouter = new Hono<{ Bindings: Env }>();

accountSettingsGuardrailsRouter.put("/guardrails/global", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await context.client.from("workspace_settings").upsert({ workspace_id: context.workspaceId, ...guardrailRow(body, false) }, { onConflict: "workspace_id" });
		if (result.error) throw result.error;
		return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsGuardrailsRouter.post("/guardrails", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await context.client.from("workspace_guardrails").insert({ workspace_id: context.workspaceId, ...guardrailRow(body) }).select("id").maybeSingle();
		if (result.error) throw result.error;
		return c.json({ id: result.data?.id }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "guardrail_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsGuardrailsRouter.put("/guardrails/:guardrailId", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	try {
		const result = await context.client.from("workspace_guardrails").update(guardrailRow(body)).eq("id", c.req.param("guardrailId")).eq("workspace_id", context.workspaceId);
		if (result.error) throw result.error;
		return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) { return c.json({ error: error instanceof Error ? error.message : "guardrail_write_failed" }, 409, PRIVATE_NO_STORE_HEADERS); }
});

accountSettingsGuardrailsRouter.delete("/guardrails/:guardrailId", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const result = await context.client.from("workspace_guardrails").delete().eq("id", c.req.param("guardrailId")).eq("workspace_id", context.workspaceId);
	if (result.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsGuardrailsRouter.put("/guardrails/:guardrailId/keys", async (c) => {
	const body: GuardrailPayload = await c.req.json<GuardrailPayload>().catch(() => ({}));
	const context = await adminContext(c, body.workspaceId);
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const guardrailId = c.req.param("guardrailId");
	const keyIds = Array.isArray(body.keyIds) ? [...new Set(body.keyIds.map(String).filter(Boolean))] : [];
	const guardrail = await context.client.from("workspace_guardrails").select("id").eq("id", guardrailId).eq("workspace_id", context.workspaceId).maybeSingle();
	if (guardrail.error || !guardrail.data) return c.json({ error: "Guardrail not found" }, 404, PRIVATE_NO_STORE_HEADERS);
	if (keyIds.length) {
		const keys = await context.client.from("keys").select("id,workspace_id,status").in("id", keyIds);
		if (keys.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
		const valid = new Map((keys.data ?? []).map((key) => [key.id, key]));
		if (keyIds.some((id) => valid.get(id)?.workspace_id !== context.workspaceId || String(valid.get(id)?.status).toLowerCase() === "deleted")) return c.json({ error: "One or more keys do not belong to this workspace" }, 409, PRIVATE_NO_STORE_HEADERS);
	}
	const removed = await context.client.from("key_guardrails").delete().eq("guardrail_id", guardrailId);
	if (removed.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (keyIds.length) {
		const inserted = await context.client.from("key_guardrails").insert(keyIds.map((keyId) => ({ key_id: keyId, guardrail_id: guardrailId })));
		if (inserted.error) return c.json({ error: "guardrail_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

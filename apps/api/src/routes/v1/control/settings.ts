import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { setKeyVersion } from "@/core/kv";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { bumpWorkspacePolicyVersion } from "@/pipeline/before/workspacePolicy";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import {
	isResponse,
	internalServerError,
	rejectThirdPartyOAuthSpendingChange,
	requireJsonBody,
	requireCapability,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

const WRITABLE_FIELDS = new Set([
	"routing_mode",
	"beta_channel_enabled",
	"alpha_channel_enabled",
	"response_healing_enabled",
	"response_healing_locked",
	"response_healing_mode",
	"byok_fallback_enabled",
	"privacy_enable_paid_may_train",
	"privacy_enable_free_may_train",
	"privacy_enable_free_may_publish_prompts",
	"privacy_enable_input_output_logging",
	"privacy_zdr_only",
	"io_logging_enabled",
	"io_logging_include_provider_payloads",
	"provider_restriction_mode",
	"provider_restriction_provider_ids",
	"provider_restriction_enforce_allowed",
	"model_successor_redirect_enabled",
	"model_successor_price_policy",
	"model_successor_max_price_increase_percent",
]);

const SETTINGS_COLUMNS = ["workspace_id", ...WRITABLE_FIELDS, "updated_at"].join(",");

function formatSettings(row: Record<string, unknown> | null | undefined, workspaceId: string) {
	const source = row ?? {};
	return Object.fromEntries([
		["workspace_id", workspaceId],
		...Array.from(WRITABLE_FIELDS, (field) => [field, source[field] ?? null]),
		["updated_at", source.updated_at ?? null],
	]);
}

const CAMEL_TO_SNAKE: Record<string, string> = {
	routingMode: "routing_mode",
	betaChannelEnabled: "beta_channel_enabled",
	alphaChannelEnabled: "alpha_channel_enabled",
	responseHealingEnabled: "response_healing_enabled",
	responseHealingLocked: "response_healing_locked",
	responseHealingMode: "response_healing_mode",
	byokFallbackEnabled: "byok_fallback_enabled",
	privacyEnablePaidMayTrain: "privacy_enable_paid_may_train",
	privacyEnableFreeMayTrain: "privacy_enable_free_may_train",
	privacyEnableFreeMayPublishPrompts: "privacy_enable_free_may_publish_prompts",
	privacyEnableInputOutputLogging: "privacy_enable_input_output_logging",
	privacyZdrOnly: "privacy_zdr_only",
	ioLoggingEnabled: "io_logging_enabled",
	ioLoggingIncludeProviderPayloads: "io_logging_include_provider_payloads",
	providerRestrictionMode: "provider_restriction_mode",
	providerRestrictionProviderIds: "provider_restriction_provider_ids",
	providerRestrictionEnforceAllowed: "provider_restriction_enforce_allowed",
	modelSuccessorRedirectEnabled: "model_successor_redirect_enabled",
	modelSuccessorPricePolicy: "model_successor_price_policy",
	modelSuccessorMaxPriceIncreasePercent: "model_successor_max_price_increase_percent",
};

// What a successor redirect may cost, and whether a failed BYOK request may spend credits instead: limits
// on spending, which apps that sign in with Phaseo can't change.
const SPENDING_LIMIT_FIELDS = new Set([
	"model_successor_price_policy",
	"model_successor_max_price_increase_percent",
	"byok_fallback_enabled",
]);

const WORKSPACE_POLICY_FIELDS = new Set([
	"provider_restriction_mode",
	"provider_restriction_provider_ids",
	"provider_restriction_enforce_allowed",
]);

const GATEWAY_CONTEXT_FIELDS = new Set([
	"routing_mode",
	"beta_channel_enabled",
	"alpha_channel_enabled",
	"response_healing_enabled",
	"response_healing_locked",
	"response_healing_mode",
	"byok_fallback_enabled",
	"cache_aware_routing_enabled",
	"privacy_enable_paid_may_train",
	"privacy_enable_free_may_train",
	"privacy_enable_input_output_logging",
	"privacy_zdr_only",
	"io_logging_enabled",
	"io_logging_include_provider_payloads",
]);

function normalizeStringList(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > 64) return null;
	const values = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
	return values.every((item) => item.length <= 128) ? values : null;
}

function normalizeSettingsPatch(body: Record<string, unknown>): { data: Record<string, unknown> } | { error: string } {
	const patch: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(body)) {
		const key = CAMEL_TO_SNAKE[rawKey] ?? rawKey;
		if (WRITABLE_FIELDS.has(key)) patch[key] = value;
	}
	if (patch.routing_mode !== undefined && !["balanced", "price", "latency", "throughput"].includes(String(patch.routing_mode))) {
		return { error: "routing_mode must be balanced, price, latency, or throughput" };
	}
	if (patch.response_healing_mode !== undefined && !["safe", "strict"].includes(String(patch.response_healing_mode))) {
		return { error: "response_healing_mode must be safe or strict" };
	}
	if (patch.provider_restriction_mode !== undefined && !["none", "allowlist", "blocklist"].includes(String(patch.provider_restriction_mode))) {
		return { error: "provider_restriction_mode must be none, allowlist, or blocklist" };
	}
	const pricePolicy = patch.model_successor_price_policy;
	if (pricePolicy !== undefined && (typeof pricePolicy !== "string" || !["never", "limit", "any"].includes(pricePolicy))) {
		return { error: "model_successor_price_policy must be never, limit, or any" };
	}
	const percent = patch.model_successor_max_price_increase_percent;
	if (percent !== undefined && (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 1000)) {
		return { error: "model_successor_max_price_increase_percent must be an integer from 0 to 1000" };
	}
	for (const [field, value] of Object.entries(patch)) {
		if (field === "routing_mode" || field === "response_healing_mode" || field === "provider_restriction_mode" || field === "provider_restriction_provider_ids") continue;
		if (field === "model_successor_price_policy" || field === "model_successor_max_price_increase_percent") continue;
		if (typeof value !== "boolean") return { error: `${field} must be a boolean` };
	}
	if (patch.provider_restriction_provider_ids !== undefined) {
		const providerIds = normalizeStringList(patch.provider_restriction_provider_ids);
		if (!providerIds) return { error: "provider_restriction_provider_ids must contain at most 64 provider ids" };
		patch.provider_restriction_provider_ids = providerIds;
	}
	if (patch.alpha_channel_enabled === true && patch.beta_channel_enabled === false) {
		return { error: "alpha_channel_enabled requires beta_channel_enabled" };
	}
	if (patch.beta_channel_enabled === false) patch.alpha_channel_enabled = false;
	return { data: patch };
}

export async function invalidateWorkspaceGatewayContextCache(workspaceId: string): Promise<void> {
	const { data, error } = await getSupabaseAdmin()
		.from("keys")
		.select("id")
		.eq("workspace_id", workspaceId)
		.neq("status", "deleted");
	if (error) throw new Error(error.message || "Failed to list workspace keys for context cache invalidation");
	const nowVersion = Date.now();
	await Promise.all(
		(data ?? [])
			.map((row) => String((row as { id?: unknown }).id ?? "").trim())
			.filter(Boolean)
			.map((keyId) => setKeyVersion("id", keyId, nowVersion)),
	);
}

async function handleGetSettings(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.SETTINGS_READ);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	try {
		const { data, error } = await getSupabaseAdmin()
			.from("workspace_settings")
			.select(SETTINGS_COLUMNS)
			.eq("workspace_id", auth.value.workspaceId)
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to fetch workspace settings");
		return json({ data: formatSettings(data as unknown as Record<string, unknown> | null, auth.value.workspaceId) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("settings.get", error);
	}
}

async function handleUpdateSettings(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.SETTINGS_WRITE);
	if (scopeError) return scopeError;
	const roleError = await requireOAuthWorkspaceRole(auth.value, auth.value.workspaceId, ["owner", "admin"]);
	if (roleError) return roleError;

	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const normalized = normalizeSettingsPatch(body);
	if ("error" in normalized) {
		return json({ error: "bad_request", message: normalized.error }, 400, { "Cache-Control": "no-store" });
	}
	const patch = normalized.data;
	if (Object.keys(patch).length === 0) {
		return json({ error: "bad_request", message: "No supported settings fields were provided" }, 400, { "Cache-Control": "no-store" });
	}
	if (Object.keys(patch).some((field) => SPENDING_LIMIT_FIELDS.has(field))) {
		const appError = rejectThirdPartyOAuthSpendingChange(auth.value, "Apps that use Sign in with Phaseo can't change the successor price policy or BYOK fallback to credits. The person can change them under Settings, Routing or Settings, BYOK.");
		if (appError) return appError;
	}

	try {
		const payload = {
			workspace_id: auth.value.workspaceId,
			...patch,
			updated_at: new Date().toISOString(),
		};
		const { data, error } = await getSupabaseAdmin()
			.from("workspace_settings")
			.upsert(payload, { onConflict: "workspace_id" })
			.select(SETTINGS_COLUMNS)
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to update workspace settings");
		if (Object.keys(patch).some((field) => WORKSPACE_POLICY_FIELDS.has(field))) {
			await bumpWorkspacePolicyVersion(auth.value.workspaceId);
		}
		if (Object.keys(patch).some((field) => GATEWAY_CONTEXT_FIELDS.has(field))) {
			await invalidateWorkspaceGatewayContextCache(auth.value.workspaceId);
		}
		await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
			workspaceId: auth.value.workspaceId,
			actorUserId: auth.value.userId,
			action: "routing.policy.updated",
			targetType: "workspace_routing_policy",
			targetId: auth.value.workspaceId,
			metadata: { changed_fields: Object.keys(patch) },
			requestId: auth.value.requestId,
		});
		return json({ data: formatSettings(data as unknown as Record<string, unknown> | null, auth.value.workspaceId) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("settings.update", error);
	}
}

export const settingsRoutes = new Hono<Env>();

settingsRoutes.get("/", withRuntime(handleGetSettings));
settingsRoutes.patch("/", withRuntime(handleUpdateSettings));

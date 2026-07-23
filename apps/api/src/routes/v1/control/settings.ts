import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { setKeyVersion } from "@/core/kv";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { bumpWorkspacePolicyVersion } from "@/pipeline/before/workspacePolicy";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "@/routes/utils";
import {
	isResponse,
	internalServerError,
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
]);

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
};

const WORKSPACE_POLICY_FIELDS = new Set([
	"provider_restriction_mode",
	"provider_restriction_provider_ids",
	"provider_restriction_enforce_allowed",
]);

const GATEWAY_CONTEXT_FIELDS = new Set([
	"routing_mode",
	"beta_channel_enabled",
	"alpha_channel_enabled",
	"byok_fallback_enabled",
	"cache_aware_routing_enabled",
	"privacy_enable_paid_may_train",
	"privacy_enable_free_may_train",
	"privacy_enable_input_output_logging",
	"privacy_zdr_only",
	"io_logging_enabled",
	"io_logging_include_provider_payloads",
]);

function normalizeSettingsPatch(body: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(body)) {
		const key = CAMEL_TO_SNAKE[rawKey] ?? rawKey;
		if (WRITABLE_FIELDS.has(key)) patch[key] = value;
	}
	if (patch.beta_channel_enabled === false) {
		patch.alpha_channel_enabled = false;
	}
	return patch;
}

async function invalidateWorkspaceGatewayContextCache(workspaceId: string): Promise<void> {
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
			.select("*")
			.eq("workspace_id", auth.value.workspaceId)
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to fetch workspace settings");
		return json({ data: data ?? { workspace_id: auth.value.workspaceId, routing_mode: "balanced" } }, 200, { "Cache-Control": "no-store" });
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
	const patch = normalizeSettingsPatch(body);
	if (Object.keys(patch).length === 0) {
		return json({ error: "bad_request", message: "No supported settings fields were provided" }, 400, { "Cache-Control": "no-store" });
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
			.select("*")
			.maybeSingle();
		if (error) throw new Error(error.message || "Failed to update workspace settings");
		if (Object.keys(patch).some((field) => WORKSPACE_POLICY_FIELDS.has(field))) {
			await bumpWorkspacePolicyVersion(auth.value.workspaceId);
		}
		if (Object.keys(patch).some((field) => GATEWAY_CONTEXT_FIELDS.has(field))) {
			await invalidateWorkspaceGatewayContextCache(auth.value.workspaceId);
		}
		return json({ data }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("settings.update", error);
	}
}

export const settingsRoutes = new Hono<Env>();

settingsRoutes.get("/", withRuntime(handleGetSettings));
settingsRoutes.patch("/", withRuntime(handleUpdateSettings));

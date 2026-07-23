import { Hono } from "hono";
import { notifyAccountDeleted } from "@/auth/accountLifecycleDiscord";
import { requireUser } from "@/auth/requireUser";
import { getAuthenticatedDataClient, getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";
import { accountSettingsPolicyRouter } from "./settings-policy";
import { accountSettingsUsageRouter } from "./settings-usage";
import { accountSettingsUsageActionsRouter } from "./settings-usage-actions";
import { accountSettingsTeamsRouter } from "./settings-teams";
import { accountSettingsProfileRouter } from "./settings-profile";
import { accountSettingsKeysRouter } from "./settings-keys";
import { accountSettingsOAuthRouter } from "./settings-oauth";
import { accountSettingsByokRouter } from "./settings-byok";
import { accountSettingsGuardrailsRouter } from "./settings-guardrails";
import { accountSettingsBroadcastRouter } from "./settings-broadcast";
import { accountSettingsWebhooksRouter } from "./settings-webhooks";
import { purgeWorkerCacheTags } from "@/http/invalidation";

function normalizeBetaFeatures(value: unknown): Record<string, boolean> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, boolean] =>
			typeof entry[1] === "boolean",
		),
	);
}

function providerDisplayName(provider: Record<string, unknown>): string {
	const providerId = String(provider.api_provider_id ?? "").trim();
	let name = String(provider.api_provider_name ?? providerId).trim();
	if (["anthropic-aws", "anthropic-aws-us"].includes(providerId)) {
		name = "Anthropic on AWS";
	}
	const label = String(provider.offer_label ?? "").trim();
	const scope = String(provider.offer_scope ?? "").trim();
	if (!label || scope === "global" || ["anthropic-aws", "anthropic-aws-us"].includes(providerId)) {
		return name;
	}
	if (scope === "regional") {
		const providerWords = new Set(name.toLowerCase().split(/\s+/));
		const regional = label.split(/\s+/).filter((word) =>
			!providerWords.has(word.toLowerCase()),
		).join(" ").trim() || label;
		return `${name} (${regional})`;
	}
	return `${name} ${label}`;
}

const APP_CATEGORIES = new Set([
	"chat", "developer-tools", "research", "productivity", "education",
	"commerce", "media", "finance", "other",
]);
const OBSERVABILITY_DESTINATIONS = new Set([
	"arize", "braintrust", "clickhouse", "comet_opik", "datadog", "grafana_cloud",
	"langfuse", "langsmith", "new_relic", "otel_collector", "posthog", "s3",
	"sentry", "snowflake", "wandb_weave", "webhook",
]);

function normalizeAppCategories(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const categories = Array.from(new Set(value.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter((item) => APP_CATEGORIES.has(item))))
		.slice(0, 3);
	return categories.length ? categories.join(",") : null;
}

function isInternalApp(titleValue: unknown, keyValue: unknown): boolean {
	const title = String(titleValue ?? "").trim().toLowerCase();
	if (["phaseo chat", "phaseo playground", "ai stats chat", "ai stats playground"].includes(title)) {
		return true;
	}
	const key = String(keyValue ?? "").trim().toLowerCase();
	return ["phaseo-chat", "phaseo-playground", "ai-stats-chat", "aistats-chat", "ai-stats-playground", "aistats-playground"]
		.some((prefix) => key.startsWith(prefix));
}

export const accountSettingsRouter = new Hono<{ Bindings: Env }>();
accountSettingsRouter.route("/", accountSettingsPolicyRouter);
accountSettingsRouter.route("/", accountSettingsUsageRouter);
accountSettingsRouter.route("/", accountSettingsUsageActionsRouter);
accountSettingsRouter.route("/", accountSettingsTeamsRouter);
accountSettingsRouter.route("/", accountSettingsProfileRouter);
accountSettingsRouter.route("/", accountSettingsKeysRouter);
accountSettingsRouter.route("/", accountSettingsOAuthRouter);
accountSettingsRouter.route("/", accountSettingsByokRouter);
accountSettingsRouter.route("/", accountSettingsGuardrailsRouter);
accountSettingsRouter.route("/", accountSettingsBroadcastRouter);
accountSettingsRouter.route("/", accountSettingsWebhooksRouter);

accountSettingsRouter.get("/layout", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({
			isEnterpriseInvoiceMode: false,
			showBroadcast: false,
			signedIn: false,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		return c.json({
			isEnterpriseInvoiceMode: false,
			showBroadcast: false,
			signedIn: true,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({
		request: c.req.raw,
		env: c.env,
		workspaceId,
	});
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const { data, error } = await context.client
		.from("workspaces")
		.select("tier,billing_mode")
		.eq("id", context.workspaceId)
		.maybeSingle();
	if (error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		isEnterpriseInvoiceMode:
			String(data?.tier ?? "").toLowerCase() === "enterprise" &&
			String(data?.billing_mode ?? "wallet").toLowerCase() === "invoice",
		showBroadcast: context.role.toLowerCase() === "admin",
		signedIn: true,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/contact-personalization", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ defaultInternalId: "", isAuthenticated: false, tierLabel: "", userEmail: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = c.req.query("workspaceId")?.trim();
	const base = { defaultInternalId: "", isAuthenticated: true, tierLabel: "", userEmail: user.email ?? null };
	if (!workspaceId) return c.json(base, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [spendResult, workspaceResult] = await Promise.all([
		context.client.rpc("monthly_spend_prev_cents", { p_team: workspaceId }).single(),
		context.client.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle(),
	]);
	if (spendResult.error || workspaceResult.error) return c.json(base, 200, PRIVATE_NO_STORE_HEADERS);
	const lastMonthUsd = Number(spendResult.data ?? 0) / 1_000_000_000;
	return c.json({ ...base, defaultInternalId: workspaceResult.data?.slug ?? workspaceId, tierLabel: lastMonthUsd >= 10_000 ? "Enterprise" : "Basic" }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/beta", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({
			profile: { betaOptIn: false, betaFeatures: {} },
			signedIn: false,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const { data, error } = await getDataClient(c.env)
		.from("users")
		.select("beta_opt_in,beta_features")
		.eq("user_id", user.id)
		.maybeSingle();
	if (error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({
		profile: {
			betaOptIn: Boolean(data?.beta_opt_in),
			betaFeatures: normalizeBetaFeatures(data?.beta_features),
		},
		signedIn: true,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.put("/beta", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const roleResult = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (roleResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const body: { beta_features?: unknown } = await c.req.json<{ beta_features?: unknown }>().catch(() => ({}));
	const requested = normalizeBetaFeatures(body.beta_features);
	const isAdmin = String(roleResult.data?.role ?? "").toLowerCase() === "admin";
	const betaFeatures = isAdmin && requested.models_catalogue_v2 === true ? { models_catalogue_v2: true } : {};
	const profile = { betaOptIn: Object.keys(betaFeatures).length > 0, betaFeatures };
	const result = await client.from("users").upsert({ user_id: user.id, beta_opt_in: profile.betaOptIn, beta_features: profile.betaFeatures }, { onConflict: "user_id" });
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, profile }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/privacy", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		return c.json({
			activeProviderModels: [], initialGlobal: null, providers: [],
			teamName: null, workspaceId: null,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({
		request: c.req.raw,
		env: c.env,
		workspaceId,
	});
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, settingsResult, providersResult, modelsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client.from("workspace_settings").select("privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_enable_free_may_publish_prompts,privacy_enable_input_output_logging,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids,provider_restriction_enforce_allowed").eq("workspace_id", workspaceId).maybeSingle(),
		context.client.from("data_api_providers").select("api_provider_id,api_provider_name,offer_label,offer_scope").order("api_provider_name", { ascending: true }),
		context.client.from("data_api_provider_models").select("provider_id,api_model_id,internal_model_id,is_active_gateway").eq("is_active_gateway", true),
	]);
	for (const result of [teamResult, settingsResult, providersResult, modelsResult]) {
		if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({
		activeProviderModels: (modelsResult.data ?? []).map((row) => ({
			apiModelId: row.api_model_id,
			internalModelId: row.internal_model_id ?? null,
			providerId: row.provider_id,
		})),
		initialGlobal: settingsResult.data ?? null,
		providers: (providersResult.data ?? []).map((provider) => ({
			id: provider.api_provider_id,
			name: providerDisplayName(provider),
		})),
		teamName: teamResult.data?.name ?? null,
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/workspace/privacy-settings", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json(null, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json(null, 200, PRIVATE_NO_STORE_HEADERS);
	const { data, error } = await context.client.from("workspace_settings")
		.select("privacy_enable_paid_may_train,privacy_enable_free_may_train,privacy_zdr_only,provider_restriction_mode,provider_restriction_provider_ids")
		.eq("workspace_id", workspaceId).maybeSingle();
	if (error || !data) return c.json(null, 200, PRIVATE_NO_STORE_HEADERS);
	const mode = String(data.provider_restriction_mode ?? "").trim().toLowerCase();
	return c.json({
		isAuthenticated: true,
		privacyEnablePaidMayTrain: Boolean(data.privacy_enable_paid_may_train ?? true),
		privacyEnableFreeMayTrain: Boolean(data.privacy_enable_free_may_train ?? true),
		privacyZdrOnly: Boolean(data.privacy_zdr_only ?? false),
		providerRestrictionMode: ["none", "allowlist", "blocklist"].includes(mode) ? mode : "none",
		providerRestrictionProviderIds: Array.isArray(data.provider_restriction_provider_ids)
			? data.provider_restriction_provider_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
			: [],
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/account/danger", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	return c.json({ signedIn: Boolean(user) }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.delete("/account", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const { error } = await getDataClient(c.env).auth.admin.deleteUser(user.id);
	if (error) return c.json({ error: "account_delete_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	c.executionCtx.waitUntil(notifyAccountDeleted(c.env, { id: user.id, email: user.email }).catch((notificationError) => console.error("account_delete_notification_failed", { userId: user.id, error: String(notificationError) })));
	return c.json({ ok: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/account/details", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({ hasPassword: false, teams: [], user: null }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const client = getDataClient(c.env);
	const [userResult, teamsResult] = await Promise.all([
		client
			.from("users")
			.select("user_id,display_name,default_workspace_id,obfuscate_info,created_at")
			.eq("user_id", user.id)
			.maybeSingle(),
		client
			.from("workspace_members")
			.select("workspace_id,teams:workspaces(id,name)")
			.eq("user_id", user.id),
	]);
	if (userResult.error || teamsResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const cookieOverride = c.req.query("obfuscateInfo");
	const obfuscateInfo = cookieOverride === "1"
		? true
		: cookieOverride === "0"
			? false
			: Boolean(userResult.data?.obfuscate_info);
	const provider = String(user.appMetadata.provider ?? "").trim();
	const teams = (teamsResult.data ?? []).flatMap((membership) => {
		const team = Array.isArray(membership.teams)
			? membership.teams[0]
			: membership.teams;
		return team?.id && team?.name ? [{ id: team.id, name: team.name }] : [];
	});
	return c.json({
		hasPassword: !provider || provider === "email",
		teams,
		user: {
			id: user.id,
			displayName: userResult.data?.display_name ?? null,
			email: user.email,
			defaultWorkspaceId: userResult.data?.default_workspace_id ?? null,
			obfuscateInfo,
			createdAt: userResult.data?.created_at ?? user.createdAt,
		},
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/account/mfa", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({
			hasPassword: false,
			mfaEnabled: false,
			mfaFactorId: null,
			signedIn: false,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const factor = user.factors.find((candidate) =>
		candidate.factor_type === "totp" && candidate.status === "verified",
	);
	const provider = String(user.appMetadata.provider ?? "").trim();
	return c.json({
		hasPassword: !provider || provider === "email",
		mfaEnabled: Boolean(factor),
		mfaFactorId: factor?.id ?? null,
		signedIn: true,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/broadcast", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		return c.json({
			configuredDestinations: [],
			teamName: null,
			workspaceId: null,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({
		request: c.req.raw,
		env: c.env,
		workspaceId,
	});
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, configuredResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client
			.from("workspace_broadcast_destinations")
			.select("id,destination_id,name,enabled,sampling_rate,destination_config,updated_at")
			.eq("workspace_id", workspaceId)
			.order("created_at", { ascending: false }),
	]);
	if (teamResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	if (configuredResult.error && !configuredResult.error.message.includes("workspace_broadcast_destinations")) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({
		configuredDestinations: (configuredResult.data ?? []).map((row) => ({
			id: row.id,
			destinationId: row.destination_id,
			name: row.name,
			enabled: Boolean(row.enabled),
			samplingRate: Number(row.sampling_rate ?? 1),
			destinationConfig: row.destination_config ?? null,
			updatedAt: row.updated_at ?? null,
		})),
		teamName: teamResult.data?.name ?? null,
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/apps", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ apps: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const selectApps = (columns: string) => context.client
		.from("api_apps")
		.select(columns)
		.eq("workspace_id", workspaceId)
		.order("last_seen", { ascending: false });
	const initial = await selectApps("id,title,app_key,category,docs_url,url,image_url,is_public,is_active,last_seen,created_at");
	let data = initial.data as unknown as Array<Record<string, unknown>> | null;
	let error = initial.error as { message: string } | null;
	if (error && /category|docs_url/i.test(error.message)) {
		const fallback = await selectApps("id,title,app_key,url,image_url,is_public,is_active,last_seen,created_at");
		data = (fallback.data as unknown as Array<Record<string, unknown>> | null)?.map((app) => ({
			...app,
			category: null,
			docs_url: null,
		})) ?? null;
		error = fallback.error as { message: string } | null;
	}
	if (error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const apps = (data ?? [])
		.filter((app) => !isInternalApp(app.title, app.app_key))
		.map((app) => ({
			app_key: String(app.app_key ?? ""),
			category: normalizeAppCategories(app.category),
			created_at: typeof app.created_at === "string" ? app.created_at : null,
			docs_url: typeof app.docs_url === "string" ? app.docs_url : null,
			id: String(app.id ?? ""),
			image_url: typeof app.image_url === "string" ? app.image_url : null,
			is_active: app.is_active === true,
			is_public: app.is_public === true,
			last_seen: typeof app.last_seen === "string" ? app.last_seen : null,
			title: String(app.title ?? ""),
			url: typeof app.url === "string" ? app.url : null,
		}));
	return c.json({ apps }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.put("/apps/:appId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const appId = c.req.param("appId");
	const existing = await client.from("api_apps").select("id,workspace_id,title,app_key").eq("id", appId).maybeSingle();
	if (existing.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!existing.data?.workspace_id) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: existing.data.workspace_id });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (isInternalApp(existing.data.title, existing.data.app_key)) return c.json({ error: "managed_app" }, 403, PRIVATE_NO_STORE_HEADERS);
	const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
	const update: Record<string, unknown> = {};
	if (typeof body.title === "string") { const value = body.title.trim(); if (!value) return c.json({ error: "invalid_title" }, 400, PRIVATE_NO_STORE_HEADERS); update.title = value; }
	if (body.url === null) update.url = "about:blank"; else if (typeof body.url === "string") update.url = body.url.trim() || "about:blank";
	for (const field of ["docs_url", "image_url"] as const) {
		if (body[field] === null) update[field] = null;
		else if (typeof body[field] === "string") {
			const value = body[field].trim();
			if (!value) update[field] = null;
			else { try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); update[field] = url.toString(); } catch { return c.json({ error: `invalid_${field}` }, 400, PRIVATE_NO_STORE_HEADERS); } }
		}
	}
	if (typeof body.is_public === "boolean") update.is_public = body.is_public;
	if (typeof body.is_active === "boolean") update.is_active = body.is_active;
	if (Object.prototype.hasOwnProperty.call(body, "category")) update.category = normalizeAppCategories(body.category);
	if (Object.keys(update).length) { const result = await context.client.from("api_apps").update(update).eq("id", appId).eq("workspace_id", context.workspaceId); if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); }
	const cache = await purgeWorkerCacheTags(c.executionCtx, ["web-api-apps", "web-api-app-ids", "web-api-app-images", "web-api-app-rankings", "web-api-landing", `web-api-app-${encodeURIComponent(appId).replace(/%/g, "")}`]);
	return c.json({ success: true, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.post("/apps/:sourceAppId/merge", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const sourceAppId = c.req.param("sourceAppId");
	const body: { targetAppId?: string } = await c.req.json<{ targetAppId?: string }>().catch(() => ({}));
	const targetAppId = String(body.targetAppId ?? "").trim();
	if (!targetAppId || targetAppId === sourceAppId) return c.json({ error: "invalid_target" }, 400, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const apps = await client.from("api_apps").select("id,workspace_id,title,app_key").in("id", [sourceAppId, targetAppId]);
	if (apps.error || (apps.data?.length ?? 0) !== 2) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = apps.data![0].workspace_id;
	if (!workspaceId || !apps.data!.every((app) => app.workspace_id === workspaceId)) return c.json({ error: "invalid_target" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (apps.data!.some((app) => isInternalApp(app.title, app.app_key))) return c.json({ error: "managed_app" }, 403, PRIVATE_NO_STORE_HEADERS);
	const moved = await context.client.from("gateway_requests").update({ app_id: targetAppId }).eq("app_id", sourceAppId).eq("workspace_id", workspaceId);
	if (moved.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const removed = await context.client.from("api_apps").delete().eq("id", sourceAppId).eq("workspace_id", workspaceId);
	if (removed.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const dynamic = [sourceAppId, targetAppId].map((id) => `web-api-app-${encodeURIComponent(id).replace(/%/g, "")}`);
	const cache = await purgeWorkerCacheTags(c.executionCtx, ["web-api-apps", "web-api-app-ids", "web-api-app-images", "web-api-app-rankings", "web-api-landing", ...dynamic]);
	return c.json({ success: true, cache }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/authorized-apps", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({ authorizedApps: [], signedIn: false, userId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const client = getDataClient(c.env);
	const authorizationsResult = await client
		.from("oauth_authorizations")
		.select("id,client_id,workspace_id,scopes,created_at,last_used_at")
		.eq("user_id", user.id)
		.is("revoked_at", null)
		.order("last_used_at", { ascending: false, nullsFirst: false });
	if (authorizationsResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const authorizations = authorizationsResult.data ?? [];
	const clientIds = Array.from(new Set(authorizations.map((row) => String(row.client_id ?? "")).filter(Boolean)));
	const workspaceIds = Array.from(new Set(authorizations.map((row) => String(row.workspace_id ?? "")).filter(Boolean)));
	const [appsResult, workspacesResult] = await Promise.all([
		clientIds.length
			? client.from("oauth_app_metadata").select("client_id,name,description,logo_url,homepage_url,allowed_scopes").in("client_id", clientIds)
			: Promise.resolve({ data: [], error: null }),
		workspaceIds.length
			? client.from("workspaces").select("id,name").in("id", workspaceIds)
			: Promise.resolve({ data: [], error: null }),
	]);
	if (appsResult.error || workspacesResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const appsById = new Map((appsResult.data ?? []).map((app) => [app.client_id, app]));
	const workspacesById = new Map((workspacesResult.data ?? []).map((workspace) => [workspace.id, workspace]));
	const authorizedApps = authorizations.map((authorization) => {
		const app = appsById.get(authorization.client_id);
		const grantedScopes = Array.isArray(authorization.scopes) ? authorization.scopes.map(String) : [];
		const allowedScopes = Array.isArray(app?.allowed_scopes) ? app.allowed_scopes.map(String) : [];
		return {
			authorization_id: authorization.id,
			app_name: app?.name ?? "OAuth application",
			app_description: app?.description ?? null,
			app_logo_url: app?.logo_url ?? null,
			app_homepage_url: app?.homepage_url ?? null,
			scopes: grantedScopes,
			additional_scopes: allowedScopes.filter((scope) => !grantedScopes.includes(scope)),
			team_name: workspacesById.get(authorization.workspace_id)?.name ?? "Unknown workspace",
			authorized_at: authorization.created_at,
			last_used_at: authorization.last_used_at,
		};
	});
	return c.json({ authorizedApps, signedIn: true, userId: user.id }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/authorized-apps/:authorizationId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env).from("oauth_authorizations").select("id,client_id,workspace_id,scopes,created_at,last_used_at").eq("id", c.req.param("authorizationId")).eq("user_id", user.id).maybeSingle();
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!result.data) return c.json({ error: "not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	return c.json({ authorization: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.delete("/authorized-apps/:authorizationId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const result = await getDataClient(c.env).from("oauth_authorizations").update({ revoked_at: new Date().toISOString() }).eq("id", c.req.param("authorizationId")).eq("user_id", user.id);
	if (result.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ success: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/oauth-apps", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({ initialTeamId: null, oauthApps: [], signedIn: false }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	if (!workspaceId) {
		return c.json({ initialTeamId: null, oauthApps: [], signedIn: true }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const { data, error } = await context.client
		.from("oauth_apps_with_stats")
		.select("*")
		.eq("workspace_id", workspaceId)
		.order("created_at", { ascending: false });
	if (error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ initialTeamId: workspaceId, oauthApps: data ?? [], signedIn: true }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/oauth-apps/:clientId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ authorizations: [], currentUserId: null, oauthApp: null, recentRequests: [], signedIn: false, usageStats: [], userDirectory: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const clientId = c.req.param("clientId");
	const client = getDataClient(c.env);
	const appResult = await client.from("oauth_apps_with_stats").select("*").eq("client_id", clientId).maybeSingle();
	if (appResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!appResult.data) return c.json({ authorizations: [], currentUserId: user.id, oauthApp: null, recentRequests: [], signedIn: true, usageStats: [], userDirectory: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = String(appResult.data.workspace_id ?? "").trim();
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
	const [authorizationsResult, usageResult, recentResult, usersResult] = await Promise.all([
		client.from("oauth_authorizations").select("*,users:user_id(user_id,full_name,email),teams:workspaces(id,name)").eq("client_id", clientId).is("revoked_at", null).order("last_used_at", { ascending: false, nullsFirst: false }).limit(10),
		client.from("gateway_requests").select("created_at,success,cost_nanos").eq("oauth_client_id", clientId).eq("auth_method", "oauth").gte("created_at", thirtyDaysAgo.toISOString()).order("created_at", { ascending: true }),
		client.from("gateway_requests").select("request_id,created_at,oauth_user_id,endpoint,model_id,provider,success,status_code,error_code,cost_nanos,latency_ms").eq("oauth_client_id", clientId).eq("auth_method", "oauth").order("created_at", { ascending: false }).limit(250),
		client.from("oauth_authorizations").select("user_id,users:user_id(user_id,full_name,email)").eq("client_id", clientId).order("last_used_at", { ascending: false, nullsFirst: false }),
	]);
	if ([authorizationsResult, usageResult, recentResult, usersResult].some((result) => result.error)) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const userDirectory = new Map<string, { user_id: string; full_name: string | null; email: string | null }>();
	for (const entry of usersResult.data ?? []) {
		const directoryUser = Array.isArray(entry.users) ? entry.users[0] : entry.users;
		const userId = String(entry.user_id ?? directoryUser?.user_id ?? "").trim();
		if (!userId || userDirectory.has(userId)) continue;
		userDirectory.set(userId, { user_id: userId, full_name: typeof directoryUser?.full_name === "string" ? directoryUser.full_name : null, email: typeof directoryUser?.email === "string" ? directoryUser.email : null });
	}
	return c.json({ authorizations: authorizationsResult.data ?? [], currentUserId: user.id, oauthApp: appResult.data, recentRequests: recentResult.data ?? [], signedIn: true, usageStats: usageResult.data ?? [], userDirectory: Array.from(userDirectory.values()) }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/management-api-keys", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		const user = await requireUser(c.req.raw, c.env);
		return c.json({ currentUserId: user?.id, teamsWithKeys: [], workspace: null }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context || !["owner", "admin"].includes(context.role.toLowerCase())) {
		return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	}
	const [workspaceResult, keysResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client.from("management_keys").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
	]);
	if (workspaceResult.error || keysResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const workspace = {
		id: workspaceId,
		name: String(workspaceResult.data?.name ?? "").trim() || "Current Workspace",
	};
	return c.json({
		currentUserId: context.user.id,
		teamsWithKeys: [{ ...workspace, keys: keysResult.data ?? [] }],
		workspace,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/byok", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	const now = new Date();
	const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	const empty = {
		fallbackEnabled: false,
		freeRemaining: 100_000,
		keyEntries: [],
		legacyHiddenTotal: 0,
		monthlyRequestCount: 0,
		nextMonthStartIso: nextMonthStart.toISOString(),
		paidTierRequests: 0,
		workspaceId: null,
	};
	if (!workspaceId) return c.json(empty, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const [keysResult, usageResult, settingsResult] = await Promise.all([
		context.client.from("byok_keys")
			.select("id,provider_id,name,prefix,suffix,created_at,enabled,always_use,routing_mode,sort_order")
			.eq("workspace_id", workspaceId)
			.order("routing_mode", { ascending: true })
			.order("sort_order", { ascending: true })
			.order("created_at", { ascending: true }),
		context.client.from("workspace_byok_monthly_usage")
			.select("month_start,request_count").eq("workspace_id", workspaceId)
			.gte("month_start", monthStart.toISOString()).lt("month_start", nextMonthStart.toISOString())
			.order("month_start", { ascending: false }).limit(1),
		context.client.from("workspace_settings")
			.select("byok_fallback_enabled")
			.eq("workspace_id", workspaceId)
			.maybeSingle(),
	]);
	if (keysResult.error || usageResult.error || settingsResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const keyEntries = (keysResult.data ?? []).map((row) => ({
			id: row.id,
			providerId: row.provider_id,
			name: row.name,
			...(row.prefix ? { prefix: row.prefix } : {}),
			...(row.suffix ? { suffix: row.suffix } : {}),
			createdAt: row.created_at,
			enabled: row.enabled,
			alwaysUse: row.always_use,
			routingMode: row.routing_mode === "priority" ? "priority" : "fallback",
			sortOrder: Number(row.sort_order ?? 0),
		}));
	const monthlyRequestCount = Number(usageResult.data?.[0]?.request_count ?? 0);
	return c.json({
		fallbackEnabled: settingsResult.data?.byok_fallback_enabled === true,
		freeRemaining: Math.max(0, 100_000 - monthlyRequestCount),
		keyEntries,
		legacyHiddenTotal: 0,
		monthlyRequestCount,
		nextMonthStartIso: nextMonthStart.toISOString(),
		paidTierRequests: Math.max(0, monthlyRequestCount - 100_000),
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/keys", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) {
		return c.json({
			currentUserId: undefined,
			initialWorkspaceId: null,
			teamsWithKeys: [],
			workspaces: [],
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const client = getDataClient(c.env);
	const userClient = getAuthenticatedDataClient(c.env, c.req.raw);
	if (!userClient) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const [membershipsResult, ownedResult] = await Promise.all([
		client.from("workspace_members").select("workspace_id").eq("user_id", user.id),
		client.from("workspaces").select("id").eq("owner_user_id", user.id),
	]);
	if (membershipsResult.error || ownedResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const accessibleIds = Array.from(new Set([
		...(membershipsResult.data ?? []).map((row) => String(row.workspace_id ?? "").trim()),
		...(ownedResult.data ?? []).map((row) => String(row.id ?? "").trim()),
	].filter(Boolean)));
	let workspaces: Array<{ id: string; name: string }> = [];
	if (accessibleIds.length) {
		const workspacesResult = await client.from("workspaces").select("id,name").in("id", accessibleIds);
		if (workspacesResult.error) {
			return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		}
		workspaces = (workspacesResult.data ?? [])
			.map((row) => ({ id: String(row.id ?? "").trim(), name: String(row.name ?? "").trim() }))
			.filter((row) => row.id && row.name);
	}
	const requestedWorkspaceId = c.req.query("workspaceId")?.trim();
	const initialWorkspaceId = requestedWorkspaceId && accessibleIds.includes(requestedWorkspaceId)
		? requestedWorkspaceId
		: workspaces[0]?.id ?? null;
	let keys: Array<Record<string, unknown>> = [];
	if (initialWorkspaceId) {
		const dayStart = new Date();
		dayStart.setUTCHours(0, 0, 0, 0);
		const [keysResult, usageResult] = await Promise.all([
			client.from("keys").select("*").eq("workspace_id", initialWorkspaceId)
				.neq("status", "deleted").neq("name", "__chat_route_managed_key__"),
			userClient.rpc("get_workspace_key_usage", {
				p_workspace_id: initialWorkspaceId,
				p_day_start: dayStart.toISOString(),
			}),
		]);
		if (keysResult.error) {
			return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		}
		const usageByKey = new Map<string, Record<string, unknown>>();
		if (!usageResult.error) {
			for (const row of usageResult.data ?? []) {
				const keyId = typeof row.key_id === "string" ? row.key_id : null;
				if (!keyId) continue;
				usageByKey.set(keyId, {
					current_usage_daily: Number(row.daily_request_count ?? 0) || 0,
					current_usage_weekly: Number(row.weekly_request_count ?? 0) || 0,
					current_usage_monthly: Number(row.monthly_request_count ?? 0) || 0,
					current_usage_daily_cost_nanos: Number(row.daily_cost_nanos ?? 0) || 0,
					current_usage_weekly_cost_nanos: Number(row.weekly_cost_nanos ?? 0) || 0,
					current_usage_monthly_cost_nanos: Number(row.monthly_cost_nanos ?? 0) || 0,
					usage_last_used_at: typeof row.last_used_at === "string" ? row.last_used_at : null,
				});
			}
		}
		keys = (keysResult.data as unknown as Array<Record<string, unknown>> ?? []).map((key) => {
			const usage = usageByKey.get(String(key.id ?? "")) ?? {};
			const usageLastUsed = usage.usage_last_used_at;
			const { usage_last_used_at: _ignored, ...usageFields } = usage;
			return {
				...key,
				current_usage_daily: 0,
				current_usage_weekly: 0,
				current_usage_monthly: 0,
				current_usage_daily_cost_nanos: 0,
				current_usage_weekly_cost_nanos: 0,
				current_usage_monthly_cost_nanos: 0,
				...usageFields,
				last_used_at: typeof key.last_used_at === "string" && key.last_used_at
					? key.last_used_at
					: usageLastUsed ?? null,
			};
		});
	}
	const activeWorkspace = workspaces.find((workspace) => workspace.id === initialWorkspaceId);
	return c.json({
		currentUserId: user.id,
		initialWorkspaceId,
		teamsWithKeys: activeWorkspace ? [{ ...activeWorkspace, keys }] : [],
		workspaces,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/credits/onboarding", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	const signerName = user
		? String(user.userMetadata.full_name ?? user.userMetadata.name ?? user.email?.split("@")[0] ?? "Authorized Signer").trim()
		: "Authorized Signer";
	const workspaceId = c.req.query("workspaceId")?.trim();
	const empty = {
		canAccessOnboarding: false,
		canManageBilling: false,
		currentBillingMode: "wallet" as const,
		initialBillingDay: 1,
		initialPaymentTermsDays: 30 as const,
		invoiceProfileEnabled: false,
		signedIn: Boolean(user),
		signerName,
		team: null,
		workspaceId: workspaceId ?? null,
	};
	if (!user || !workspaceId) return c.json(empty, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, profileResult] = await Promise.all([
		context.client.from("workspaces")
			.select("name,tier,billing_mode,invoice_onboarding_status")
			.eq("id", workspaceId).maybeSingle(),
		context.client.from("workspace_invoice_profiles")
			.select("enabled,billing_day,payment_terms_days")
			.eq("workspace_id", workspaceId).maybeSingle(),
	]);
	if (teamResult.error || profileResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	if (!teamResult.data) return c.json(empty, 200, PRIVATE_NO_STORE_HEADERS);
	const billingMode = teamResult.data.billing_mode === "invoice" ? "invoice" : "wallet";
	const onboardingStatus = String(teamResult.data.invoice_onboarding_status ?? "none").toLowerCase();
	return c.json({
		canAccessOnboarding: billingMode === "invoice" || onboardingStatus === "pre_invoice",
		canManageBilling: ["owner", "admin"].includes(context.role.toLowerCase()),
		currentBillingMode: billingMode,
		initialBillingDay: Math.min(28, Math.max(1, Number(profileResult.data?.billing_day ?? 1) || 1)),
		initialPaymentTermsDays: Number(profileResult.data?.payment_terms_days) === 14 ? 14 : 30,
		invoiceProfileEnabled: Boolean(profileResult.data?.enabled),
		signedIn: true,
		signerName,
		team: {
			name: String(teamResult.data.name ?? "Workspace"),
			tier: String(teamResult.data.tier ?? "basic"),
		},
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/credits/transactions", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	const empty = {
		billingMode: "wallet" as const,
		invoices: [],
		isEnterpriseInvoiceMode: false,
		stripeCustomerId: null,
		teamTier: "basic",
		transactions: [],
		workspaceId: workspaceId ?? null,
	};
	if (!workspaceId) return c.json(empty, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const teamResult = await context.client.from("workspaces")
		.select("tier,billing_mode").eq("id", workspaceId).maybeSingle();
	if (teamResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const teamTier = String(teamResult.data?.tier ?? "basic").toLowerCase();
	const billingMode = String(teamResult.data?.billing_mode ?? "wallet").toLowerCase() === "invoice" ? "invoice" : "wallet";
	const isEnterpriseInvoiceMode = teamTier === "enterprise" && billingMode === "invoice";
	if (isEnterpriseInvoiceMode) {
		const invoicesResult = await context.client.from("workspace_invoices")
			.select("id,period_start,period_end,amount_nanos,currency,status,stripe_invoice_id,stripe_invoice_number,due_at,issued_at,paid_at,created_at,updated_at")
			.eq("workspace_id", workspaceId).order("period_end", { ascending: false }).limit(250);
		if (invoicesResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const invoices = (invoicesResult.data ?? []).map((row) => ({
			...row,
			id: String(row.id),
			period_start: String(row.period_start),
			period_end: String(row.period_end),
			amount_nanos: Number(row.amount_nanos ?? 0),
			currency: row.currency ?? "USD",
			status: String(row.status ?? "draft"),
		}));
		return c.json({
			billingMode, invoices, isEnterpriseInvoiceMode, stripeCustomerId: null,
			teamTier, transactions: [], workspaceId,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const [walletResult, transactionsResult] = await Promise.all([
		context.client.from("wallets").select("stripe_customer_id").eq("workspace_id", workspaceId).maybeSingle(),
		context.client.from("credit_ledger")
			.select("id,event_time,kind,amount_nanos,before_balance_nanos,after_balance_nanos,status,ref_type,ref_id,source_ref_type,source_ref_id,created_at")
			.eq("workspace_id", workspaceId).order("event_time", { ascending: false }).limit(250),
	]);
	if (walletResult.error || transactionsResult.error) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const transactions = (transactionsResult.data ?? []).map((row) => ({
		id: row.id,
		amount_nanos: Number(row.amount_nanos ?? 0),
		description: row.kind ?? (row.ref_type ? `${row.ref_type}:${row.ref_id}` : "Purchase"),
		created_at: row.event_time ?? row.created_at ?? null,
		status: row.status ?? null,
		kind: row.kind ?? null,
		ref_type: row.ref_type ?? null,
		ref_id: row.ref_id ?? null,
		source_ref_type: row.source_ref_type ?? null,
		source_ref_id: row.source_ref_id ?? null,
		before_balance_nanos: row.before_balance_nanos == null ? null : Number(row.before_balance_nanos),
		after_balance_nanos: row.after_balance_nanos == null ? null : Number(row.after_balance_nanos),
	}));
	return c.json({
		billingMode, invoices: [], isEnterpriseInvoiceMode,
		stripeCustomerId: walletResult.data?.stripe_customer_id ?? null,
		teamTier, transactions, workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/credits", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({
		initialBalance: 0,
		latestPaymentSuccessAt: null,
		lowBalanceEmailEnabled: false,
		lowBalanceEmailThresholdUsd: null,
		obfuscateInfo: false,
		stripeInfo: {
			customer: { id: null, email: null },
			defaultPaymentMethodId: null,
			hasPaymentMethod: false,
			paymentMethods: [],
		},
		wallet: null,
	}, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [walletResult, initialSettingsResult, latestPaymentResult, userResult] = await Promise.all([
		context.client.from("wallets")
			.select("workspace_id,stripe_customer_id,balance_nanos,reserved_nanos,auto_top_up_enabled,low_balance_threshold,auto_top_up_amount,auto_top_up_account_id")
			.eq("workspace_id", workspaceId).maybeSingle(),
		context.client.from("workspace_settings")
			.select("low_balance_email_enabled,low_balance_email_threshold_nanos")
			.eq("workspace_id", workspaceId).maybeSingle(),
		context.client.from("credit_ledger").select("event_time,status,amount_nanos")
			.eq("workspace_id", workspaceId).eq("ref_type", "Stripe_Payment_Intent")
			.or("status.ilike.paid,status.ilike.succeeded").gt("amount_nanos", 0)
			.order("event_time", { ascending: false }).limit(1).maybeSingle(),
		context.client.from("users").select("obfuscate_info").eq("user_id", context.user.id).maybeSingle(),
	]);
	let settingsResult = initialSettingsResult;
	if (settingsResult.error?.code === "42703") {
		// Low-balance settings were introduced after some existing deployments.
		// Treat their absence as the default disabled state while the schema rolls out.
		settingsResult = await context.client.from("workspace_settings").select().eq("workspace_id", workspaceId).maybeSingle();
	}
	if (walletResult.error || settingsResult.error || latestPaymentResult.error || userResult.error) {
		return c.json({ error: "billing_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const thresholdNanos = Number(settingsResult.data?.low_balance_email_threshold_nanos ?? 0);
	const cookieOverride = c.req.query("obfuscateInfo");
	return c.json({
		initialBalance: Number(walletResult.data?.balance_nanos ?? 0) / 1_000_000_000,
		latestPaymentSuccessAt: latestPaymentResult.data?.event_time ?? null,
		lowBalanceEmailEnabled: Boolean(settingsResult.data?.low_balance_email_enabled),
		lowBalanceEmailThresholdUsd: thresholdNanos > 0 ? Number((thresholdNanos / 1_000_000_000).toFixed(2)) : null,
		obfuscateInfo: cookieOverride === "1" ? true : cookieOverride === "0" ? false : Boolean(userResult.data?.obfuscate_info),
		stripeInfo: {
			customer: { id: null, email: null },
			defaultPaymentMethodId: null,
			hasPaymentMethod: false,
			paymentMethods: [],
		},
		wallet: walletResult.data ?? null,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/payment-methods", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({
		customerId: null,
		initialData: {
			customer: { id: "", email: null },
			defaultPaymentMethodId: null,
			paymentMethods: [],
		},
		obfuscateInfo: false,
	}, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const userResult = await context.client.from("users").select("obfuscate_info").eq("user_id", context.user.id).maybeSingle();
	if (userResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const cookieOverride = c.req.query("obfuscateInfo");
	return c.json({
		customerId: null,
		initialData: {
			customer: { id: "", email: null },
			defaultPaymentMethodId: null,
			paymentMethods: [],
		},
		obfuscateInfo: cookieOverride === "1" ? true : cookieOverride === "0" ? false : Boolean(userResult.data?.obfuscate_info),
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsRouter.get("/observability/destinations/new/:provider", async (c) => {
	const provider = c.req.param("provider");
	if (!OBSERVABILITY_DESTINATIONS.has(provider)) {
		return c.json({ destinationFound: false, keys: [], modelOptions: [], providerOptions: [], teamName: null, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) {
		return c.json({ destinationFound: true, keys: [], modelOptions: [], providerOptions: [], teamName: null, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [teamResult, keysResult, providersResult, providerModelsResult] = await Promise.all([
		context.client.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
		context.client.from("keys").select("id,name,prefix").eq("workspace_id", workspaceId)
			.neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: false }),
		context.client.from("data_api_providers").select("api_provider_id,api_provider_name").order("api_provider_name", { ascending: true }),
		context.client.from("data_api_provider_models").select("provider_id,api_model_id,model_id,is_active_gateway").eq("is_active_gateway", true),
	]);
	if ([teamResult, keysResult, providersResult, providerModelsResult].some((result) => result.error)) {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const modelIds = Array.from(new Set((providerModelsResult.data ?? []).map((row) => String(row.model_id ?? "").trim()).filter(Boolean)));
	const modelsResult = modelIds.length
		? await context.client.from("data_models").select("model_id,name,organisation_id").in("model_id", modelIds)
		: { data: [], error: null };
	if (modelsResult.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const modelsById = new Map((modelsResult.data ?? []).map((row) => [row.model_id, row]));
	const modelOptionsById = new Map<string, { value: string; label: string; logoId: string | null; subtitle: string | null }>();
	for (const row of providerModelsResult.data ?? []) {
		const apiModelId = String(row.api_model_id ?? "").trim();
		if (!apiModelId) continue;
		const model = modelsById.get(row.model_id);
		const label = String(model?.name ?? apiModelId);
		const option = { value: apiModelId, label, logoId: model?.organisation_id ?? null, subtitle: label === apiModelId ? null : apiModelId };
		const existing = modelOptionsById.get(apiModelId);
		if (!existing || existing.label === apiModelId) modelOptionsById.set(apiModelId, option);
	}
	return c.json({
		destinationFound: true,
		keys: (keysResult.data ?? []).map((key) => ({ id: key.id, name: key.name ?? null, prefix: key.prefix ?? null })),
		modelOptions: Array.from(modelOptionsById.values()).sort((left, right) => left.label.localeCompare(right.label)),
		providerOptions: (providersResult.data ?? []).map((item) => ({ value: item.api_provider_id, label: item.api_provider_name ?? item.api_provider_id, logoId: item.api_provider_id })),
		teamName: teamResult.data?.name ?? null,
		workspaceId,
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

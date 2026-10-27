import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { withSessionAuthorization } from "@/auth/sessionCookie";
import { slackAgentMonthlyCharge, slackAgentPlanNanos } from "@/billing/slackAgentPricing";
import { hasReviewedChatPrivacy } from "@/chat/privacyReview";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { autoRoutingAvailable, isAutoRoutingModel } from "@/lib/auto-routing-access";
import { SLACK_AGENT_MANAGED_KEY_NAME } from "@/lib/managed-keys";
import { sendSlackAgentAlert } from "@/lib/slack-agent-alerts";
import {
	SLACK_AGENT_BOT_SCOPES,
	exchangeSlackCode,
	slackAuthorizeUrl,
	uninstallSlackApp,
	type SlackAppCredentials,
	type SlackInstallGrant,
} from "@/lib/slack-api";
import { decryptSlackSecrets, encryptSlackSecrets, signSlackToken, verifySlackToken } from "@/lib/slack-secrets";
import { requireAccountWorkspace, type AccountWorkspaceContext } from "./context";
import { invalidateGatewayKey } from "./gateway-invalidation";
import { generateKey, hmac } from "./settings-keys";
import {
	AUTO_MODEL_ID,
	nanosToUsd,
	parseInstallSettings,
	parseSettingsPatch,
	planProblem,
	usdToNanos,
	type SlackAgentInstallSettings,
} from "./slack-agent-settings";

// The Phaseo Slack agent's settings: installing it into Slack (OAuth v2), its
// limits and behaviour, uninstalling it, a company's own Slack app, and linking
// Slack people to their Phaseo accounts. Only owners and admins change anything;
// any member can see whether the agent is installed and link their own account.
//
// Each installation gets a managed gateway key (hidden from the Keys page) that
// bills model tokens as normal requests. Slack's API terms forbid training on
// Slack data and keeping it: the key's guardrail turns off training and prompt
// publishing (providers that keep logs but don't train may answer), and the key
// itself stores no content (never_store_content). Bot tokens, the gateway key
// and custom app secrets are stored encrypted and never returned.
//
// The OAuth redirect is https://phaseo.app/api/account/settings/slack/oauth/callback
// (PHASEO_WEB_ORIGIN changes the origin). In production that path goes straight
// to this Worker through its phaseo.app/api/account/* route, so it is the one
// stable public URL to register with Slack, for the hosted app and for a
// company's own app alike. The browser arrives without the bearer token the web
// app normally adds, so the callback reads the Supabase session cookie it does
// carry and requires that user to be the one who started the install (the user
// in the signed state). That binding is the CSRF protection: a link to Slack's
// consent page started by someone else fails for anyone but them.

const INSTALL_STATE_TTL_SECONDS = 10 * 60;
const CALLBACK_PATH = "/api/account/settings/slack/oauth/callback";
const SETTINGS_PATH = "/settings/slack";
const DEFAULT_WEB_ORIGIN = "https://phaseo.app";
const GUARDRAIL_NAME = "Slack agent";
const GUARDRAIL_DESCRIPTION = "Managed by the Slack agent. Slack's API terms do not allow training on Slack data, so training and prompt publishing are off.";
const CHARGE_HISTORY_MONTHS = 6;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLACK_USER_PATTERN = /^[UW][A-Z0-9]{2,31}$/;
const SLACK_APP_ID_PATTERN = /^A[A-Z0-9]{2,31}$/;
const SLACK_CLIENT_ID_PATTERN = /^[0-9]{1,30}\.[0-9]{1,30}$/;
const SLACK_APP_SECRET_PATTERN = /^[A-Za-z0-9]{16,128}$/;
const OAUTH_CODE_PATTERN = /^[A-Za-z0-9._-]{1,512}$/;

const INSTALLATION_COLUMNS = [
	"id", "workspace_id", "slack_app_id", "team_id", "team_name", "enterprise_id", "bot_user_id", "key_id", "guardrail_id",
	"model", "model_choice_enabled", "allowed_models", "instructions", "access_mode", "usage_data_mode", "usage_data_channel_ids",
	"plan_people", "over_plan", "max_people", "monthly_cap_nanos", "answers_per_person_hour", "allow_guests", "allow_external_users", "status",
	"installed_by", "installed_at", "uninstalled_at", "updated_at",
].join(",");
const CUSTOM_APP_COLUMNS = "id,slack_app_id,client_id,created_at,updated_at";

type Body = Record<string, unknown>;
type DataClient = ReturnType<typeof getDataClient>;

type InstallationRow = {
	id: string;
	workspace_id: string;
	slack_app_id: string | null;
	team_id: string | null;
	team_name: string | null;
	enterprise_id: string | null;
	bot_user_id: string;
	key_id: string | null;
	guardrail_id: string | null;
	model: string;
	model_choice_enabled: boolean;
	allowed_models: string[] | null;
	instructions: string | null;
	access_mode: string;
	usage_data_mode: string;
	usage_data_channel_ids: string[] | null;
	plan_people: number;
	over_plan: string;
	max_people: number | null;
	monthly_cap_nanos: number | string;
	answers_per_person_hour: number;
	allow_guests: boolean;
	allow_external_users: boolean;
	status: string;
	installed_by: string | null;
	installed_at: string;
	uninstalled_at: string | null;
	updated_at: string;
	secrets_ciphertext?: string;
};

type CustomAppRow = { id: string; slack_app_id: string; client_id: string; created_at: string; updated_at: string };

type InstallState = { workspace_id: string; user_id: string; settings: Body };

function json(c: any, body: unknown, status = 200) {
	return c.json(body, status, PRIVATE_NO_STORE_HEADERS);
}

function badRequest(c: any, message: string, code = "bad_request") {
	return json(c, { error: code, message }, 400);
}

async function readBody(c: any): Promise<Body> {
	const body = await c.req.json().catch(() => null);
	return body && typeof body === "object" && !Array.isArray(body) ? body as Body : {};
}

function isManager(context: AccountWorkspaceContext): boolean {
	return context.isOwner || ["owner", "admin"].includes(context.role.toLowerCase());
}

async function managerContext(c: any, workspaceId: unknown) {
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(workspaceId ?? "") });
	if (!context) return { response: json(c, { error: "forbidden" }, 403) } as const;
	if (!isManager(context)) return { response: json(c, { error: "forbidden", message: "Only workspace owners and admins can manage the Slack agent" }, 403) } as const;
	return { context } as const;
}

function withoutWorkspaceId(body: Body): Body {
	const { workspaceId: _workspaceId, ...rest } = body;
	return rest;
}

function requestId(c: any): string | null {
	return c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? null;
}

/** The first day of the current UTC month (the period key of the usage and charge tables). */
export function currentPeriodStart(now = new Date()): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function slackWebOrigin(env: Env): string {
	const configured = env.PHASEO_WEB_ORIGIN?.trim();
	if (configured) {
		try {
			const url = new URL(configured);
			if (url.protocol === "https:" || (env.ENV !== "production" && url.protocol === "http:")) return url.origin;
		} catch {}
	}
	return DEFAULT_WEB_ORIGIN;
}

export function slackRedirectUri(env: Env): string {
	return `${slackWebOrigin(env)}${CALLBACK_PATH}`;
}

/** Signing, encryption and key hashing are needed for any installation, hosted or a company's own app. */
function slackCoreConfigured(env: Env): boolean {
	return Boolean(env.SLACK_STATE_SECRET?.trim() && env.SLACK_SECRETS_ENCRYPTION_KEY?.trim() && env.KEY_PEPPER_ACTIVE?.trim());
}

function hostedCredentials(env: Env): SlackAppCredentials | null {
	const clientId = env.SLACK_CLIENT_ID?.trim();
	const clientSecret = env.SLACK_CLIENT_SECRET?.trim();
	return clientId && clientSecret ? { clientId, clientSecret, slackAppId: null } : null;
}

function notConfigured(c: any) {
	return json(c, { error: "slack_not_configured", message: "The Slack agent is not available yet" }, 503);
}

/** A company's own Slack app, with its client secret decrypted. Null if it is not this workspace's. */
async function customAppCredentials(env: Env, client: DataClient, workspaceId: string, appRowId: string): Promise<SlackAppCredentials | null> {
	const result = await client.from("slack_apps").select("id,slack_app_id,client_id,secrets_ciphertext")
		.eq("id", appRowId).eq("workspace_id", workspaceId).maybeSingle();
	if (result.error) throw new Error("slack_app_lookup_failed");
	if (!result.data) return null;
	const secrets = await decryptSlackSecrets(env, String(result.data.secrets_ciphertext ?? ""));
	if (!secrets.client_secret) throw new Error("slack_app_secret_missing");
	return { clientId: String(result.data.client_id), clientSecret: secrets.client_secret, slackAppId: String(result.data.slack_app_id) };
}

async function liveInstallation(client: DataClient, workspaceId: string, columns = INSTALLATION_COLUMNS) {
	const result = await client.from("slack_installations").select(columns)
		.eq("workspace_id", workspaceId).neq("status", "uninstalled").limit(1).maybeSingle();
	return { error: result.error, row: (result.data ?? null) as unknown as InstallationRow | null };
}

async function loadKeyMonthlyLimit(client: DataClient, workspaceId: string, keyId: string | null): Promise<number> {
	if (!keyId) return 0;
	const result = await client.from("keys").select("monthly_limit_cost_nanos").eq("id", keyId).eq("workspace_id", workspaceId).maybeSingle();
	if (result.error) throw new Error("key_lookup_failed");
	return Number(result.data?.monthly_limit_cost_nanos ?? 0) || 0;
}

type ModelSpend = { requests: number; cost_usd: number };

/**
 * What each installation spent on models through its managed key in the given UTC
 * months, summed in the database, keyed by installation and month. These are normal
 * requests billed from credits, not part of the agent's charge. Null if it can't be
 * read, so the rest of the page still loads.
 */
async function loadModelSpend(client: DataClient, workspaceId: string, periods: string[]): Promise<Map<string, ModelSpend> | null> {
	const unique = [...new Set(periods)];
	if (!unique.length) return new Map();
	const result = await client.rpc("get_slack_agent_model_spend", { p_workspace_id: workspaceId, p_periods: unique });
	if (result.error) {
		console.error("[slack-agent] model spend unavailable", { workspaceId, code: result.error.code });
		return null;
	}
	return new Map((Array.isArray(result.data) ? result.data : []).map((row: any) => [
		`${row.installation_id}:${row.period_start}`,
		{ requests: Number(row.requests) || 0, cost_usd: nanosToUsd(row.cost_nanos) },
	]));
}

/** A month without spend has no row, so it is zero; null only when the spend couldn't be read. */
function modelSpendFor(spend: Map<string, ModelSpend> | null, installationId: string, periodStart: string): ModelSpend | null {
	return spend ? spend.get(`${installationId}:${periodStart}`) ?? { requests: 0, cost_usd: 0 } : null;
}

/**
 * Whether the agent may answer with Auto (phaseo/auto). The gateway decides it
 * for the user who created the calling key (the workspace owner if none), so an
 * installed agent is checked for its key, and a new install for the admin
 * installing it, who becomes the key's creator.
 */
async function agentAutoRouting(env: Env, context: AccountWorkspaceContext, installation: Pick<InstallationRow, "key_id"> | null): Promise<boolean> {
	const { client, workspaceId } = context;
	if (!installation?.key_id) return autoRoutingAvailable(env, { workspaceId, userId: context.user.id });
	const key = await client.from("keys").select("created_by,kid").eq("id", installation.key_id).eq("workspace_id", workspaceId).maybeSingle();
	if (key.error || !key.data) return false;
	let userId = key.data.created_by ? String(key.data.created_by) : null;
	if (!userId) {
		const workspace = await client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
		userId = workspace.data?.owner_user_id ? String(workspace.data.owner_user_id) : null;
	}
	if (!userId) return false;
	return autoRoutingAvailable(env, { workspaceId, userId, key: { id: installation.key_id, kid: key.data.kid ? String(key.data.kid) : null } });
}

function autoRoutingUnavailable(c: any) {
	return json(c, { error: "auto_routing_unavailable", message: "Auto isn't available to this workspace. Choose a specific model" }, 400);
}

/**
 * The allowed models that aren't public catalogue models (not in v2_models, hidden
 * or disabled). Auto isn't a catalogue model; it is checked on its own. Null if the
 * catalogue can't be read.
 */
async function unknownModels(client: DataClient, ids: string[]): Promise<string[] | null> {
	const wanted = ids.filter((id) => id !== AUTO_MODEL_ID);
	if (!wanted.length) return [];
	const result = await client.from("v2_models").select("model_slug").in("model_slug", wanted).eq("hidden", false).neq("status", "disabled");
	if (result.error) return null;
	const known = new Set((result.data ?? []).map((row: any) => String(row.model_slug)));
	return wanted.filter((id) => !known.has(id));
}

function settingsView(row: InstallationRow, keyLimitNanos: number) {
	return {
		plan_people: row.plan_people,
		over_plan: row.over_plan,
		max_people: row.max_people,
		monthly_cap_usd: nanosToUsd(row.monthly_cap_nanos),
		answers_per_person_hour: row.answers_per_person_hour,
		model: row.model,
		model_choice_enabled: row.model_choice_enabled,
		allowed_models: row.allowed_models ?? [],
		instructions: row.instructions,
		access_mode: row.access_mode,
		usage_data_mode: row.usage_data_mode,
		usage_data_channel_ids: row.usage_data_channel_ids ?? [],
		allow_guests: row.allow_guests,
		allow_external_users: row.allow_external_users,
		token_monthly_limit_usd: nanosToUsd(keyLimitNanos),
	};
}

function installationView(row: InstallationRow, keyLimitNanos: number) {
	return {
		id: row.id,
		team_id: row.team_id,
		team_name: row.team_name,
		enterprise_id: row.enterprise_id,
		bot_user_id: row.bot_user_id,
		status: row.status,
		installed_at: row.installed_at,
		uses_custom_app: Boolean(row.slack_app_id),
		settings: settingsView(row, keyLimitNanos),
		plan: { people: row.plan_people, price_usd: nanosToUsd(slackAgentPlanNanos(row.plan_people)) },
	};
}

function customAppView(row: CustomAppRow | null) {
	return row ? { id: row.id, slack_app_id: row.slack_app_id, client_id: row.client_id, created_at: row.created_at, updated_at: row.updated_at } : null;
}

async function auditSlack(c: any, context: AccountWorkspaceContext, action: string, target: { id: string; name?: string | null; type?: string }, metadata: Record<string, unknown>) {
	await recordWorkspaceAuditEvent(context.client as never, {
		workspaceId: context.workspaceId,
		actorUserId: context.user.id,
		action: `slack_agent.${action}`,
		targetType: target.type ?? "slack_installation",
		targetId: target.id,
		targetName: target.name ?? null,
		metadata,
		requestId: requestId(c),
	});
}

async function invalidateKeyQuietly(env: Env, keyId: string): Promise<void> {
	try {
		await invalidateGatewayKey(env, keyId);
	} catch {
		console.error("[slack-agent] gateway key invalidation failed", { keyId });
	}
}

export const accountSettingsSlackRouter = new Hono<{ Bindings: Env }>();

accountSettingsSlackRouter.get("/slack", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return badRequest(c, "workspaceId is required");
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return json(c, { error: "forbidden" }, 403);
	const live = await liveInstallation(context.client, workspaceId);
	if (live.error) return json(c, { error: "settings_unavailable" }, 503);
	const installation = live.row;

	// Members see whether the agent is here, not how it is set up or what it costs.
	if (!isManager(context)) {
		return json(c, {
			workspaceId,
			canManage: false,
			installed: Boolean(installation),
			installation: installation
				? { team_name: installation.team_name, status: installation.status, installed_at: installation.installed_at }
				: null,
		});
	}

	const periodStart = currentPeriodStart();
	// One row per installation and month; the workspace index serves this. A promise, so
	// the model spend can wait on it without the query builder sending it twice.
	const chargesRead = Promise.resolve(context.client.from("slack_agent_charges").select("installation_id,period_start,people,answers,amount_nanos,status,charged_at")
		.eq("workspace_id", workspaceId).order("period_start", { ascending: false }).limit(CHARGE_HISTORY_MONTHS));
	const [customApp, charges, usage, keyLimit, modelSpend, autoRouting] = await Promise.all([
		context.client.from("slack_apps").select(CUSTOM_APP_COLUMNS).eq("workspace_id", workspaceId)
			.order("created_at", { ascending: true }).limit(1).maybeSingle(),
		chargesRead,
		// Counted and summed in the database, never row by row here.
		installation
			? context.client.rpc("get_slack_agent_month_usage", { p_installation_id: installation.id, p_period_start: periodStart })
			: Promise.resolve({ data: [], error: null }),
		installation ? loadKeyMonthlyLimit(context.client, workspaceId, installation.key_id).then((value) => ({ value, error: null }), (error) => ({ value: 0, error })) : Promise.resolve({ value: 0, error: null }),
		chargesRead.then((result) => loadModelSpend(context.client, workspaceId, [
			...(installation ? [periodStart] : []),
			...(result.data ?? []).map((row: any) => String(row.period_start)),
		])),
		agentAutoRouting(c.env, context, installation).catch(() => false),
	]);
	if (customApp.error || charges.error || usage.error || keyLimit.error) return json(c, { error: "settings_unavailable" }, 503);
	const usageRow = (Array.isArray(usage.data) ? usage.data[0] : usage.data) as { people?: unknown; answers?: unknown } | null | undefined;
	const people = Number(usageRow?.people ?? 0) || 0;
	const answers = Number(usageRow?.answers ?? 0) || 0;
	const estimate = installation
		? slackAgentMonthlyCharge({ people, answers, capNanos: Number(installation.monthly_cap_nanos) })
		: null;
	const monthSpend = installation ? modelSpendFor(modelSpend, installation.id, periodStart) : null;

	return json(c, {
		workspaceId,
		canManage: true,
		configured: { hosted_app: slackCoreConfigured(c.env) && hostedCredentials(c.env) !== null, custom_app: slackCoreConfigured(c.env) },
		redirect_url: slackRedirectUri(c.env),
		scopes: SLACK_AGENT_BOT_SCOPES,
		// Whether the model picker offers Auto: the gateway refuses phaseo/auto without access.
		auto_routing: autoRouting,
		installed: Boolean(installation),
		installation: installation
			? {
				...installationView(installation, keyLimit.value),
				month: {
					period_start: periodStart,
					people,
					answers,
					estimated_charge_usd: nanosToUsd(estimate?.chargeNanos ?? 0),
					model_spend_usd: monthSpend?.cost_usd ?? null,
					model_requests: monthSpend?.requests ?? null,
				},
			}
			: null,
		custom_app: customAppView(customApp.data as CustomAppRow | null),
		charges: (charges.data ?? []).map((row: any) => ({
			period_start: String(row.period_start),
			people: Number(row.people) || 0,
			answers: Number(row.answers) || 0,
			amount_usd: nanosToUsd(row.amount_nanos),
			model_spend_usd: modelSpendFor(modelSpend, String(row.installation_id), String(row.period_start))?.cost_usd ?? null,
			status: String(row.status),
			charged_at: row.charged_at ?? null,
		})),
	});
});

accountSettingsSlackRouter.post("/slack/install", bodyLimit({ maxSize: 8 * 1024 }), async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const parsed = parseInstallSettings(withoutWorkspaceId(body));
	if (parsed.ok === false) return badRequest(c, parsed.message);
	const { context } = access;
	// The agent sends Slack conversations through the gateway, so the installer must
	// have reviewed the workspace's privacy settings, as Chat requires.
	if (!hasReviewedChatPrivacy(context.user.appMetadata, context.workspaceId)) {
		return json(c, { error: "chat_privacy_review_required", message: "Review your workspace privacy settings before installing the Slack agent" }, 403);
	}
	if (!slackCoreConfigured(c.env)) return notConfigured(c);
	let clientId: string;
	if (parsed.value.slack_app_id) {
		const app = await context.client.from("slack_apps").select("id,client_id")
			.eq("id", parsed.value.slack_app_id).eq("workspace_id", context.workspaceId).maybeSingle();
		if (app.error) return json(c, { error: "settings_unavailable" }, 503);
		if (!app.data) return json(c, { error: "slack_app_not_found", message: "Save your Slack app first" }, 404);
		clientId = String(app.data.client_id);
	} else {
		const hosted = hostedCredentials(c.env);
		if (!hosted) return notConfigured(c);
		clientId = hosted.clientId;
	}
	const live = await liveInstallation(context.client, context.workspaceId, "id");
	if (live.error) return json(c, { error: "settings_unavailable" }, 503);
	if (live.row) return json(c, { error: "already_installed", message: "The Slack agent is already installed in this workspace" }, 409);
	if (isAutoRoutingModel(parsed.value.model) && !(await agentAutoRouting(c.env, context, null))) return autoRoutingUnavailable(c);
	const state = await signSlackToken(c.env, "install", {
		workspace_id: context.workspaceId,
		user_id: context.user.id,
		settings: parsed.value,
	} satisfies InstallState, INSTALL_STATE_TTL_SECONDS);
	return json(c, { url: slackAuthorizeUrl({ clientId, redirectUri: slackRedirectUri(c.env), state }) });
});

function redirectToSettings(c: any, params: Record<string, string>): Response {
	const url = new URL(SETTINGS_PATH, slackWebOrigin(c.env));
	for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
	return new Response(null, {
		status: 302,
		headers: { Location: url.toString(), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
	});
}

type CreateResult = { ok: true; installationId: string } | { ok: false; error: string };

/**
 * Creates the managed key, its guardrail and the installation. Anything created
 * before a failing step is removed again, so a failed install leaves nothing behind.
 */
async function createInstallation(env: Env, context: AccountWorkspaceContext, settings: SlackAgentInstallSettings, grant: SlackInstallGrant): Promise<CreateResult> {
	const { client, workspaceId } = context;
	const created: { keyId?: string; guardrailId?: string } = {};
	const cleanup = async () => {
		// Deleting the guardrail removes its key link too (cascade).
		if (created.guardrailId) {
			const removed = await client.from("workspace_guardrails").delete().eq("id", created.guardrailId).eq("workspace_id", workspaceId);
			if (removed.error) console.error("[slack-agent] install cleanup: guardrail not removed", { guardrailId: created.guardrailId });
		}
		if (created.keyId) {
			const removed = await client.from("keys").delete().eq("id", created.keyId).eq("workspace_id", workspaceId);
			if (removed.error) console.error("[slack-agent] install cleanup: key not removed", { keyId: created.keyId });
		}
	};
	try {
		const key = generateKey("sk");
		const insertedKey = await client.from("keys").insert({
			workspace_id: workspaceId,
			name: SLACK_AGENT_MANAGED_KEY_NAME,
			kid: key.kid,
			hash: await hmac(env, key.secret),
			prefix: key.prefix,
			status: "active",
			scopes: "[]",
			created_by: context.user.id,
			daily_limit_requests: 0,
			weekly_limit_requests: 0,
			monthly_limit_requests: 0,
			daily_limit_cost_nanos: 0,
			weekly_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: usdToNanos(settings.token_monthly_limit_usd),
			// Slack's terms forbid keeping Slack messages: the gateway keeps no I/O log,
			// cache or telemetry content for this key, whatever the workspace settings.
			never_store_content: true,
		}).select("id").maybeSingle();
		if (insertedKey.error || !insertedKey.data?.id) throw new Error("install_failed");
		created.keyId = String(insertedKey.data.id);

		const guardrail = await client.from("workspace_guardrails").insert({
			workspace_id: workspaceId,
			name: GUARDRAIL_NAME,
			description: GUARDRAIL_DESCRIPTION,
			enabled: true,
			privacy_enable_paid_may_train: false,
			privacy_enable_free_may_train: false,
			privacy_enable_free_may_publish_prompts: false,
			// Providers that keep logs but don't train may answer; without them most models
			// have no route. Phaseo's own storage is the key's never_store_content, not this.
			privacy_enable_input_output_logging: true,
			updated_at: new Date().toISOString(),
		}).select("id").maybeSingle();
		if (guardrail.error || !guardrail.data?.id) throw new Error("install_failed");
		created.guardrailId = String(guardrail.data.id);

		const link = await client.from("key_guardrails").insert({ key_id: created.keyId, guardrail_id: created.guardrailId });
		if (link.error) throw new Error("install_failed");

		const secrets: Record<string, string> = { bot_token: grant.botToken, gateway_key: key.plaintext };
		if (grant.refreshToken) {
			secrets.bot_refresh_token = grant.refreshToken;
			if (grant.expiresInSeconds) secrets.bot_token_expires_at = new Date(Date.now() + grant.expiresInSeconds * 1000).toISOString();
		}
		const installation = await client.from("slack_installations").insert({
			workspace_id: workspaceId,
			slack_app_id: settings.slack_app_id,
			team_id: grant.teamId,
			team_name: grant.teamName,
			enterprise_id: grant.enterpriseId,
			bot_user_id: grant.botUserId,
			secrets_ciphertext: await encryptSlackSecrets(env, secrets),
			key_id: created.keyId,
			guardrail_id: created.guardrailId,
			model: settings.model,
			access_mode: settings.access_mode,
			usage_data_mode: settings.usage_data_mode,
			plan_people: settings.plan_people,
			over_plan: settings.over_plan,
			max_people: settings.max_people,
			monthly_cap_nanos: usdToNanos(settings.monthly_cap_usd),
			answers_per_person_hour: settings.answers_per_person_hour,
			allow_guests: settings.allow_guests,
			allow_external_users: settings.allow_external_users,
			installed_by: context.user.id,
		}).select("id").maybeSingle();
		if (installation.error) {
			const message = String(installation.error.message ?? "");
			if (installation.error.code === "23505") {
				throw new Error(message.includes("live_team") ? "slack_team_in_use" : "already_installed");
			}
			throw new Error("install_failed");
		}
		if (!installation.data?.id) throw new Error("install_failed");
		return { ok: true, installationId: String(installation.data.id) };
	} catch (error) {
		await cleanup().catch(() => undefined);
		const code = error instanceof Error && ["slack_team_in_use", "already_installed"].includes(error.message) ? error.message : "install_failed";
		return { ok: false, error: code };
	}
}

/** Live installations of the same Slack team (or org-wide install), in any Phaseo workspace and through any app. */
async function liveTeamInstallations(client: DataClient, grant: SlackInstallGrant) {
	let query = client.from("slack_installations").select("id,workspace_id").neq("status", "uninstalled");
	query = grant.teamId ? query.eq("team_id", grant.teamId) : query.is("team_id", null).eq("enterprise_id", grant.enterpriseId);
	return query.limit(5);
}

accountSettingsSlackRouter.get("/slack/oauth/callback", async (c) => {
	const env = c.env;
	const fail = (error: string) => redirectToSettings(c, { error });
	const slackError = c.req.query("error");
	if (slackError) return fail(slackError === "access_denied" ? "slack_denied" : "slack_error");

	const verified = await verifySlackToken<InstallState>(env, "install", c.req.query("state"));
	if (verified.ok === false) {
		return fail(verified.reason === "expired" ? "state_expired" : verified.reason === "unconfigured" ? "slack_not_configured" : "state_invalid");
	}
	const state = verified.payload;
	if (typeof state.workspace_id !== "string" || typeof state.user_id !== "string" || !state.settings || typeof state.settings !== "object") {
		return fail("state_invalid");
	}
	const parsed = parseInstallSettings(state.settings);
	if (parsed.ok === false) return fail("state_invalid");
	const settings = parsed.value;
	const code = c.req.query("code") ?? "";
	if (!OAUTH_CODE_PATTERN.test(code)) return fail("slack_code_missing");

	// Bind the callback to the browser's signed-in user: it must be the admin who
	// started this install. Its session arrives as the Supabase cookie (see above).
	const authRequest = withSessionAuthorization(c.req.raw, env);
	if (!authRequest) return fail("sign_in_required");
	const context = await requireAccountWorkspace({ request: authRequest, env, workspaceId: state.workspace_id });
	if (!context) return fail("sign_in_required");
	if (context.user.id !== state.user_id) return fail("session_mismatch");
	if (!isManager(context)) return fail("forbidden");
	if (!hasReviewedChatPrivacy(context.user.appMetadata, context.workspaceId)) return fail("chat_privacy_review_required");
	if (!slackCoreConfigured(env)) return fail("slack_not_configured");

	// A reload of this page, or a second install started in another tab, must not
	// use the code again or create a second installation.
	const live = await liveInstallation(context.client, context.workspaceId, "id");
	if (live.error) return fail("install_failed");
	if (live.row) return fail("already_installed");

	let credentials: SlackAppCredentials | null;
	try {
		credentials = settings.slack_app_id
			? await customAppCredentials(env, context.client, context.workspaceId, settings.slack_app_id)
			: hostedCredentials(env);
	} catch {
		return fail("slack_app_unavailable");
	}
	if (!credentials) return fail(settings.slack_app_id ? "slack_app_not_found" : "slack_not_configured");

	const exchanged = await exchangeSlackCode({ credentials, code, redirectUri: slackRedirectUri(env) });
	if (exchanged.ok === false) return fail(exchanged.error);
	const grant = exchanged.grant;
	// A company's own app must be the app Slack installed.
	if (credentials.slackAppId && grant.appId !== credentials.slackAppId) return fail("slack_response_invalid");

	// One Slack team belongs to one Phaseo workspace. The token Slack just issued is
	// not revoked here: it can be the same bot token the other installation uses.
	const team = await liveTeamInstallations(context.client, grant);
	if (team.error) return fail("install_failed");
	if ((team.data ?? []).some((row: any) => String(row.workspace_id) !== context.workspaceId)) return fail("slack_team_in_use");
	if ((team.data ?? []).length) return fail("already_installed");

	const created = await createInstallation(env, context, settings, grant);
	if (created.ok === false) return fail(created.error);
	await auditSlack(c, context, "installed", { id: created.installationId, name: grant.teamName }, {
		team_id: grant.teamId,
		enterprise_id: grant.enterpriseId,
		custom_app: Boolean(settings.slack_app_id),
		plan_people: settings.plan_people,
		over_plan: settings.over_plan,
		max_people: settings.max_people,
		monthly_cap_usd: settings.monthly_cap_usd,
		key_monthly_limit_usd: settings.token_monthly_limit_usd,
		answers_per_person_hour: settings.answers_per_person_hour,
		allow_guests: settings.allow_guests,
		allow_external_users: settings.allow_external_users,
		model: settings.model,
		access_mode: settings.access_mode,
		usage_data_mode: settings.usage_data_mode,
	});
	c.executionCtx.waitUntil(sendSlackAgentAlert(env, {
		event: "installed",
		workspaceId: context.workspaceId,
		workspaceName: context.workspaceName,
		teamName: grant.teamName,
		customApp: Boolean(settings.slack_app_id),
		actor: { id: context.user.id, email: context.user.email },
	}));
	return redirectToSettings(c, { installed: "1", workspaceId: context.workspaceId });
});

accountSettingsSlackRouter.patch("/slack", bodyLimit({ maxSize: 128 * 1024 }), async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const parsed = parseSettingsPatch(body);
	if (parsed.ok === false) return badRequest(c, parsed.message, parsed.code);
	const { update, keyMonthlyLimitNanos, status, changedFields } = parsed.value;
	const { context } = access;
	const live = await liveInstallation(context.client, context.workspaceId);
	if (live.error) return json(c, { error: "settings_unavailable" }, 503);
	const current = live.row;
	if (!current) return json(c, { error: "not_installed", message: "The Slack agent is not installed in this workspace" }, 404);
	// payment_due is cleared only by paying; pausing or resuming must not get around it.
	if (status !== undefined && current.status === "payment_due") {
		return json(c, { error: "payment_due", message: "Answers resume once last month's Slack agent charge is paid" }, 409);
	}
	// The month-end charge leaves a paused installation paused when credits are short,
	// so resuming checks for an unpaid month itself.
	if (status === "active" && current.status !== "active") {
		const unpaid = await context.client.from("slack_agent_charges").select("period_start")
			.eq("installation_id", current.id).eq("status", "pending").limit(1).maybeSingle();
		if (unpaid.error) return json(c, { error: "settings_unavailable" }, 503);
		if (unpaid.data) return json(c, { error: "payment_due", message: "Answers resume once last month's Slack agent charge is paid" }, 409);
	}
	const problem = planProblem({
		plan_people: update.plan_people ?? current.plan_people,
		max_people: "max_people" in update ? update.max_people ?? null : current.max_people,
		monthly_cap_nanos: update.monthly_cap_nanos ?? Number(current.monthly_cap_nanos),
	});
	if (problem) return badRequest(c, problem);
	// Switching to Auto needs access to it; an agent already on Auto is left as it is.
	if (update.model !== undefined && isAutoRoutingModel(update.model) && !isAutoRoutingModel(current.model)
		&& !(await agentAutoRouting(c.env, context, current))) {
		return autoRoutingUnavailable(c);
	}
	// Model choice: switched on needs a model to choose, and each one must be a catalogue model.
	const allowedModels = update.allowed_models ?? current.allowed_models ?? [];
	if ((update.model_choice_enabled ?? current.model_choice_enabled) && !allowedModels.length) {
		return badRequest(c, "Choose at least one model people can choose, or turn model choice off", "model_choice_needs_models");
	}
	if (update.allowed_models !== undefined) {
		const unknown = await unknownModels(context.client, update.allowed_models);
		if (unknown === null) return json(c, { error: "settings_unavailable" }, 503);
		if (unknown.length) {
			return json(c, { error: "unknown_models", message: `These aren't models in the Phaseo catalogue: ${unknown.join(", ")}`, models: unknown }, 400);
		}
		// Like the model: adding Auto needs access to it; an allowlist that already has it keeps it.
		if (update.allowed_models.includes(AUTO_MODEL_ID) && !(current.allowed_models ?? []).includes(AUTO_MODEL_ID)
			&& !(await agentAutoRouting(c.env, context, current))) {
			return autoRoutingUnavailable(c);
		}
	}

	let keyLimit: number;
	if (keyMonthlyLimitNanos !== undefined) {
		if (!current.key_id) return json(c, { error: "key_missing", message: "Reinstall the Slack agent to restore its key" }, 409);
		const keyUpdate = await context.client.from("keys").update({ monthly_limit_cost_nanos: keyMonthlyLimitNanos })
			.eq("id", current.key_id).eq("workspace_id", context.workspaceId).neq("status", "deleted").select("id").maybeSingle();
		if (keyUpdate.error || !keyUpdate.data) return json(c, { error: "key_write_failed" }, 503);
		c.executionCtx.waitUntil(invalidateKeyQuietly(c.env, current.key_id));
		keyLimit = keyMonthlyLimitNanos;
	} else {
		try {
			keyLimit = await loadKeyMonthlyLimit(context.client, context.workspaceId, current.key_id);
		} catch {
			return json(c, { error: "settings_unavailable" }, 503);
		}
	}

	let row = current;
	const rowUpdate: Record<string, unknown> = { ...update, ...(status ? { status } : {}) };
	if (Object.keys(rowUpdate).length) {
		const base = context.client.from("slack_installations").update(rowUpdate).eq("id", current.id).eq("workspace_id", context.workspaceId);
		// A status change only applies while active or paused, so it can't overwrite a
		// payment_due set by the month-end charge in the meantime.
		const result = await (status ? base.in("status", ["active", "paused"]) : base.neq("status", "uninstalled"))
			.select(INSTALLATION_COLUMNS).maybeSingle();
		if (result.error) {
			return result.error.code === "23514" ? badRequest(c, "The settings are not valid") : json(c, { error: "settings_write_failed" }, 503);
		}
		if (!result.data) return json(c, { error: "conflict", message: "The Slack agent changed meanwhile. Reload and try again" }, 409);
		row = result.data as unknown as InstallationRow;
	}
	await auditSlack(c, context, "updated", { id: current.id, name: current.team_name }, {
		changed_fields: changedFields,
		...(status ? { status } : {}),
	});
	return json(c, { installation: installationView(row, keyLimit) });
});

accountSettingsSlackRouter.delete("/slack", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const live = await liveInstallation(context.client, context.workspaceId, `${INSTALLATION_COLUMNS},secrets_ciphertext`);
	if (live.error) return json(c, { error: "settings_unavailable" }, 503);
	const current = live.row;
	if (!current) return json(c, { error: "not_installed", message: "The Slack agent is not installed in this workspace" }, 404);

	// Best effort: remove the app from Slack, with the credentials of the app that was installed.
	let slackUninstalled = false;
	try {
		const secrets = await decryptSlackSecrets(c.env, String(current.secrets_ciphertext ?? ""));
		const credentials = current.slack_app_id
			? await customAppCredentials(c.env, context.client, context.workspaceId, current.slack_app_id)
			: hostedCredentials(c.env);
		if (credentials && secrets.bot_token) slackUninstalled = await uninstallSlackApp({ credentials, botToken: secrets.bot_token });
	} catch {
		slackUninstalled = false;
	}

	const now = new Date().toISOString();
	if (current.key_id) {
		// The same as deleting a key on the Keys page: it can never authenticate again.
		const disabled = await context.client.from("keys")
			.update({ status: "deleted", soft_blocked: true, expires_at: now, hash: `deleted:${current.key_id}` })
			.eq("id", current.key_id).eq("workspace_id", context.workspaceId);
		if (disabled.error) return json(c, { error: "key_write_failed" }, 503);
		c.executionCtx.waitUntil(invalidateKeyQuietly(c.env, current.key_id));
	}
	// The row stays for billing history (its months and charges reference it).
	const result = await context.client.from("slack_installations").update({ status: "uninstalled", uninstalled_at: now })
		.eq("id", current.id).eq("workspace_id", context.workspaceId).neq("status", "uninstalled").select("id").maybeSingle();
	if (result.error) return json(c, { error: "settings_write_failed" }, 503);

	if (current.key_id && current.guardrail_id) await removeAgentGuardrail(context, current.key_id, current.guardrail_id);
	await auditSlack(c, context, "uninstalled", { id: current.id, name: current.team_name }, {
		team_id: current.team_id,
		enterprise_id: current.enterprise_id,
		slack_uninstalled: slackUninstalled,
	});
	// No row means it was uninstalled meanwhile (in Slack, say), which sent its own alert.
	if (result.data) c.executionCtx.waitUntil(sendSlackAgentAlert(c.env, {
		event: "uninstalled",
		workspaceId: context.workspaceId,
		workspaceName: context.workspaceName,
		teamName: current.team_name,
		customApp: Boolean(current.slack_app_id),
		actor: { id: context.user.id, email: context.user.email },
	}));
	return json(c, { uninstalled: true, slack_uninstalled: slackUninstalled });
});

/** Unlinks the agent's guardrail from its key, and deletes it unless an admin has given it to other keys or members. */
async function removeAgentGuardrail(context: AccountWorkspaceContext, keyId: string, guardrailId: string): Promise<void> {
	const { client, workspaceId } = context;
	const unlinked = await client.from("key_guardrails").delete().eq("key_id", keyId).eq("guardrail_id", guardrailId);
	if (unlinked.error) return;
	const [keys, members] = await Promise.all([
		client.from("key_guardrails").select("key_id", { count: "exact", head: true }).eq("guardrail_id", guardrailId),
		client.from("workspace_member_guardrails").select("guardrail_id", { count: "exact", head: true }).eq("guardrail_id", guardrailId),
	]);
	if (keys.error || members.error || (keys.count ?? 0) > 0 || (members.count ?? 0) > 0) return;
	const removed = await client.from("workspace_guardrails").delete().eq("id", guardrailId).eq("workspace_id", workspaceId);
	if (removed.error) console.error("[slack-agent] uninstall: guardrail not removed", { guardrailId });
}

const CUSTOM_APP_FIELDS = new Set(["workspaceId", "slack_app_id", "client_id", "client_secret", "signing_secret"]);

accountSettingsSlackRouter.put("/slack/custom-app", bodyLimit({ maxSize: 8 * 1024 }), async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId);
	if ("response" in access) return access.response;
	const unknown = Object.keys(body).find((field) => !CUSTOM_APP_FIELDS.has(field));
	if (unknown) return badRequest(c, `Unknown field: ${unknown}`);
	const slackAppId = typeof body.slack_app_id === "string" ? body.slack_app_id.trim() : "";
	const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
	const clientSecret = typeof body.client_secret === "string" ? body.client_secret.trim() : "";
	const signingSecret = typeof body.signing_secret === "string" ? body.signing_secret.trim() : "";
	if (!SLACK_APP_ID_PATTERN.test(slackAppId)) return badRequest(c, "slack_app_id must be a Slack app id such as A0123ABCDEF");
	if (!SLACK_CLIENT_ID_PATTERN.test(clientId)) return badRequest(c, "client_id must be the app's client ID from Slack");
	if (!SLACK_APP_SECRET_PATTERN.test(clientSecret)) return badRequest(c, "client_secret must be the app's client secret from Slack");
	if (!SLACK_APP_SECRET_PATTERN.test(signingSecret)) return badRequest(c, "signing_secret must be the app's signing secret from Slack");
	if (!c.env.SLACK_SECRETS_ENCRYPTION_KEY?.trim()) return notConfigured(c);
	const { context } = access;

	const existing = await context.client.from("slack_apps").select(CUSTOM_APP_COLUMNS).eq("workspace_id", context.workspaceId)
		.order("created_at", { ascending: true }).limit(1).maybeSingle();
	if (existing.error) return json(c, { error: "settings_unavailable" }, 503);
	const current = existing.data as CustomAppRow | null;
	if (current && (current.slack_app_id !== slackAppId || current.client_id !== clientId)) {
		// The installed bot belongs to the saved app; only its secrets may change while it is live.
		const inUse = await context.client.from("slack_installations").select("id").eq("slack_app_id", current.id).neq("status", "uninstalled").limit(1).maybeSingle();
		if (inUse.error) return json(c, { error: "settings_unavailable" }, 503);
		if (inUse.data) return json(c, { error: "slack_app_in_use", message: "Uninstall the Slack agent before switching to a different Slack app" }, 409);
	}
	const secretsCiphertext = await encryptSlackSecrets(c.env, { client_secret: clientSecret, signing_secret: signingSecret });
	const saved = current
		? await context.client.from("slack_apps").update({ slack_app_id: slackAppId, client_id: clientId, secrets_ciphertext: secretsCiphertext })
			.eq("id", current.id).eq("workspace_id", context.workspaceId).select(CUSTOM_APP_COLUMNS).maybeSingle()
		: await context.client.from("slack_apps").insert({
			workspace_id: context.workspaceId, slack_app_id: slackAppId, client_id: clientId, secrets_ciphertext: secretsCiphertext, created_by: context.user.id,
		}).select(CUSTOM_APP_COLUMNS).maybeSingle();
	if (saved.error) {
		// A workspace has at most one app, so a concurrent first save loses here instead of adding a second.
		if (saved.error.code === "23505" && String(saved.error.message ?? "").includes("slack_apps_workspace_idx")) {
			return json(c, { error: "slack_app_conflict", message: "Another admin saved a Slack app for this workspace at the same time. Reload and try again." }, 409);
		}
		if (saved.error.code === "23505") return json(c, { error: "slack_app_taken", message: "This Slack app is already connected to another Phaseo workspace" }, 409);
		if (saved.error.code === "23514") return badRequest(c, "The Slack app details are not valid");
		return json(c, { error: "settings_write_failed" }, 503);
	}
	const row = saved.data as CustomAppRow | null;
	if (!row) return json(c, { error: "settings_write_failed" }, 503);
	await auditSlack(c, context, "custom_app_saved", { id: row.id, name: row.slack_app_id, type: "slack_app" }, { slack_app_id: row.slack_app_id, client_id: row.client_id });
	return json(c, { custom_app: customAppView(row) }, current ? 200 : 201);
});

accountSettingsSlackRouter.delete("/slack/custom-app", async (c) => {
	const body = await readBody(c);
	const access = await managerContext(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context } = access;
	const existing = await context.client.from("slack_apps").select(CUSTOM_APP_COLUMNS).eq("workspace_id", context.workspaceId)
		.order("created_at", { ascending: true }).limit(1).maybeSingle();
	if (existing.error) return json(c, { error: "settings_unavailable" }, 503);
	const app = existing.data as CustomAppRow | null;
	if (!app) return json(c, { error: "not_found", message: "No Slack app is saved for this workspace" }, 404);
	const inUse = await context.client.from("slack_installations").select("id").eq("slack_app_id", app.id).neq("status", "uninstalled").limit(1).maybeSingle();
	if (inUse.error) return json(c, { error: "settings_unavailable" }, 503);
	if (inUse.data) return json(c, { error: "slack_app_in_use", message: "Uninstall the Slack agent before removing its Slack app" }, 409);
	// Past installations reference the app, and deleting it would cascade to them and
	// their months and charges. Detach them first so billing history survives.
	const detached = await context.client.from("slack_installations").update({ slack_app_id: null })
		.eq("slack_app_id", app.id).eq("workspace_id", context.workspaceId).eq("status", "uninstalled");
	if (detached.error) return json(c, { error: "settings_write_failed" }, 503);
	const removed = await context.client.from("slack_apps").delete().eq("id", app.id).eq("workspace_id", context.workspaceId);
	if (removed.error) return json(c, { error: "settings_write_failed" }, 503);
	await auditSlack(c, context, "custom_app_deleted", { id: app.id, name: app.slack_app_id, type: "slack_app" }, { slack_app_id: app.slack_app_id });
	return json(c, { id: app.id, deleted: true });
});

accountSettingsSlackRouter.post("/slack/link", bodyLimit({ maxSize: 8 * 1024 }), async (c) => {
	const body = await readBody(c);
	const unknown = Object.keys(body).find((field) => field !== "token");
	if (unknown) return badRequest(c, `Unknown field: ${unknown}`);
	if (!c.req.header("authorization")?.startsWith("Bearer ")) return json(c, { error: "unauthorized" }, 401);
	const verified = await verifySlackToken<{ installation_id?: unknown; slack_user_id?: unknown }>(c.env, "link", body.token);
	if (verified.ok === false) {
		if (verified.reason === "unconfigured") return notConfigured(c);
		return json(c, verified.reason === "expired"
			? { error: "link_expired", message: "This link has expired. Ask the Slack agent for a new one" }
			: { error: "link_invalid", message: "This link is not valid" }, 400);
	}
	const installationId = verified.payload.installation_id;
	const slackUserId = verified.payload.slack_user_id;
	if (typeof installationId !== "string" || !UUID_PATTERN.test(installationId) || typeof slackUserId !== "string" || !SLACK_USER_PATTERN.test(slackUserId)) {
		return json(c, { error: "link_invalid", message: "This link is not valid" }, 400);
	}
	const installation = await getDataClient(c.env).from("slack_installations").select("id,workspace_id,team_name,status")
		.eq("id", installationId).maybeSingle();
	if (installation.error) return json(c, { error: "settings_unavailable" }, 503);
	if (!installation.data || installation.data.status === "uninstalled") {
		return json(c, { error: "not_installed", message: "The Slack agent is no longer installed" }, 404);
	}
	// Only members of the installation's workspace can link; the agent offers its
	// usage data to linked members only.
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: String(installation.data.workspace_id) });
	if (!context) return json(c, { error: "forbidden", message: "Sign in with an account in the Phaseo workspace that installed the Slack agent" }, 403);
	const linked = await context.client.from("slack_user_links").upsert({
		installation_id: installationId,
		slack_user_id: slackUserId,
		user_id: context.user.id,
		linked_at: new Date().toISOString(),
	}, { onConflict: "installation_id,slack_user_id" });
	if (linked.error) return json(c, { error: "settings_write_failed" }, 503);
	await auditSlack(c, context, "account_linked", { id: slackUserId, name: installation.data.team_name ?? null, type: "slack_user" }, { installation_id: installationId });
	return json(c, {
		linked: true,
		workspaceId: context.workspaceId,
		workspace_name: context.workspaceName,
		team_name: installation.data.team_name ?? null,
	});
});

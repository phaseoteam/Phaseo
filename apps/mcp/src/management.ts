import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { PhaseoApiError, requestPhaseo, type AuthenticatedPhaseoUser, type PhaseoEnv } from "./phaseo-api";

// Scopes an MCP connection may hold for account management. They are never
// requested by default: only the "manage" connection URL asks for them, and the
// consent screen lists each one so the user can untick any of them. Keep this
// list in step with MCP_MANAGEMENT_SCOPES in apps/api/src/routes/oauth.ts.
export const MCP_MANAGEMENT_SCOPES = [
	"keys:read",
	"keys:write",
	"keys:delete",
	"budgets:read",
	"budgets:write",
	"budgets:delete",
	"spend_rules:read",
	"spend_rules:write",
	"spend_rules:delete",
	"provider_credentials:read",
	"provider_credentials:write",
	"provider_credentials:delete",
	"guardrails:read",
	"guardrails:write",
	"guardrails:delete",
	"presets:read",
	"presets:write",
	"settings:read",
	"settings:write",
] as const;

const MAX_RESULT_TEXT_CHARS = 50_000;

type Input = Record<string, unknown>;
type QueryValue = string | number | boolean | undefined;
type McpZodRawShape = Record<string, z.ZodType>;

/** read: no changes. create: adds a resource. update: changes or replaces existing state. delete: removes it. */
export type ManagementEffect = "read" | "create" | "update" | "delete";

export type ManagementToolDefinition = {
	name: string;
	title: string;
	description: string;
	scopes: readonly string[];
	effect: ManagementEffect;
	/** Defaults to true for read, update and delete and false for create. */
	idempotent?: boolean;
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	inputSchema: McpZodRawShape;
	path: (input: Input) => string;
	query?: (input: Input) => Record<string, QueryValue>;
	/** Fields of the input sent as the JSON body. Path parameters are never sent. */
	body?: (input: Input) => Record<string, unknown>;
	/** A secret that the API returns once and never again. */
	oneTimeSecret?: { label: string; read: (payload: Record<string, unknown>) => unknown };
};

// Fields that hold credentials or their encrypted form. They are removed from
// every management result; a one-time secret is returned separately and flagged.
const SECRET_FIELDS = new Set([
	"key",
	"api_key",
	"secret",
	"signing_secret",
	"secret_ciphertext",
	"secret_iv",
	"secret_hash",
	"destination_config",
	"destination_config_ciphertext",
	"destination_config_iv",
	"encrypted_key",
	"key_ciphertext",
]);

function id(label: string) {
	return z.string().trim().min(1).max(200).describe(label);
}

const pagination = {
	limit: z.number().int().min(1).max(250).optional().describe("Maximum number of items to return."),
	offset: z.number().int().nonnegative().optional().describe("Number of items to skip, for paging."),
};

function encodedPath(prefix: string, input: Input, ...suffix: string[]): string {
	return [prefix, encodeURIComponent(String(input.id)), ...suffix].join("/");
}

/** Every input field except path parameters, without undefined values. */
function bodyWithout(...excluded: string[]) {
	return (input: Input): Record<string, unknown> => Object.fromEntries(
		Object.entries(input).filter(([field, value]) => value !== undefined && !excluded.includes(field)),
	);
}

function pageQuery(input: Input, extra: Record<string, QueryValue> = {}): Record<string, QueryValue> {
	return { limit: input.limit as number | undefined, offset: input.offset as number | undefined, ...extra };
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readSecret(payload: Record<string, unknown>, field: string): unknown {
	return payload[field] ?? asRecord(payload.data)[field];
}

export function redactSecrets(value: unknown, depth = 0): unknown {
	if (depth > 12) return null;
	if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([field]) => !SECRET_FIELDS.has(field))
			.map(([field, item]) => [field, redactSecrets(item, depth + 1)]),
	);
}

// --- Shared input fields -------------------------------------------------

const usdLimit = z.number().nonnegative().nullable().optional();
const keyLimitBucket = z.object({
	requests: z.number().int().nonnegative().nullable().optional().describe("Request limit for the window. Null clears it."),
	cost: z.number().nonnegative().nullable().optional().describe("Spend limit in USD for the window. Null clears it."),
}).strict();
const apiKeyFields = {
	limit: usdLimit.describe("Spend limit in USD for the limit_reset window. Null clears it."),
	limit_reset: z.enum(["daily", "weekly", "monthly"]).optional().describe("Window used by limit."),
	limits: z.object({
		daily: keyLimitBucket.optional(),
		weekly: keyLimitBucket.optional(),
		monthly: keyLimitBucket.optional(),
	}).strict().optional().describe("Separate request and USD spend limits per window."),
	expires_at: z.string().datetime().nullable().optional().describe("ISO-8601 time the key stops working. Null means it never expires."),
	disabled: z.boolean().optional().describe("Pause the key (true) or make it active again (false)."),
	soft_blocked: z.boolean().optional().describe("Block requests with this key without pausing it."),
	department_id: z.string().uuid().nullable().optional().describe("Department the key counts towards. Null for workspace-wide only."),
	storage_locations: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)).max(8).optional()
		.describe("Where the key is stored, such as vercel, github or local-machine, so it can be found if that place reports a breach."),
};

const spendRuleFields = {
	name: z.string().min(1).max(100).optional().describe("Rule name."),
	enabled: z.boolean().optional().describe("Whether the rule is active."),
	metric: z.enum(["spend", "budget_percent", "forecast", "spike", "balance"])
		.describe("spend: spend reached threshold_amount_usd. budget_percent: spend reached threshold_percents of the base. forecast: projected spend reaches the threshold. spike: recent spend is spike_multiplier times the usual level. balance: balance or runway falls below the threshold.")
		.optional(),
	scope_type: z.enum(["workspace", "key", "member", "department", "model", "provider"]).optional().describe("What the rule watches."),
	scope_id: z.string().max(200).nullable().optional().describe("Null for the workspace; otherwise the key, member, department, model or provider id."),
	period: z.enum(["day", "week", "month", "rolling"]).describe("Calendar period, or rolling over window_hours.").optional(),
	window_hours: z.number().int().min(1).max(720).nullable().optional().describe("Rolling window or spike window in hours."),
	time_zone: z.string().max(64).nullable().optional().describe("IANA time zone for calendar periods. Null uses the workspace billing time zone."),
	base_kind: z.enum(["amount", "workspace_budget", "key_limit", "previous_period"]).nullable().optional().describe("What threshold_percents are percentages of."),
	base_ref: z.enum(["daily", "weekly", "monthly"]).nullable().optional().describe("Budget or key-limit interval used as the base."),
	base_amount_usd: z.number().nullable().optional().describe("Base amount in USD when base_kind is amount."),
	threshold_percents: z.array(z.number().int().min(1).max(1000)).min(1).max(5).nullable().optional().describe("Up to five percentages of the base that trigger alerts."),
	threshold_amount_usd: z.number().nullable().optional().describe("USD threshold for spend, forecast and balance rules."),
	runway_days: z.number().int().min(1).max(365).nullable().optional().describe("Balance rules: alert when runway falls below this many days."),
	spike_multiplier: z.number().nullable().optional().describe("Spike rules: multiple of usual spend that counts as a spike."),
	spike_floor_usd: z.number().nullable().optional().describe("Spike rules: minimum USD spend before a spike alerts."),
	action: z.enum(["notify", "block"]).optional().describe("notify, or notify and then block requests. Blocking stops gateway traffic for the scope."),
	block_at_percent: z.number().int().min(100).max(1000).optional().describe("Block once spend reaches this percentage of the base."),
	block_at_amount_usd: z.number().nullable().optional().describe("Block once spend reaches this USD amount."),
	block_free_models: z.boolean().optional().describe("Whether a block also stops requests to free models."),
	cooldown_minutes: z.number().int().min(5).max(43200).optional().describe("Minimum minutes between alerts."),
	destination_ids: z.array(z.string().uuid()).max(50).optional().describe("Notification destinations. Empty uses the workspace Spend Alerts route."),
};

const restrictionMode = z.enum(["none", "allowlist", "blocklist"]);
const guardrailFields = {
	name: z.string().min(1).max(200).optional().describe("Guardrail name."),
	description: z.string().nullable().optional().describe("Guardrail description."),
	enabled: z.boolean().optional().describe("Whether the guardrail applies."),
	privacyZdrOnly: z.boolean().nullable().optional().describe("Only route to providers with zero data retention."),
	privacyEnablePaidMayTrain: z.boolean().nullable().optional().describe("Allow paid providers that may train on requests."),
	privacyEnableFreeMayTrain: z.boolean().nullable().optional().describe("Allow free providers that may train on requests."),
	privacyEnableFreeMayPublishPrompts: z.boolean().nullable().optional().describe("Allow free providers that may publish prompts."),
	privacyEnableInputOutputLogging: z.boolean().nullable().optional().describe("Allow providers that log inputs and outputs."),
	providerRestrictionMode: restrictionMode.optional().describe("Restrict providers with an allowlist or blocklist."),
	providerRestrictionProviderIds: z.array(z.string().max(128)).max(64).optional().describe("Provider ids for the provider allowlist or blocklist."),
	providerRestrictionEnforceAllowed: z.boolean().optional().describe("Reject requests that ask for a provider outside the allowlist."),
	modelRestrictionMode: restrictionMode.optional().describe("Restrict models with an allowlist or blocklist."),
	allowedApiModelIds: z.array(z.string().max(200)).max(500).optional().describe("Phaseo model ids for the model allowlist or blocklist."),
	promptInjectionEnabled: z.boolean().optional().describe("Check requests for prompt injection."),
	promptInjectionAction: z.enum(["flag", "block"]).optional().describe("What to do when prompt injection is found."),
	sensitiveInfoEnabled: z.boolean().optional().describe("Check requests for sensitive information."),
	sensitiveInfoDefaultAction: z.enum(["flag", "redact", "block"]).optional().describe("Default action for sensitive information."),
};

const presetFields = {
	slug: z.string().max(100).optional().describe("URL slug. Defaults to one derived from the name."),
	description: z.string().max(500).nullable().optional().describe("Preset description."),
	config: z.record(z.string(), z.unknown()).optional()
		.describe("Gateway request defaults: model, prompt template, parameters, routing and plugins, as in the Phaseo Management API PresetConfig."),
	visibility: z.enum(["private", "team", "public"]).optional().describe("Who can use the preset."),
	versioning_method: z.enum(["sequential", "semver", "date"]).optional().describe("How published versions are numbered."),
};

const webhookEvents = [
	"job.created", "job.status_changed", "job.progress", "job.completed", "job.failed", "job.cancelled", "job.expired",
	"video.created", "video.status_changed", "video.progress", "video.completed", "video.failed", "video.cancelled", "video.expired",
	"batch.created", "batch.status_changed", "batch.progress", "batch.completed", "batch.failed", "batch.cancelled", "batch.expired",
] as const;

const observabilityTypes = [
	"arize", "axiom", "bigquery", "braintrust", "clickhouse", "comet_opik", "datadog", "dynatrace", "elastic", "gcs",
	"grafana_cloud", "honeycomb", "langfuse", "langsmith", "new_relic", "otel_collector", "posthog", "r2", "respan", "s3",
	"sentry", "snowflake", "wandb_weave", "webhook",
] as const;

// --- Tools ----------------------------------------------------------------

export const managementTools: ManagementToolDefinition[] = [
	// API keys
	{
		name: "api_keys_list",
		title: "List Phaseo API keys",
		description: "List API keys in the connected workspace with their names, prefixes, status, limits and usage. Never returns key secrets. Read-only.",
		scopes: ["keys:read"],
		effect: "read",
		method: "GET",
		inputSchema: { include_disabled: z.boolean().optional().describe("Include paused or soft-blocked keys."), ...pagination },
		path: () => "/v1/keys",
		query: (input) => pageQuery(input, { include_disabled: input.include_disabled as boolean | undefined }),
	},
	{
		name: "api_key_get",
		title: "Get a Phaseo API key",
		description: "Get one API key's metadata, limits and usage. Never returns the key secret. Read-only.",
		scopes: ["keys:read"],
		effect: "read",
		method: "GET",
		inputSchema: { id: id("API key id or hash.") },
		path: (input) => encodedPath("/v1/keys", input),
	},
	{
		name: "api_key_create",
		title: "Create a Phaseo API key",
		description: "Create a gateway API key in the connected workspace. The new secret is returned once in oneTimeSecret and can never be shown again; tell the user to store it securely. Confirm the name and limits with the user first.",
		scopes: ["keys:write"],
		effect: "create",
		method: "POST",
		inputSchema: { name: z.string().trim().min(1).max(200).describe("Key name, such as the app or service using it."), ...apiKeyFields },
		path: () => "/v1/keys",
		body: bodyWithout(),
		oneTimeSecret: { label: "API key", read: (payload) => readSecret(payload, "key") },
	},
	{
		name: "api_key_update",
		title: "Update a Phaseo API key",
		description: "Rename, pause, resume, or change the limits or expiry of an API key. Pausing or blocking a key stops every request that uses it. Confirm with the user first.",
		scopes: ["keys:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: {
			id: id("API key id or hash."),
			name: z.string().trim().min(1).max(200).optional().describe("New key name."),
			...apiKeyFields,
			storage_locations: apiKeyFields.storage_locations.nullable().describe("Where the key is stored. Null clears the list."),
		},
		path: (input) => encodedPath("/v1/keys", input),
		body: bodyWithout("id"),
	},
	{
		name: "api_key_rotate",
		title: "Rotate a Phaseo API key",
		description: "Create a replacement for an API key with the same settings and expire the old key. The replacement secret is returned once in oneTimeSecret and can never be shown again. Requests using the old key fail once it expires. Confirm with the user first.",
		scopes: ["keys:write"],
		effect: "update",
		idempotent: false,
		method: "POST",
		inputSchema: {
			id: id("API key id or hash to rotate."),
			previous_key_expires_at: z.string().datetime().optional()
				.describe("ISO-8601 time the old key stops working, to allow a handover. Omit to expire it immediately."),
		},
		path: (input) => encodedPath("/v1/keys", input, "rotate"),
		// The API keeps the old key active when no expiry is sent, so omitting it means "now".
		body: (input) => ({ previous_key_expires_at: input.previous_key_expires_at ?? new Date().toISOString() }),
		oneTimeSecret: { label: "replacement API key", read: (payload) => readSecret(payload, "key") },
	},
	{
		name: "api_key_delete",
		title: "Delete a Phaseo API key",
		description: "Permanently delete an API key. Every request using it fails immediately and it cannot be restored. Confirm the exact key with the user first.",
		scopes: ["keys:delete"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("API key id or hash to delete.") },
		path: (input) => encodedPath("/v1/keys", input),
	},

	// Workspace budgets
	{
		name: "budgets_list",
		title: "List Phaseo budgets",
		description: "List workspace spending budgets with their limits, current usage, remaining amount and reset time. Read-only.",
		scopes: ["budgets:read"],
		effect: "read",
		method: "GET",
		inputSchema: {},
		path: () => "/v1/budgets",
	},
	{
		name: "budget_create",
		title: "Create a Phaseo budget",
		description: "Create a workspace spending budget. A workspace has at most one budget per interval. Confirm the amount with the user first.",
		scopes: ["budgets:write"],
		effect: "create",
		method: "POST",
		inputSchema: {
			interval: z.enum(["daily", "weekly", "monthly", "lifetime"]).describe("Budget window."),
			limit: z.number().positive().describe("Budget limit in USD."),
		},
		path: () => "/v1/budgets",
		body: bodyWithout(),
	},
	{
		name: "budget_update",
		title: "Update a Phaseo budget",
		description: "Change a workspace budget's interval or USD limit. Confirm with the user first.",
		scopes: ["budgets:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: {
			id: id("Budget id."),
			interval: z.enum(["daily", "weekly", "monthly", "lifetime"]).optional().describe("New budget window."),
			limit: z.number().positive().optional().describe("New budget limit in USD."),
		},
		path: (input) => encodedPath("/v1/budgets", input),
		body: bodyWithout("id"),
	},
	{
		name: "budget_delete",
		title: "Delete a Phaseo budget",
		description: "Delete a workspace budget. Spending is no longer limited by it. Confirm with the user first.",
		scopes: ["budgets:delete"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("Budget id to delete.") },
		path: (input) => encodedPath("/v1/budgets", input),
	},

	// Spend rules
	{
		name: "spend_rules_list",
		title: "List Phaseo spend rules",
		description: "List spend alert and blocking rules in the connected workspace. Read-only.",
		scopes: ["spend_rules:read"],
		effect: "read",
		method: "GET",
		inputSchema: {},
		path: () => "/v1/spend-rules",
	},
	{
		name: "spend_rule_create",
		title: "Create a Phaseo spend rule",
		description: "Create a spend rule that alerts, or alerts and then blocks requests, when spend crosses a threshold. Field names match the Phaseo Management API. Confirm the threshold and action with the user first.",
		scopes: ["spend_rules:write"],
		effect: "create",
		method: "POST",
		inputSchema: {
			...spendRuleFields,
			name: z.string().min(1).max(100).describe("Rule name."),
			metric: spendRuleFields.metric.unwrap(),
			period: spendRuleFields.period.unwrap(),
		},
		path: () => "/v1/spend-rules",
		body: bodyWithout(),
	},
	{
		name: "spend_rule_update",
		title: "Update a Phaseo spend rule",
		description: "Change a spend rule. Set a field to null to clear it. Disabling or changing a blocking rule also lifts its block. Confirm with the user first.",
		scopes: ["spend_rules:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: { id: id("Spend rule id."), ...spendRuleFields },
		path: (input) => encodedPath("/v1/spend-rules", input),
		body: bodyWithout("id"),
	},
	{
		name: "spend_rule_delete",
		title: "Delete a Phaseo spend rule",
		description: "Delete a spend rule and lift any block it caused. Confirm with the user first.",
		scopes: ["spend_rules:delete"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("Spend rule id to delete.") },
		path: (input) => encodedPath("/v1/spend-rules", input),
	},

	// Provider keys (BYOK)
	{
		name: "provider_keys_list",
		title: "List Phaseo provider keys",
		description: "List bring-your-own provider keys (BYOK) in the connected workspace. Shows only names, providers, masked prefixes and settings; stored secrets are never returned. Read-only.",
		scopes: ["provider_credentials:read"],
		effect: "read",
		method: "GET",
		inputSchema: { provider: z.string().max(100).optional().describe("Only keys for this provider id."), ...pagination },
		path: () => "/v1/byok",
		query: (input) => pageQuery(input, { provider: input.provider as string | undefined }),
	},
	{
		name: "provider_key_create",
		title: "Add a Phaseo provider key",
		description: "Add a bring-your-own provider key (BYOK). Phaseo encrypts the key and never returns it. Only use a key the user gave you for this purpose. Requests may then be billed to the user's provider account.",
		scopes: ["provider_credentials:write"],
		effect: "create",
		method: "POST",
		inputSchema: {
			provider: z.string().trim().min(1).max(100).describe("Phaseo provider id, such as openai or anthropic."),
			name: z.string().trim().min(1).max(255).describe("Name for this key."),
			key: z.string().min(1).max(20_000).describe("The raw provider credential. Stored encrypted and never returned."),
			enabled: z.boolean().optional().describe("Whether Phaseo may use the key. Defaults to true."),
			routing_mode: z.enum(["priority", "fallback"]).optional().describe("priority: always try this key first. fallback: use it only when Phaseo's own keys fail."),
			allowed_models: z.array(z.string().max(200)).max(256).optional().describe("Only use the key for these model ids. Empty means all models."),
			allowed_api_key_ids: z.array(z.string().uuid()).max(256).optional().describe("Only use the key for requests from these Phaseo API key ids."),
		},
		path: () => "/v1/byok",
		body: bodyWithout(),
	},
	{
		name: "provider_key_update",
		title: "Update a Phaseo provider key",
		description: "Rename, enable, disable, restrict or replace a provider key (BYOK). Stored secrets are never returned. Confirm with the user first.",
		scopes: ["provider_credentials:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: {
			id: id("Provider key id."),
			name: z.string().trim().min(1).max(255).optional().describe("New name."),
			key: z.string().min(1).max(20_000).optional().describe("Replacement raw provider credential. Stored encrypted and never returned."),
			enabled: z.boolean().optional().describe("Whether Phaseo may use the key."),
			routing_mode: z.enum(["priority", "fallback"]).optional().describe("priority or fallback."),
			allowed_models: z.array(z.string().max(200)).max(256).optional().describe("Only use the key for these model ids. Empty means all models."),
			allowed_api_key_ids: z.array(z.string().uuid()).max(256).optional().describe("Only use the key for requests from these Phaseo API key ids."),
		},
		path: (input) => encodedPath("/v1/byok", input),
		body: bodyWithout("id"),
	},
	{
		name: "provider_key_delete",
		title: "Delete a Phaseo provider key",
		description: "Permanently delete a provider key (BYOK). Phaseo stops using it straight away. Confirm with the user first.",
		scopes: ["provider_credentials:delete"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("Provider key id to delete.") },
		path: (input) => encodedPath("/v1/byok", input),
	},

	// Guardrails
	{
		name: "guardrails_list",
		title: "List Phaseo guardrails",
		description: "List guardrail policies in the connected workspace. Read-only.",
		scopes: ["guardrails:read"],
		effect: "read",
		method: "GET",
		inputSchema: { ...pagination },
		path: () => "/v1/guardrails",
		query: (input) => pageQuery(input),
	},
	{
		name: "guardrail_get",
		title: "Get a Phaseo guardrail",
		description: "Get one guardrail policy. Read-only.",
		scopes: ["guardrails:read"],
		effect: "read",
		method: "GET",
		inputSchema: { id: id("Guardrail id.") },
		path: (input) => encodedPath("/v1/guardrails", input),
	},
	{
		name: "guardrail_create",
		title: "Create a Phaseo guardrail",
		description: "Create a guardrail policy for privacy, provider and model restrictions, prompt injection and sensitive information. It applies only to keys or members it is assigned to; use guardrail_keys_set to assign keys. Field names match the Phaseo Management API.",
		scopes: ["guardrails:write"],
		effect: "create",
		method: "POST",
		inputSchema: { ...guardrailFields, name: z.string().min(1).max(200).describe("Guardrail name.") },
		path: () => "/v1/guardrails",
		body: bodyWithout(),
	},
	{
		name: "guardrail_update",
		title: "Update a Phaseo guardrail",
		description: "Change a guardrail policy. Changes apply to every key and member it is assigned to. Confirm with the user first.",
		scopes: ["guardrails:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: { id: id("Guardrail id."), ...guardrailFields },
		path: (input) => encodedPath("/v1/guardrails", input),
		body: bodyWithout("id"),
	},
	{
		name: "guardrail_delete",
		title: "Delete a Phaseo guardrail",
		description: "Delete a guardrail policy and remove it from every key and member. Their requests are no longer checked by it. Confirm with the user first.",
		scopes: ["guardrails:delete"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("Guardrail id to delete.") },
		path: (input) => encodedPath("/v1/guardrails", input),
	},
	{
		name: "guardrail_keys_set",
		title: "Set a Phaseo guardrail's API keys",
		description: "Replace the full list of API keys a guardrail applies to. Keys left out are removed from the guardrail; an empty list removes all of them. Confirm with the user first.",
		scopes: ["guardrails:write"],
		effect: "update",
		method: "PUT",
		inputSchema: {
			id: id("Guardrail id."),
			key_ids: z.array(z.string().min(1).max(200)).max(500).describe("Every API key id the guardrail should apply to."),
		},
		path: (input) => encodedPath("/v1/guardrails", input, "keys"),
		body: bodyWithout("id"),
	},

	// Presets
	{
		name: "presets_list",
		title: "List Phaseo presets",
		description: "List saved request presets in the connected workspace. Read-only.",
		scopes: ["presets:read"],
		effect: "read",
		method: "GET",
		inputSchema: { visibility: z.enum(["private", "team", "public"]).optional().describe("Only presets with this visibility."), ...pagination },
		path: () => "/v1/presets",
		query: (input) => pageQuery(input, { visibility: input.visibility as string | undefined }),
	},
	{
		name: "preset_get",
		title: "Get a Phaseo preset",
		description: "Get one preset with its draft configuration. Read-only.",
		scopes: ["presets:read"],
		effect: "read",
		method: "GET",
		inputSchema: { id: id("Preset id.") },
		path: (input) => encodedPath("/v1/presets", input),
	},
	{
		name: "preset_create",
		title: "Create a Phaseo preset",
		description: "Create a request preset as a draft. Use preset_version_publish to publish a version that requests can use.",
		scopes: ["presets:write"],
		effect: "create",
		method: "POST",
		inputSchema: {
			name: z.string().regex(/^@[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).min(2).max(100).describe("Preset name starting with @, such as @support-bot."),
			...presetFields,
		},
		path: () => "/v1/presets",
		body: bodyWithout(),
	},
	{
		name: "preset_update",
		title: "Update a Phaseo preset",
		description: "Change a preset's draft. Published versions do not change until a new version is published. config is merged into the draft unless replace_config is true.",
		scopes: ["presets:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: {
			id: id("Preset id."),
			name: z.string().regex(/^@[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).min(2).max(100).optional().describe("New preset name starting with @."),
			...presetFields,
			replace_config: z.boolean().optional().describe("Replace the draft config instead of merging top-level fields."),
		},
		path: (input) => encodedPath("/v1/presets", input),
		body: bodyWithout("id"),
	},
	{
		name: "preset_version_publish",
		title: "Publish a Phaseo preset version",
		description: "Publish the preset's current draft as a new version. Requests that use the preset's latest version start using it. Confirm with the user first.",
		scopes: ["presets:write"],
		// Publishing changes the live config of every request that uses the latest version.
		effect: "update",
		idempotent: false,
		method: "POST",
		inputSchema: {
			id: id("Preset id."),
			release_notes: z.string().max(1000).optional().describe("What changed in this version."),
			version_label: z.string().max(100).optional().describe("Version label, for presets that use semver or custom labels."),
		},
		path: (input) => encodedPath("/v1/presets", input, "versions"),
		body: bodyWithout("id"),
	},

	// Workspace settings
	{
		name: "settings_get",
		title: "Get Phaseo workspace settings",
		description: "Get the connected workspace's gateway settings, including routing mode, privacy and zero data retention (ZDR), logging and provider restrictions. Read-only.",
		scopes: ["settings:read"],
		effect: "read",
		method: "GET",
		inputSchema: {},
		path: () => "/v1/settings",
	},
	{
		name: "settings_update",
		title: "Update Phaseo workspace settings",
		description: "Change workspace gateway settings. These apply to every request in the workspace: privacy and ZDR settings change which providers can be used, and logging settings change what Phaseo stores. Confirm each change with the user first.",
		scopes: ["settings:write"],
		effect: "update",
		method: "PATCH",
		inputSchema: {
			routing_mode: z.enum(["balanced", "price", "latency", "throughput"]).optional().describe("How Phaseo chooses between providers."),
			privacy_zdr_only: z.boolean().optional().describe("Only route to providers with zero data retention."),
			privacy_enable_paid_may_train: z.boolean().optional().describe("Allow paid providers that may train on requests."),
			privacy_enable_free_may_train: z.boolean().optional().describe("Allow free providers that may train on requests."),
			privacy_enable_free_may_publish_prompts: z.boolean().optional().describe("Allow free providers that may publish prompts."),
			privacy_enable_input_output_logging: z.boolean().optional().describe("Allow providers that log inputs and outputs."),
			io_logging_enabled: z.boolean().optional().describe("Store request and response bodies in Phaseo logs."),
			io_logging_include_provider_payloads: z.boolean().optional().describe("Also store raw provider payloads in Phaseo logs."),
			provider_restriction_mode: restrictionMode.optional().describe("Restrict providers with an allowlist or blocklist."),
			provider_restriction_provider_ids: z.array(z.string().max(128)).max(64).optional().describe("Provider ids for the allowlist or blocklist."),
			provider_restriction_enforce_allowed: z.boolean().optional().describe("Reject requests that ask for a provider outside the allowlist."),
			byok_fallback_enabled: z.boolean().optional().describe("Fall back to Phaseo's keys when a provider key (BYOK) fails."),
			response_healing_enabled: z.boolean().optional().describe("Repair malformed structured responses."),
			response_healing_mode: z.enum(["safe", "strict"]).optional().describe("How response healing behaves."),
			model_successor_redirect_enabled: z.boolean().optional().describe("Send requests for retired models to their successors."),
			model_successor_price_policy: z.enum(["never", "limit", "any"]).optional().describe("Whether a successor may cost more."),
			model_successor_max_price_increase_percent: z.number().int().min(0).max(1000).optional().describe("Largest successor price increase allowed with the limit policy."),
			beta_channel_enabled: z.boolean().optional().describe("Allow beta models and features."),
			alpha_channel_enabled: z.boolean().optional().describe("Allow alpha models and features."),
		},
		path: () => "/v1/settings",
		body: bodyWithout(),
	},

	// Webhooks
	{
		name: "webhooks_list",
		title: "List Phaseo webhooks",
		description: "List webhook endpoints that receive job, video and batch events. Signing secrets are never returned. Read-only.",
		scopes: ["settings:read"],
		effect: "read",
		method: "GET",
		inputSchema: { ...pagination },
		path: () => "/v1/webhook-endpoints",
		query: (input) => pageQuery(input),
	},
	{
		name: "webhook_create",
		title: "Create a Phaseo webhook",
		description: "Create a webhook endpoint for job, video and batch events. Its signing secret is returned once in oneTimeSecret and can never be shown again; tell the user to store it securely.",
		scopes: ["settings:write"],
		effect: "create",
		method: "POST",
		inputSchema: {
			url: z.string().url().max(2048).describe("HTTPS URL that receives events."),
			name: z.string().min(1).max(120).optional().describe("Endpoint name."),
			events: z.array(z.enum(webhookEvents)).min(1).optional().describe("Events to send. Omit for the default set."),
		},
		path: () => "/v1/webhook-endpoints",
		body: bodyWithout(),
		oneTimeSecret: { label: "webhook signing secret", read: (payload) => readSecret(payload, "signing_secret") },
	},
	{
		name: "webhook_delete",
		title: "Delete a Phaseo webhook",
		description: "Delete a webhook endpoint. It stops receiving events. Confirm with the user first.",
		scopes: ["settings:write"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("Webhook endpoint id to delete.") },
		path: (input) => encodedPath("/v1/webhook-endpoints", input),
	},

	// Observability destinations
	{
		name: "observability_destinations_list",
		title: "List Phaseo observability destinations",
		description: "List destinations that receive request traces, such as Langfuse, Datadog or an OpenTelemetry collector. Stored credentials are never returned. Read-only.",
		scopes: ["settings:read"],
		effect: "read",
		method: "GET",
		inputSchema: { ...pagination },
		path: () => "/v1/observability/destinations",
		query: (input) => pageQuery(input),
	},
	{
		name: "observability_destination_create",
		title: "Create a Phaseo observability destination",
		description: "Send request traces to an observability tool. Traces include request metadata and, unless privacy_mode is on, prompts and outputs. config holds the destination's credentials; Phaseo encrypts it and never returns it. Confirm with the user first.",
		scopes: ["settings:write"],
		effect: "create",
		method: "POST",
		inputSchema: {
			type: z.enum(observabilityTypes).describe("Destination type."),
			name: z.string().min(1).max(200).describe("Destination name."),
			config: z.record(z.string(), z.string()).describe("Destination settings and credentials as strings, for example an endpoint URL and API key. Stored encrypted and never returned."),
			enabled: z.boolean().optional().describe("Whether traces are sent. Defaults to true."),
			privacy_mode: z.boolean().optional().describe("Leave prompts and outputs out of traces."),
			sampling_rate: z.number().min(0.0001).max(1).optional().describe("Share of requests to send, from 0.0001 to 1."),
			include_generation_metadata: z.boolean().optional().describe("Include model and token metadata."),
			include_cost_metadata: z.boolean().optional().describe("Include cost metadata."),
			include_identity_metadata: z.boolean().optional().describe("Include key and user identity metadata."),
			include_request_context: z.boolean().optional().describe("Include request context such as headers."),
		},
		path: () => "/v1/observability/destinations",
		body: bodyWithout(),
	},
	{
		name: "observability_destination_delete",
		title: "Delete a Phaseo observability destination",
		description: "Delete an observability destination. Traces stop being sent to it and its stored credentials are removed. Confirm with the user first.",
		scopes: ["settings:write"],
		effect: "delete",
		method: "DELETE",
		inputSchema: { id: id("Observability destination id to delete.") },
		path: (input) => encodedPath("/v1/observability/destinations", input),
	},
];

export function managementAnnotations(definition: ManagementToolDefinition) {
	const readOnly = definition.effect === "read";
	return {
		readOnlyHint: readOnly,
		// Updates replace existing state and deletes remove it; clients should confirm both.
		destructiveHint: definition.effect === "update" || definition.effect === "delete",
		idempotentHint: definition.idempotent ?? definition.effect !== "create",
		openWorldHint: false,
	};
}

/** Whether the user granted any account-management scope on this connection. */
export function hasManagementConsent(user: AuthenticatedPhaseoUser): boolean {
	return MCP_MANAGEMENT_SCOPES.some((scope) => user.scopes.includes(scope));
}

const oneTimeSecretSchema = z.object({
	label: z.string(),
	value: z.string(),
	shownOnce: z.literal(true),
	warning: z.string(),
});

const managementOutputSchema = {
	result: z.unknown().describe("Phaseo Management API response, with stored credentials removed."),
	oneTimeSecret: oneTimeSecretSchema.optional().describe("A new secret that Phaseo returns only this once."),
};

export function managementErrorResult(error: unknown) {
	if (!(error instanceof PhaseoApiError)) {
		return { isError: true as const, content: [{ type: "text" as const, text: "Phaseo could not complete this request." }] };
	}
	const status = error.status;
	const hint = status === 403
		? " Your workspace role or this connection's permissions do not allow this action."
		: status === 404
			? " Check the id with the matching list tool."
			: "";
	const prefix = status ? `Phaseo rejected the request (HTTP ${status}): ` : "";
	return { isError: true as const, content: [{ type: "text" as const, text: `${prefix}${error.message}${hint}` }] };
}

export function managementSuccessResult(definition: ManagementToolDefinition, payload: Record<string, unknown>) {
	const secretValue = definition.oneTimeSecret?.read(payload);
	const oneTimeSecret = typeof secretValue === "string" && secretValue
		? {
			label: definition.oneTimeSecret!.label,
			value: secretValue,
			shownOnce: true as const,
			warning: `Phaseo shows this ${definition.oneTimeSecret!.label} only once and cannot show it again. Give it to the user to store in a secret manager; do not repeat it elsewhere.`,
		}
		: undefined;
	const result = redactSecrets(payload);
	const serialised = JSON.stringify(result, null, 2);
	const text = [
		`${definition.title} completed.`,
		...(oneTimeSecret ? [`ONE-TIME SECRET (${oneTimeSecret.label}): ${oneTimeSecret.value}\n${oneTimeSecret.warning}`] : []),
		serialised.length > MAX_RESULT_TEXT_CHARS ? `${serialised.slice(0, MAX_RESULT_TEXT_CHARS)}\n… (truncated)` : serialised,
	].join("\n\n");
	return {
		content: [{ type: "text" as const, text }],
		structuredContent: { result, ...(oneTimeSecret ? { oneTimeSecret } : {}) },
	};
}

export async function callManagementTool(
	env: PhaseoEnv,
	user: AuthenticatedPhaseoUser,
	definition: ManagementToolDefinition,
	input: Input,
) {
	try {
		const body = definition.body?.(input);
		const payload = await requestPhaseo<Record<string, unknown>>(env, definition.path(input), {
			credentials: { accessToken: user.accessToken },
			method: definition.method,
			query: definition.query?.(input),
			...(body === undefined ? {} : { body }),
		});
		return managementSuccessResult(definition, payload);
	} catch (error) {
		return managementErrorResult(error);
	}
}

function oauthToolMeta(scopes: readonly string[]) {
	return { securitySchemes: [{ type: "oauth2", scopes: [...scopes] }] };
}

export function registerManagementTools(
	server: McpServer,
	env: PhaseoEnv,
	user: AuthenticatedPhaseoUser,
	managementAccess = false,
): void {
	// The plain /mcp URL stays read-only: management tools exist only on the manage URL.
	if (!managementAccess || !hasManagementConsent(user)) return;
	for (const definition of managementTools) {
		if (!definition.scopes.every((scope) => user.scopes.includes(scope))) continue;
		server.registerTool(
			definition.name,
			{
				title: definition.title,
				description: definition.description,
				inputSchema: definition.inputSchema,
				outputSchema: managementOutputSchema,
				annotations: managementAnnotations(definition),
				_meta: oauthToolMeta(definition.scopes),
			},
			async (input) => callManagementTool(env, user, definition, input as Input),
		);
	}
}

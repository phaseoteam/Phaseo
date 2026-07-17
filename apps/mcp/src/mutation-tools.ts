import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	type AuthenticatedPhaseoUser,
	type PhaseoEnv,
	PhaseoApiError,
	requestPhaseo,
} from "./phaseo-api";

type MutationKind = "write" | "destructive" | "secret";
type MutationInput = Record<string, unknown>;
type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

type MutationToolDefinition = {
	name: string;
	title: string;
	description: string;
	scopes: readonly string[];
	kind: MutationKind;
	method: MutationMethod;
	inputSchema: z.ZodRawShape;
	path: (input: MutationInput) => string;
	body?: (input: MutationInput) => Record<string, unknown>;
};

const identifierSchema = z.string().trim().min(1).max(200);
const identifierListSchema = z.array(identifierSchema).min(1).max(100);
const confirmSchema = z.literal(true).describe("Set to true only after the user explicitly confirms this exact operation and its target values.");
const secretConfirmSchema = z.literal(true).describe("Set to true only after the user explicitly confirms creation or rotation and that a one-time secret may appear in this conversation.");
const httpsUrlSchema = z.string().url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS.");
const oauthRedirectSchema = z.string().url().refine((value) => {
	const url = new URL(value);
	return url.protocol === "https:" || (
		url.protocol === "http:" &&
		["127.0.0.1", "::1", "[::1]", "localhost"].includes(url.hostname)
	);
}, "Redirect URI must use HTTPS, except for loopback development callbacks.");
const jsonObjectSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
	if (Object.keys(value).length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field is required." });
	if (Object.keys(value).length > 100) context.addIssue({ code: z.ZodIssueCode.custom, message: "At most 100 fields are allowed." });
	if (JSON.stringify(value).length > 64 * 1024) context.addIssue({ code: z.ZodIssueCode.custom, message: "Payload must be at most 64 KiB." });
});

function encoded(value: unknown): string {
	return encodeURIComponent(String(value));
}

function optionalFields(input: MutationInput, mapping: Record<string, string>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [inputName, apiName] of Object.entries(mapping)) {
		if (input[inputName] !== undefined) result[apiName] = input[inputName];
	}
	return result;
}

export const MCP_WRITE_SCOPES = [
	"workspaces:write",
	"keys:write",
	"presets:write",
	"settings:write",
	"guardrails:write",
	"management_keys:write",
	"oauth_clients:write",
] as const;

export const MCP_DELETE_SCOPES = [
	"workspaces:delete",
	"keys:delete",
	"presets:delete",
	"guardrails:delete",
	"management_keys:delete",
	"oauth_clients:delete",
] as const;

const mutationTools: MutationToolDefinition[] = [
	{
		name: "api_key_create", title: "Create a Phaseo Gateway API key",
		description: "Create a Gateway API key and return its secret exactly once. Requires explicit confirmation of secret display.",
		scopes: ["keys:write"], kind: "secret", method: "POST", path: () => "/v1/keys",
		inputSchema: {
			name: z.string().trim().min(1).max(100), monthlyLimitUSD: z.number().nonnegative().nullable().optional(),
			limitReset: z.enum(["daily", "weekly", "monthly"]).default("monthly"), expiresAt: z.string().datetime().nullable().optional(),
			confirm: secretConfirmSchema,
		},
		body: (input) => ({ name: input.name, limit: input.monthlyLimitUSD, limit_reset: input.limitReset, expires_at: input.expiresAt }),
	},
	{
		name: "api_key_update", title: "Update a Phaseo Gateway API key",
		description: "Update the name, status, spend limit, reset period, or expiry of an existing Gateway API key.",
		scopes: ["keys:write"], kind: "write", method: "PATCH", path: ({ keyId }) => `/v1/keys/${encoded(keyId)}`,
		inputSchema: {
			keyId: identifierSchema, name: z.string().trim().min(1).max(100).optional(), disabled: z.boolean().optional(),
			monthlyLimitUSD: z.number().nonnegative().nullable().optional(), limitReset: z.enum(["daily", "weekly", "monthly"]).optional(),
			expiresAt: z.string().datetime().nullable().optional(), confirm: confirmSchema,
		},
		body: (input) => optionalFields(input, { name: "name", disabled: "disabled", monthlyLimitUSD: "limit", limitReset: "limit_reset", expiresAt: "expires_at" }),
	},
	{
		name: "api_key_delete", title: "Delete a Phaseo Gateway API key",
		description: "Permanently revoke and delete a Gateway API key. Existing applications using it will stop working.",
		scopes: ["keys:delete"], kind: "destructive", method: "DELETE", path: ({ keyId }) => `/v1/keys/${encoded(keyId)}`,
		inputSchema: { keyId: identifierSchema, confirm: confirmSchema },
	},
	{
		name: "workspace_create", title: "Create a Phaseo workspace",
		description: "Create a new Phaseo workspace for the authenticated user.",
		scopes: ["workspaces:write"], kind: "write", method: "POST", path: () => "/v1/workspaces",
		inputSchema: { name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(100).optional(), confirm: confirmSchema },
		body: (input) => optionalFields(input, { name: "name", slug: "slug" }),
	},
	{
		name: "workspace_update", title: "Update a Phaseo workspace",
		description: "Update a workspace name or slug.",
		scopes: ["workspaces:write"], kind: "write", method: "PATCH", path: ({ workspaceId }) => `/v1/workspaces/${encoded(workspaceId)}`,
		inputSchema: { workspaceId: identifierSchema, name: z.string().trim().min(1).max(100).optional(), slug: z.string().trim().min(1).max(100).optional(), confirm: confirmSchema },
		body: (input) => optionalFields(input, { name: "name", slug: "slug" }),
	},
	{
		name: "workspace_delete", title: "Delete a Phaseo workspace",
		description: "Delete a Phaseo workspace and its associated control-plane resources. This is destructive.",
		scopes: ["workspaces:delete"], kind: "destructive", method: "DELETE", path: ({ workspaceId }) => `/v1/workspaces/${encoded(workspaceId)}`,
		inputSchema: { workspaceId: identifierSchema, confirm: confirmSchema },
	},
	{
		name: "workspace_members_add", title: "Add Phaseo workspace members",
		description: "Add existing Phaseo users to a workspace with a selected role.",
		scopes: ["workspaces:write"], kind: "write", method: "POST", path: ({ workspaceId }) => `/v1/workspaces/${encoded(workspaceId)}/members/add`,
		inputSchema: { workspaceId: identifierSchema, userIds: identifierListSchema, role: z.enum(["member", "admin"]).default("member"), confirm: confirmSchema },
		body: ({ userIds, role }) => ({ user_ids: userIds, role }),
	},
	{
		name: "workspace_members_remove", title: "Remove Phaseo workspace members",
		description: "Remove users from a workspace. They will lose access to its resources.",
		scopes: ["workspaces:write"], kind: "destructive", method: "POST", path: ({ workspaceId }) => `/v1/workspaces/${encoded(workspaceId)}/members/remove`,
		inputSchema: { workspaceId: identifierSchema, userIds: identifierListSchema, confirm: confirmSchema },
		body: ({ userIds }) => ({ user_ids: userIds }),
	},
	{
		name: "preset_create", title: "Create a Phaseo routing preset",
		description: "Create a reusable routing preset in the authenticated workspace.",
		scopes: ["presets:write"], kind: "write", method: "POST", path: () => "/v1/presets",
		inputSchema: {
			name: z.string().trim().min(1).max(100), slug: z.string().trim().min(1).max(100).optional(),
			description: z.string().trim().max(500).optional(), visibility: z.enum(["private", "team", "public"]).optional(),
			configuration: z.record(z.string(), z.unknown()).default({}), confirm: confirmSchema,
		},
		body: (input) => ({ ...optionalFields(input, { name: "name", slug: "slug", description: "description", visibility: "visibility" }), config: input.configuration }),
	},
	{
		name: "preset_update", title: "Update a Phaseo routing preset",
		description: "Update a routing preset's metadata or configuration.",
		scopes: ["presets:write"], kind: "write", method: "PATCH", path: ({ presetId }) => `/v1/presets/${encoded(presetId)}`,
		inputSchema: { presetId: identifierSchema, changes: jsonObjectSchema, confirm: confirmSchema },
		body: ({ changes }) => changes as Record<string, unknown>,
	},
	{
		name: "preset_delete", title: "Delete a Phaseo routing preset",
		description: "Delete a routing preset from the authenticated workspace.",
		scopes: ["presets:delete"], kind: "destructive", method: "DELETE", path: ({ presetId }) => `/v1/presets/${encoded(presetId)}`,
		inputSchema: { presetId: identifierSchema, confirm: confirmSchema },
	},
	{
		name: "settings_update", title: "Update Phaseo workspace settings",
		description: "Update supported routing, privacy, provider, and gateway settings for the authenticated workspace.",
		scopes: ["settings:write"], kind: "write", method: "PATCH", path: () => "/v1/settings",
		inputSchema: { changes: jsonObjectSchema, confirm: confirmSchema }, body: ({ changes }) => changes as Record<string, unknown>,
	},
	{
		name: "guardrail_create", title: "Create a Phaseo guardrail",
		description: "Create a guardrail policy in the authenticated workspace.",
		scopes: ["guardrails:write"], kind: "write", method: "POST", path: () => "/v1/guardrails",
		inputSchema: { name: z.string().trim().min(1).max(100), configuration: z.record(z.string(), z.unknown()).default({}), confirm: confirmSchema },
		body: ({ name, configuration }) => ({ ...(configuration as Record<string, unknown>), name }),
	},
	{
		name: "guardrail_update", title: "Update a Phaseo guardrail",
		description: "Update a guardrail policy's supported fields.",
		scopes: ["guardrails:write"], kind: "write", method: "PATCH", path: ({ guardrailId }) => `/v1/guardrails/${encoded(guardrailId)}`,
		inputSchema: { guardrailId: identifierSchema, changes: jsonObjectSchema, confirm: confirmSchema }, body: ({ changes }) => changes as Record<string, unknown>,
	},
	{
		name: "guardrail_delete", title: "Delete a Phaseo guardrail",
		description: "Delete a guardrail and remove its assignments.",
		scopes: ["guardrails:delete"], kind: "destructive", method: "DELETE", path: ({ guardrailId }) => `/v1/guardrails/${encoded(guardrailId)}`,
		inputSchema: { guardrailId: identifierSchema, confirm: confirmSchema },
	},
	{
		name: "guardrail_keys_add", title: "Assign keys to a Phaseo guardrail",
		description: "Add Gateway API key assignments to a guardrail.",
		scopes: ["guardrails:write"], kind: "write", method: "POST", path: ({ guardrailId }) => `/v1/guardrails/${encoded(guardrailId)}/keys/add`,
		inputSchema: { guardrailId: identifierSchema, keyIds: identifierListSchema, confirm: confirmSchema }, body: ({ keyIds }) => ({ key_ids: keyIds }),
	},
	{
		name: "guardrail_keys_remove", title: "Remove keys from a Phaseo guardrail",
		description: "Remove Gateway API key assignments from a guardrail.",
		scopes: ["guardrails:write"], kind: "destructive", method: "POST", path: ({ guardrailId }) => `/v1/guardrails/${encoded(guardrailId)}/keys/remove`,
		inputSchema: { guardrailId: identifierSchema, keyIds: identifierListSchema, confirm: confirmSchema }, body: ({ keyIds }) => ({ key_ids: keyIds }),
	},
	{
		name: "guardrail_members_add", title: "Assign members to a Phaseo guardrail",
		description: "Add workspace member assignments to a guardrail.",
		scopes: ["guardrails:write"], kind: "write", method: "POST", path: ({ guardrailId }) => `/v1/guardrails/${encoded(guardrailId)}/members/add`,
		inputSchema: { guardrailId: identifierSchema, userIds: identifierListSchema, confirm: confirmSchema }, body: ({ userIds }) => ({ user_ids: userIds }),
	},
	{
		name: "guardrail_members_remove", title: "Remove members from a Phaseo guardrail",
		description: "Remove workspace member assignments from a guardrail.",
		scopes: ["guardrails:write"], kind: "destructive", method: "POST", path: ({ guardrailId }) => `/v1/guardrails/${encoded(guardrailId)}/members/remove`,
		inputSchema: { guardrailId: identifierSchema, userIds: identifierListSchema, confirm: confirmSchema }, body: ({ userIds }) => ({ user_ids: userIds }),
	},
	{
		name: "management_key_create", title: "Create a Phaseo management key",
		description: "Create a scoped management API key and return its secret exactly once.",
		scopes: ["management_keys:write"], kind: "secret", method: "POST", path: () => "/v1/management-keys",
		inputSchema: {
			name: z.string().trim().min(1).max(100), template: z.enum(["raycast-readonly", "read-only", "read-write", "full-control"]).optional(),
			scopes: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(), expiresAt: z.string().datetime().nullable().optional(),
			paused: z.boolean().optional(), confirm: secretConfirmSchema,
		},
		body: (input) => optionalFields(input, { name: "name", template: "template", scopes: "scopes", expiresAt: "expires_at", paused: "paused" }),
	},
	{
		name: "management_key_update", title: "Update a Phaseo management key",
		description: "Update a management key's name, template, scopes, expiry, or paused state.",
		scopes: ["management_keys:write"], kind: "write", method: "PATCH", path: ({ keyId }) => `/v1/management-keys/${encoded(keyId)}`,
		inputSchema: { keyId: identifierSchema, changes: jsonObjectSchema, confirm: confirmSchema }, body: ({ changes }) => changes as Record<string, unknown>,
	},
	{
		name: "management_key_delete", title: "Delete a Phaseo management key",
		description: "Revoke and delete a management API key.",
		scopes: ["management_keys:delete"], kind: "destructive", method: "DELETE", path: ({ keyId }) => `/v1/management-keys/${encoded(keyId)}`,
		inputSchema: { keyId: identifierSchema, confirm: confirmSchema },
	},
	{
		name: "oauth_public_client_create", title: "Create a public Phaseo OAuth client",
		description: "Register a public PKCE OAuth application. Public clients do not receive a client secret.",
		scopes: ["oauth_clients:write"], kind: "write", method: "POST", path: () => "/v1/oauth-clients",
		inputSchema: {
			name: z.string().trim().min(3).max(100), redirectUris: z.array(oauthRedirectSchema).min(1).max(10),
			allowedScopes: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(), description: z.string().max(500).optional(),
			homepageUrl: httpsUrlSchema.optional(), logoUrl: httpsUrlSchema.optional(), privacyPolicyUrl: httpsUrlSchema.optional(),
			termsOfServiceUrl: httpsUrlSchema.optional(), confirm: confirmSchema,
		},
		body: (input) => ({
			name: input.name, client_type: "public", redirect_uris: input.redirectUris, allowed_scopes: input.allowedScopes,
			description: input.description, homepage_url: input.homepageUrl, logo_url: input.logoUrl,
			privacy_policy_url: input.privacyPolicyUrl, terms_of_service_url: input.termsOfServiceUrl,
		}),
	},
	{
		name: "oauth_confidential_client_create", title: "Create a confidential Phaseo OAuth client",
		description: "Register a confidential OAuth application and return its client secret exactly once.",
		scopes: ["oauth_clients:write"], kind: "secret", method: "POST", path: () => "/v1/oauth-clients",
		inputSchema: {
			name: z.string().trim().min(3).max(100), redirectUris: z.array(oauthRedirectSchema).min(1).max(10),
			allowedScopes: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(), description: z.string().max(500).optional(),
			homepageUrl: httpsUrlSchema.optional(), logoUrl: httpsUrlSchema.optional(), privacyPolicyUrl: httpsUrlSchema.optional(),
			termsOfServiceUrl: httpsUrlSchema.optional(), confirm: secretConfirmSchema,
		},
		body: (input) => ({
			name: input.name, client_type: "confidential", redirect_uris: input.redirectUris, allowed_scopes: input.allowedScopes,
			description: input.description, homepage_url: input.homepageUrl, logo_url: input.logoUrl,
			privacy_policy_url: input.privacyPolicyUrl, terms_of_service_url: input.termsOfServiceUrl,
		}),
	},
	{
		name: "oauth_client_update", title: "Update a Phaseo OAuth client",
		description: "Update an OAuth application's name, redirect URIs, scopes, or public metadata.",
		scopes: ["oauth_clients:write"], kind: "write", method: "PATCH", path: ({ clientId }) => `/v1/oauth-clients/${encoded(clientId)}`,
		inputSchema: { clientId: identifierSchema, changes: jsonObjectSchema, confirm: confirmSchema }, body: ({ changes }) => changes as Record<string, unknown>,
	},
	{
		name: "oauth_client_secret_regenerate", title: "Regenerate a Phaseo OAuth client secret",
		description: "Invalidate the existing client secret and return a replacement exactly once. Existing integrations must be updated.",
		scopes: ["oauth_clients:write"], kind: "secret", method: "POST", path: ({ clientId }) => `/v1/oauth-clients/${encoded(clientId)}/regenerate-secret`,
		inputSchema: { clientId: identifierSchema, confirm: secretConfirmSchema }, body: () => ({}),
	},
	{
		name: "oauth_client_delete", title: "Delete a Phaseo OAuth client",
		description: "Delete an OAuth application and revoke its future authorization capability.",
		scopes: ["oauth_clients:delete"], kind: "destructive", method: "DELETE", path: ({ clientId }) => `/v1/oauth-clients/${encoded(clientId)}`,
		inputSchema: { clientId: identifierSchema, confirm: confirmSchema },
	},
	{
		name: "webhook_endpoint_create", title: "Create a Phaseo webhook endpoint",
		description: "Create an async webhook endpoint and return its signing secret exactly once. Available only with Batch API access.",
		scopes: ["settings:write"], kind: "secret", method: "POST", path: () => "/v1/webhook-endpoints",
		inputSchema: {
			name: z.string().trim().min(1).max(120).default("Async webhooks"), url: httpsUrlSchema,
			events: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(), confirm: secretConfirmSchema,
		},
		body: ({ name, url, events }) => ({ name, url, events }),
	},
	{
		name: "webhook_endpoint_update", title: "Update a Phaseo webhook endpoint",
		description: "Update a webhook endpoint's name, URL, events, or active state.",
		scopes: ["settings:write"], kind: "write", method: "PATCH", path: ({ endpointId }) => `/v1/webhook-endpoints/${encoded(endpointId)}`,
		inputSchema: { endpointId: identifierSchema, changes: jsonObjectSchema, confirm: confirmSchema }, body: ({ changes }) => changes as Record<string, unknown>,
	},
	{
		name: "webhook_endpoint_secret_rotate", title: "Rotate a Phaseo webhook signing secret",
		description: "Invalidate the current webhook signing secret and return a replacement exactly once.",
		scopes: ["settings:write"], kind: "secret", method: "POST", path: ({ endpointId }) => `/v1/webhook-endpoints/${encoded(endpointId)}/rotate-secret`,
		inputSchema: { endpointId: identifierSchema, confirm: secretConfirmSchema }, body: () => ({}),
	},
	{
		name: "webhook_endpoint_delete", title: "Delete a Phaseo webhook endpoint",
		description: "Delete a webhook endpoint so Phaseo stops delivering events to it.",
		scopes: ["settings:write"], kind: "destructive", method: "DELETE", path: ({ endpointId }) => `/v1/webhook-endpoints/${encoded(endpointId)}`,
		inputSchema: { endpointId: identifierSchema, confirm: confirmSchema },
	},
];

export const MCP_MUTATION_TOOL_NAMES = mutationTools.map(({ name }) => name);

function enabled(env: PhaseoEnv, kind: MutationKind): boolean {
	const writesEnabled = env.PHASEO_MCP_WRITE_TOOLS_ENABLED?.trim().toLowerCase() === "true";
	if (!writesEnabled) return false;
	if (kind === "destructive") return env.PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED?.trim().toLowerCase() === "true";
	if (kind === "secret") return env.PHASEO_MCP_SECRET_TOOLS_ENABLED?.trim().toLowerCase() === "true";
	return true;
}

function hasScopes(user: AuthenticatedPhaseoUser, scopes: readonly string[]): boolean {
	return scopes.every((scope) => user.scopes.includes(scope));
}

function oauthToolMeta(scopes: readonly string[]) {
	return { securitySchemes: [{ type: "oauth2", scopes: [...scopes] }] };
}

function errorResult(error: unknown) {
	const message = error instanceof PhaseoApiError ? error.message : "Phaseo could not complete this mutation.";
	return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

export function registerMutationTools(server: McpServer, env: PhaseoEnv, user: AuthenticatedPhaseoUser): void {
	for (const definition of mutationTools) {
		if (!enabled(env, definition.kind) || !hasScopes(user, definition.scopes)) continue;
		server.registerTool(
			definition.name,
			{
				title: definition.title,
				description: `${definition.description} Call only after the user explicitly confirms the exact operation.`,
				inputSchema: definition.inputSchema,
				outputSchema: { result: z.record(z.string(), z.unknown()) },
				annotations: {
					readOnlyHint: false,
					destructiveHint: definition.kind === "destructive",
					idempotentHint: definition.method === "DELETE" || definition.method === "PATCH",
					openWorldHint: true,
				},
				_meta: oauthToolMeta(definition.scopes),
			},
			async (input) => {
				try {
					const body = definition.body?.(input);
					if (definition.method === "PATCH" && body && Object.keys(body).length === 0) {
						return {
							isError: true as const,
							content: [{ type: "text" as const, text: "At least one supported field must be provided for an update." }],
						};
					}
					const result = await requestPhaseo<Record<string, unknown>>(env, definition.path(input), {
						method: definition.method,
						credentials: { accessToken: user.accessToken },
						...(body ? { body } : {}),
					});
					return {
						content: [{ type: "text" as const, text: `${definition.title} completed successfully.` }],
						structuredContent: { result },
					};
				} catch (error) {
					return errorResult(error);
				}
			},
		);
	}
}

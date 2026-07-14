export type OAuthScopeOption = {
	value: string;
	label: string;
	description: string;
	group: "Identity" | "Read" | "Write" | "Delete";
};

export const DEFAULT_THIRD_PARTY_OAUTH_SCOPES = [
	"openid",
	"profile",
	"email",
	"me:read",
	"workspaces:read",
	"models:read",
	"providers:read",
	"pricing:read",
] as const;

export const OAUTH_SCOPE_OPTIONS: OAuthScopeOption[] = [
	{ value: "openid", label: "Confirm identity", description: "Verify the signed-in account.", group: "Identity" },
	{ value: "profile", label: "Read profile", description: "Read the user's basic profile.", group: "Identity" },
	{ value: "email", label: "Read email", description: "Read the user's email address.", group: "Identity" },
	{ value: "me:read", label: "Read current account", description: "Inspect the current user and workspace context.", group: "Read" },
	{ value: "models:read", label: "Read models", description: "Inspect the model catalogue.", group: "Read" },
	{ value: "providers:read", label: "Read providers", description: "Inspect provider availability and metadata.", group: "Read" },
	{ value: "pricing:read", label: "Read pricing", description: "Inspect pricing and cost reference data.", group: "Read" },
	{ value: "credits:read", label: "Read credits", description: "Read workspace credit balances.", group: "Read" },
	{ value: "activity:read", label: "Read activity", description: "Inspect recent workspace activity.", group: "Read" },
	{ value: "analytics:read", label: "Read analytics", description: "View analytics and usage reporting.", group: "Read" },
	{ value: "generations:read", label: "Read generations", description: "Inspect generation history and metadata.", group: "Read" },
	{ value: "workspaces:read", label: "Read workspaces", description: "List workspaces and their metadata.", group: "Read" },
	{ value: "keys:read", label: "Read API keys", description: "List API-key metadata.", group: "Read" },
	{ value: "presets:read", label: "Read presets", description: "Inspect saved routing and prompt presets.", group: "Read" },
	{ value: "settings:read", label: "Read settings", description: "Inspect workspace settings.", group: "Read" },
	{ value: "guardrails:read", label: "Read guardrails", description: "Inspect guardrail configuration.", group: "Read" },
	{ value: "management_keys:read", label: "Read management keys", description: "Inspect management-key metadata.", group: "Read" },
	{ value: "oauth_clients:read", label: "Read OAuth apps", description: "Inspect OAuth client configuration.", group: "Read" },
	{ value: "workspaces:write", label: "Manage workspaces", description: "Create or update workspaces.", group: "Write" },
	{ value: "keys:write", label: "Manage API keys", description: "Create or update API keys.", group: "Write" },
	{ value: "presets:write", label: "Manage presets", description: "Create or update presets.", group: "Write" },
	{ value: "settings:write", label: "Manage settings", description: "Change workspace settings.", group: "Write" },
	{ value: "guardrails:write", label: "Manage guardrails", description: "Create or update guardrails.", group: "Write" },
	{ value: "management_keys:write", label: "Manage management keys", description: "Create or update management keys.", group: "Write" },
	{ value: "oauth_clients:write", label: "Manage OAuth apps", description: "Create or update OAuth apps.", group: "Write" },
	{ value: "workspaces:delete", label: "Delete workspaces", description: "Permanently delete workspaces.", group: "Delete" },
	{ value: "keys:delete", label: "Delete API keys", description: "Permanently delete API keys.", group: "Delete" },
	{ value: "presets:delete", label: "Delete presets", description: "Permanently delete presets.", group: "Delete" },
	{ value: "guardrails:delete", label: "Delete guardrails", description: "Permanently delete guardrails.", group: "Delete" },
	{ value: "management_keys:delete", label: "Delete management keys", description: "Permanently delete management keys.", group: "Delete" },
	{ value: "oauth_clients:delete", label: "Delete OAuth apps", description: "Permanently delete OAuth apps.", group: "Delete" },
];

export function normalizeOAuthScopes(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(new Set(value.map((scope) => String(scope).trim()).filter(Boolean)));
}

export function oauthScopeLabel(scope: string): string {
	return OAUTH_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope;
}

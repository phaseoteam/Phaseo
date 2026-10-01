export type OAuthScopeOption = {
	value: string;
	group: "Identity" | "Access" | "Read" | "Write" | "Delete";
};

export const DEFAULT_THIRD_PARTY_OAUTH_SCOPES = [
	"openid",
	"profile",
	"email",
	"gateway:access",
	"me:read",
	"workspaces:read",
	"models:read",
	"providers:read",
	"pricing:read",
] as const;

export const OAUTH_SCOPE_OPTIONS: OAuthScopeOption[] = [
	{ value: "openid", group: "Identity" },
	{ value: "profile", group: "Identity" },
	{ value: "email", group: "Identity" },
	{ value: "gateway:access", group: "Access" },
	{ value: "me:read", group: "Read" },
	{ value: "models:read", group: "Read" },
	{ value: "providers:read", group: "Read" },
	{ value: "pricing:read", group: "Read" },
	{ value: "credits:read", group: "Read" },
	{ value: "activity:read", group: "Read" },
	{ value: "analytics:read", group: "Read" },
	{ value: "generations:read", group: "Read" },
	{ value: "feedback:read", group: "Read" },
	{ value: "workspaces:read", group: "Read" },
	{ value: "keys:read", group: "Read" },
	{ value: "presets:read", group: "Read" },
	{ value: "settings:read", group: "Read" },
	{ value: "provider_credentials:read", group: "Read" },
	{ value: "guardrails:read", group: "Read" },
	{ value: "budgets:read", group: "Read" },
	{ value: "management_keys:read", group: "Read" },
	{ value: "oauth_clients:read", group: "Read" },
	{ value: "workspaces:write", group: "Write" },
	{ value: "keys:write", group: "Write" },
	{ value: "presets:write", group: "Write" },
	{ value: "settings:write", group: "Write" },
	{ value: "provider_credentials:write", group: "Write" },
	{ value: "guardrails:write", group: "Write" },
	{ value: "budgets:write", group: "Write" },
	{ value: "management_keys:write", group: "Write" },
	{ value: "oauth_clients:write", group: "Write" },
	{ value: "feedback:write", group: "Write" },
	{ value: "workspaces:delete", group: "Delete" },
	{ value: "keys:delete", group: "Delete" },
	{ value: "presets:delete", group: "Delete" },
	{ value: "provider_credentials:delete", group: "Delete" },
	{ value: "guardrails:delete", group: "Delete" },
	{ value: "budgets:delete", group: "Delete" },
	{ value: "management_keys:delete", group: "Delete" },
	{ value: "oauth_clients:delete", group: "Delete" },
];

export function normalizeOAuthScopes(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(new Set(value.map((scope) => String(scope).trim()).filter(Boolean)));
}

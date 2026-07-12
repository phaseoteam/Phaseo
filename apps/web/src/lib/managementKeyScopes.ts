export type ManagementKeyTemplate = "raycast-readonly" | "read-only" | "read-write" | "full-control";

export const CONTROL_SCOPES = [
	"me:read", "models:read", "providers:read", "pricing:read", "credits:read", "activity:read", "analytics:read", "generations:read",
	"workspaces:read", "workspaces:write", "workspaces:delete", "keys:read", "keys:write", "keys:delete",
	"presets:read", "presets:write", "presets:delete", "settings:read", "settings:write",
	"guardrails:read", "guardrails:write", "guardrails:delete", "management_keys:read", "management_keys:write", "management_keys:delete",
	"oauth_clients:read", "oauth_clients:write", "oauth_clients:delete",
] as const;

export const MANAGEMENT_KEY_TEMPLATE_SCOPES: Record<ManagementKeyTemplate, string[]> = {
	"raycast-readonly": ["credits:read", "activity:read", "analytics:read"],
	"read-only": CONTROL_SCOPES.filter((scope) => scope.endsWith(":read")),
	"read-write": CONTROL_SCOPES.filter((scope) => /:(read|write)$/.test(scope)),
	"full-control": [...CONTROL_SCOPES],
};

export function managementKeyScopes(template: ManagementKeyTemplate): string[] {
	return [...MANAGEMENT_KEY_TEMPLATE_SCOPES[template]];
}

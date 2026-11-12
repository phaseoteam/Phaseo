import { GATEWAY_ACCESS_SCOPE } from "@/lib/authz/capabilities";

export const PHASEO_MCP_RESOURCE = "https://mcp.phaseo.app/mcp";

// Read-only scopes used by the Phaseo MCP's catalogue and usage tools.
export const RESOURCE_BOUND_MCP_SCOPES = [
	"models:read",
	"providers:read",
	"pricing:read",
	"credits:read",
	"activity:read",
	"analytics:read",
	"generations:read",
] as const;

// Account management through the Phaseo MCP. Never a default: a client must
// name these scopes itself (the MCP's "manage" connection URL does), and the
// consent screen lists each one so the user can untick any of them.
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

const MCP_MANAGEMENT_CHANGE_SCOPE_SET = new Set<string>(
	MCP_MANAGEMENT_SCOPES.filter((scope) => !scope.endsWith(":read")),
);
const MCP_ONLY_SCOPE_SET = new Set<string>([
	...RESOURCE_BOUND_MCP_SCOPES,
	GATEWAY_ACCESS_SCOPE,
	...MCP_MANAGEMENT_SCOPES,
]);

export function isMcpManagementChangeScope(scope: string): boolean {
	return MCP_MANAGEMENT_CHANGE_SCOPE_SET.has(scope);
}

/**
 * A dynamically registered client may hold management write or delete scopes
 * only on a token bound to the Phaseo MCP resource, and only when every scope
 * is one the MCP uses. A resource-bound key cannot call /v1 directly; the MCP
 * reaches the API through its token exchange. Returns true when a request,
 * grant or token breaks that rule, whatever the client's stored allowlist says.
 */
export function violatesMcpManagementBinding(
	registrationSource: string | undefined,
	resource: string | null | undefined,
	scopes: readonly string[],
): boolean {
	if (registrationSource !== "dynamic") return false;
	if (!scopes.some(isMcpManagementChangeScope)) return false;
	return resource !== PHASEO_MCP_RESOURCE || !scopes.every((scope) => MCP_ONLY_SCOPE_SET.has(scope));
}

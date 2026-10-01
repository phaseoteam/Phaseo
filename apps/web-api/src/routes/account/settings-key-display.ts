// Explicit display DTO: new credential columns must never leak through SELECT *.
const DISPLAY_FIELDS = [
	"id", "workspace_id", "name", "prefix", "suffix", "status", "scopes", "created_by",
	"created_at", "updated_at", "last_used_at", "expires_at", "revoked_at", "revoked_reason",
	"soft_blocked", "daily_limit_requests", "weekly_limit_requests", "monthly_limit_requests",
	"daily_limit_cost_nanos", "weekly_limit_cost_nanos", "monthly_limit_cost_nanos",
	"key_kind", "oauth_client_id", "oauth_user_id", "oauth_scopes", "issued_via", "oauth_resource",
	"guardrails", "usage",
] as const;

export function keyDisplayData(row: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(DISPLAY_FIELDS.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

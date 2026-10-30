// Only display metadata may enter the short-lived settings cache. In particular,
// creation/rotation responses and future credential columns must never enter it.
const APP_FIELDS = [
	"id", "client_id", "workspace_id", "name", "description", "logo_url", "homepage_url",
	"status", "allowed_scopes", "redirect_uris", "created_at", "updated_at",
	"active_authorizations", "requests_last_30d", "last_used_at",
] as const;

export function oauthAppDisplay(row: Record<string, unknown>) {
	return Object.fromEntries(APP_FIELDS.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

export function oauthAuthorizationDisplay(row: Record<string, unknown>) {
	const user = row.users as Record<string, unknown> | null;
	const team = row.teams as Record<string, unknown> | null;
	return {
		id: row.id,
		last_used_at: row.last_used_at,
		users: user ? { full_name: user.full_name, email: user.email } : null,
		teams: team ? { name: team.name } : null,
	};
}

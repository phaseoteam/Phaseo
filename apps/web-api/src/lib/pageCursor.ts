// Purpose: Validate keyset page cursors before they go into PostgREST filter strings.
// Why: `.or()` filters are text; a cursor with commas or parentheses could add conditions to the filter.
// How: Accept only an ISO timestamp (as PostgREST returns created_at) and a UUID row id.

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A `{ createdAt, id }` cursor whose parts are safe to place in a filter, or null. */
export function validPageCursor(value: { createdAt?: unknown; id?: unknown } | null | undefined): { createdAt: string; id: string } | null {
	const createdAt = typeof value?.createdAt === "string" ? value.createdAt : "";
	const id = typeof value?.id === "string" ? value.id : "";
	return TIMESTAMP.test(createdAt) && Number.isFinite(Date.parse(createdAt)) && UUID.test(id) ? { createdAt, id } : null;
}

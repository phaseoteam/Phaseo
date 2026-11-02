import type { getDataClient } from "@/data/supabase";
import type { WorkItemRelation, WorkItemRelationRow, WorkItemState, WorkRelationDirection, WorkRelationKind } from "./types";

// Links between work items. Each relation is stored once (item_id blocks related_item_id, or the
// two are related) and read from both ends: "blocked by" is the reverse of "blocks".

type DataClient = ReturnType<typeof getDataClient>;

export const RELATION_COLUMNS = "id,workspace_id,item_id,related_item_id,kind,created_by,created_at";
const MAX_RELATIONS = 200;

type Other = { id?: string; number?: number | null; title?: string | null; state?: WorkItemState | null } | null;
type RelationWithItems = WorkItemRelationRow & { item?: Other; related?: Other };

/** How a stored relation reads from `itemId`'s side. */
export function relationDirection(row: Pick<WorkItemRelationRow, "item_id" | "kind">, itemId: string): WorkRelationDirection {
	if (row.kind === "related") return "related";
	return row.item_id === itemId ? "blocks" : "blocked_by";
}

export function formatRelation(row: RelationWithItems, itemId: string): WorkItemRelation {
	const outgoing = row.item_id === itemId;
	const other = outgoing ? row.related : row.item;
	return {
		id: row.id,
		kind: row.kind,
		direction: relationDirection(row, itemId),
		otherItemId: outgoing ? row.related_item_id : row.item_id,
		otherNumber: other?.number ?? null,
		otherTitle: other?.title ?? null,
		otherState: other?.state ?? null,
		createdAt: row.created_at,
	};
}

const WITH_ITEMS = `${RELATION_COLUMNS},item:work_items!work_item_relations_item_id_fkey(id,number,title,state),related:work_items!work_item_relations_related_item_id_fkey(id,number,title,state)`;

/** Every relation touching an item, from its side (two queries: outgoing and incoming). */
export async function loadRelations(client: DataClient, workspaceId: string, itemId: string): Promise<WorkItemRelation[]> {
	const [outgoing, incoming] = await Promise.all([
		client.from("work_item_relations").select(WITH_ITEMS).eq("workspace_id", workspaceId).eq("item_id", itemId).order("created_at", { ascending: true }).limit(MAX_RELATIONS),
		client.from("work_item_relations").select(WITH_ITEMS).eq("workspace_id", workspaceId).eq("related_item_id", itemId).order("created_at", { ascending: true }).limit(MAX_RELATIONS),
	]);
	if (outgoing.error || incoming.error) throw new Error(`work_item_relations read failed: ${(outgoing.error ?? incoming.error)!.message}`);
	return [...(outgoing.data ?? []), ...(incoming.data ?? [])].map((row) => formatRelation(row as unknown as RelationWithItems, itemId));
}

/**
 * The stored form of a relation asked for from `itemId`'s side: "blocked_by" is stored as the other
 * item blocking this one.
 */
export function storedRelation(itemId: string, otherId: string, kind: WorkRelationKind | "blocked_by"): { item_id: string; related_item_id: string; kind: WorkRelationKind } {
	if (kind === "blocked_by") return { item_id: otherId, related_item_id: itemId, kind: "blocks" };
	return { item_id: itemId, related_item_id: otherId, kind };
}

/** Whether the same link already exists in either direction (related is symmetric; blocks either way conflicts). */
export async function relationExists(client: DataClient, workspaceId: string, a: string, b: string): Promise<{ kind: WorkRelationKind; itemId: string } | null> {
	const { data, error } = await client.from("work_item_relations").select("kind,item_id")
		.eq("workspace_id", workspaceId)
		.or(`and(item_id.eq.${a},related_item_id.eq.${b}),and(item_id.eq.${b},related_item_id.eq.${a})`)
		.limit(2);
	if (error) throw new Error(`work_item_relations read failed: ${error.message}`);
	const row = (data ?? [])[0] as { kind: WorkRelationKind; item_id: string } | undefined;
	return row ? { kind: row.kind, itemId: row.item_id } : null;
}

/** Open items blocking this one (count query; blockers done or cancelled no longer block). */
export async function countOpenBlockers(client: DataClient, workspaceId: string, itemId: string): Promise<number> {
	const { count, error } = await client.from("work_item_relations")
		.select("id,blocker:work_items!work_item_relations_item_id_fkey!inner(state)", { count: "exact", head: true })
		.eq("workspace_id", workspaceId).eq("related_item_id", itemId).eq("kind", "blocks")
		.not("blocker.state", "in", "(done,cancelled)");
	if (error) throw new Error(`work_item_relations count failed: ${error.message}`);
	return count ?? 0;
}

/**
 * Ids of items that have at least one open blocker, for the blocked=true filter. Bounded: at most
 * `limit` relations are read; the filter is applied to the page query with `in`.
 */
export async function blockedItemIds(client: DataClient, workspaceId: string, limit = 1000): Promise<string[]> {
	const { data, error } = await client.from("work_item_relations")
		.select("related_item_id,blocker:work_items!work_item_relations_item_id_fkey!inner(state)")
		.eq("workspace_id", workspaceId).eq("kind", "blocks")
		.not("blocker.state", "in", "(done,cancelled)")
		.limit(limit);
	if (error) throw new Error(`work_item_relations read failed: ${error.message}`);
	return [...new Set((data ?? []).map((row: any) => String(row.related_item_id)))];
}

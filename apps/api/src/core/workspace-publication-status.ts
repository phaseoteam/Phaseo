import { z } from "zod";
import { getSupabaseAdmin } from "@/runtime/env";

const timestamp = z.string().datetime({ offset: true });
const rowSchema = z.object({
    workspace_id: z.uuid(),
    attempts: z.number().int().min(0).max(10),
    created_at: timestamp,
    available_at: timestamp,
    lease_until: timestamp.nullable(),
});

/** Operator-only point lookup. A missing intent does not prove cache freshness. */
export async function readWorkspacePublicationStatus(workspaceId: string, now = Date.now()) {
    if (!z.uuid().safeParse(workspaceId).success) throw new Error("invalid_workspace_id");
    const { data, error } = await getSupabaseAdmin()
        .from("gateway_workspace_publications")
        .select("workspace_id,attempts,created_at,available_at,lease_until")
        .eq("workspace_id", workspaceId)
        .retry(false)
        .maybeSingle();
    if (error) throw new Error("workspace_publication_status_unavailable");
    if (data === null) return { state: "not_pending" as const };
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success || parsed.data.workspace_id.toLowerCase() !== workspaceId.toLowerCase()) {
        throw new Error("workspace_publication_status_unavailable");
    }
    const row = parsed.data;
    // The tenth attempt still has an opportunity to finish until its lease expires.
    const state = row.lease_until && Date.parse(row.lease_until) > now ? "leased"
        : row.attempts >= 10 ? "exhausted"
        : Date.parse(row.available_at) > now ? "backoff" : "pending";
    return { state, attempts: row.attempts, createdAt: row.created_at,
        availableAt: row.available_at, leaseUntil: row.lease_until };
}

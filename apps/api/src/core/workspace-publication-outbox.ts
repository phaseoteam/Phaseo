import { z } from "zod";
import { getSupabaseAdmin } from "@/runtime/env";

const claimSchema = z.object({ workspace_id: z.uuid(), revision: z.uuid(), lease_id: z.uuid() });
type Claim = z.infer<typeof claimSchema>;
const resultSchema = z.enum(["completed", "superseded", "retry", "exhausted", "lost"]);

async function claim(limit: number, workspaceId: string | null) {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_claim_workspace_publications", {
        p_limit: limit, p_workspace_id: workspaceId,
    });
    if (error) throw new Error("workspace_publication_claim_failed");
    const parsed = z.array(claimSchema).max(limit).safeParse(data);
    if (!parsed.success || (workspaceId && parsed.data.some(row => row.workspace_id !== workspaceId))) {
        throw new Error("workspace_publication_claim_invalid");
    }
    return parsed.data;
}

async function finish(row: Claim, success: boolean) {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_finish_workspace_publication", {
        p_workspace_id: row.workspace_id, p_revision: row.revision, p_lease_id: row.lease_id, p_success: success,
    });
    const result = resultSchema.safeParse(data);
    if (error || !result.success) throw new Error("workspace_publication_ack_failed");
    return result.data;
}

async function publishClaim<T>(row: Claim, publish: (workspaceId: string) => Promise<T>) {
    let value: T;
    try { value = await publish(row.workspace_id); }
    catch { return { state: await finish(row, false) }; }
    // No acknowledgement until both dependent data and its marker were written.
    return { state: await finish(row, true), value };
}

/** Control-plane only. Source triggers already committed the retry intent;
 * explicitly requested invalidations are enqueued by the claim RPC as well. */
export async function publishDurableWorkspaceMutation<T>(workspaceId: string, publish: (id: string) => Promise<T>): Promise<T> {
    const [row] = await claim(1, workspaceId);
    if (!row) throw new Error("workspace_publication_pending");
    const result = await publishClaim(row, publish);
    if (result.state !== "completed" || !("value" in result)) throw new Error("workspace_publication_pending");
    return result.value as T;
}

/** One bounded batch per scheduler tick. Empty queues do not touch KV/DOs. */
export async function drainWorkspacePublications(publish: (id: string) => Promise<unknown>) {
    const rows = await claim(25, null);
    const summary = { claimed: rows.length, published: 0, pending: 0, failed: 0, exhausted: 0 };
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
        while (index < rows.length) {
            const row = rows[index++];
            try {
                const result = await publishClaim(row, publish);
                if (result.state === "completed") summary.published++;
                else if (result.state === "superseded" || result.state === "lost") summary.pending++;
                else { summary.failed++; if (result.state === "exhausted") summary.exhausted++; }
            } catch { summary.failed++; } // Expired leases remain recoverable after process/ack loss.
        }
    }));
    return summary;
}

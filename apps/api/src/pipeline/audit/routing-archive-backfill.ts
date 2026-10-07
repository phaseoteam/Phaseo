import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { writeRoutingArchive } from "./routing-archive";

type ArchiveSource = {
    id: string; created_at: string; workspace_id: string; request_id: string;
    source_hash: string; metadata: unknown; routing_trace: unknown; routing_decisions: unknown[];
};

export async function backfillRoutingArchives() {
    const env = getBindings();
    const cutoff = env.GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF;
    if (!cutoff) return { archived: 0, bytes: 0, complete: false };
    if (!Number.isFinite(Date.parse(cutoff))) throw new Error("routing_archive_cutoff_invalid");
    const bucket = env.GATEWAY_IO_LOGS_BUCKET;
    if (!bucket) throw new Error("routing_archive_bucket_missing");
    const key = `routing-archive-backfill/v1/${new Date(cutoff).toISOString()}`;
    const cursor = await env.GATEWAY_CACHE.get<{ id: string; created_at: string; complete?: boolean }>(key, "json");
    if (cursor?.complete) return { archived: 0, bytes: 0, complete: true };
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("gateway_routing_archive_batch", {
        p_after_id: cursor?.id ?? "00000000-0000-0000-0000-000000000000",
        p_after_created_at: cursor?.created_at ?? "1970-01-01T00:00:00Z",
        p_cutoff: cutoff,
        p_limit: 25,
    });
    if (error) throw new Error(`routing_archive_batch_failed:${error.code ?? "unknown"}`);
    const rows = (data ?? []) as ArchiveSource[];
    const summary = { archived: 0, bytes: 0, complete: rows.length === 0 };
    for (const row of rows) {
        const reference = await writeRoutingArchive(bucket, row.workspace_id, row.request_id, {
            metadata: row.metadata, routing_trace: row.routing_trace, routing_decisions: row.routing_decisions,
        });
        // Historical SQL copies are removed only after reading and checking the durable object.
        const object = await bucket.get(reference.key);
        if (!object || object.size !== reference.bytes) throw new Error("routing_archive_verification_failed");
        const digest = await crypto.subtle.digest("SHA-256", await object.arrayBuffer());
        const verified = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (verified !== reference.sha256) throw new Error("routing_archive_verification_failed");
        const result = await supabase.rpc("gateway_commit_routing_archive", {
            p_id: row.id, p_created_at: row.created_at, p_source_hash: row.source_hash, p_reference: reference,
        });
        if (result.error || result.data !== true) throw new Error("routing_archive_source_changed_or_commit_failed");
        await env.GATEWAY_CACHE.put(key, JSON.stringify({ id: row.id, created_at: row.created_at }));
        summary.archived += 1;
        summary.bytes += reference.bytes;
    }
    if (summary.complete) await env.GATEWAY_CACHE.put(key, JSON.stringify({ ...cursor, complete: true }));
    return summary;
}

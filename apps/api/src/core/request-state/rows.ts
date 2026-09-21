// Durable lifecycle repository, not a general SQL/PostgREST emulator. Public
// methods accept only these five established lifecycle record contracts.
export const ROW_IDENTITIES = {
    gateway_async_operations: ["kind", "internal_id"],
    gateway_batch_requests: ["batch_id", "custom_id"],
    gateway_batch_file_uploads: ["upload_id"],
    gateway_realtime_sessions: ["session_id"],
    gateway_async_webhook_deliveries: ["kind", "internal_id", "delivery_key"],
} as const;
export type RowTable = keyof typeof ROW_IDENTITIES;
export type LifecycleRow = Record<string, unknown>;
export type RowVersion = { revision: number; row: LifecycleRow };
export type RowProjection = RowVersion & { table: RowTable; identity: string };
export type RowFilter = { equals?: Record<string, string | number | null>; statuses?: (string | null)[];
    order?: "created_at" | "updated_at" | "request_index" | "next_attempt_at"; ascending?: boolean; limit?: number; offset?: number };
const TERMINAL = new Set(["completed", "failed", "cancelled", "canceled", "expired"]);
function rank(status: unknown): number {
    if (TERMINAL.has(String(status))) return 3;
    if (["in_progress", "processing", "running"].includes(String(status))) return 2;
    if (["queued", "pending"].includes(String(status))) return 1;
    return 0;
}

export class LifecycleRows {
    constructor(private readonly sql: SqlStorage, private readonly workspaceId: () => string) {
        sql.exec("CREATE TABLE IF NOT EXISTS lifecycle_rows (collection TEXT NOT NULL, identity TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL, pending INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(collection,identity))");
        sql.exec("CREATE INDEX IF NOT EXISTS lifecycle_pending ON lifecycle_rows(pending,collection,identity)");
    }
    private table(table: RowTable): void {
        if (!Object.hasOwn(ROW_IDENTITIES, table)) throw new Error("invalid_lifecycle_table");
    }
    identity(table: RowTable, row: LifecycleRow): string {
        this.table(table);
        const values = ROW_IDENTITIES[table].map(field => {
            const value = row[field];
            if (typeof value !== "string" || value.length < 1 || value.length > 256) throw new Error("invalid_lifecycle_identity");
            return value;
        });
        return JSON.stringify(values);
    }
    get(table: RowTable, identity: LifecycleRow): RowVersion | null {
        const row = this.sql.exec<{ revision: number; value: string }>(
            "SELECT revision,value FROM lifecycle_rows WHERE collection=? AND identity=?", table, this.identity(table, identity)).toArray()[0];
        return row ? { revision: row.revision, row: JSON.parse(row.value) } : null;
    }
    put(table: RowTable, row: LifecycleRow, expectedRevision?: number): RowVersion {
        if (row.workspace_id !== this.workspaceId()) throw new Error("lifecycle_workspace_mismatch");
        const identity = this.identity(table, row);
        const previous = this.get(table, row);
        if (expectedRevision !== undefined && expectedRevision !== (previous?.revision ?? 0)) throw new Error("lifecycle_revision_conflict");
        const next: LifecycleRow = { ...previous?.row, ...row, created_at: previous?.row.created_at ?? row.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
        if (previous && (table === "gateway_async_operations" || table === "gateway_realtime_sessions")) {
            if (table === "gateway_async_operations" && (TERMINAL.has(String(previous.row.status)) || rank(next.status) < rank(previous.row.status))) next.status = previous.row.status;
            else if (TERMINAL.has(String(previous.row.status)) && next.status !== previous.row.status) throw new Error("lifecycle_terminal_conflict");
            if (previous.row.native_id && next.native_id !== previous.row.native_id) throw new Error("lifecycle_native_identity_conflict");
        }
        const value = JSON.stringify(next);
        if (new TextEncoder().encode(value).length > 512_000) throw new Error("lifecycle_record_too_large");
        const revision = (previous?.revision ?? 0) + 1;
        this.sql.exec("INSERT INTO lifecycle_rows(collection,identity,revision,value,pending) VALUES(?,?,?,?,1) ON CONFLICT(collection,identity) DO UPDATE SET revision=excluded.revision,value=excluded.value,pending=1",
            table, identity, revision, value);
        if (table === "gateway_async_operations") this.enqueueLifecycle(next, previous?.row);
        return { revision, row: next };
    }
    private enqueueLifecycle(row: LifecycleRow, previous?: LifecycleRow): void {
        if (!["video", "batch"].includes(String(row.kind)) || !(row.meta as LifecycleRow)?.webhook) return;
        const kind = String(row.kind);
        const status = String(row.status ?? "").toLowerCase();
        const oldStatus = String(previous?.status ?? "").toLowerCase();
        const events: { key: string; phase: string }[] = [];
        if (!previous) events.push({ key: `${kind}.created`, phase: "created" });
        if (oldStatus !== status) {
            if (previous) events.push({ key: `${kind}.status_changed:${oldStatus || "unknown"}:${status || "unknown"}`, phase: "status_changed" });
            if (TERMINAL.has(status)) events.push({ key: `${kind}.${status === "canceled" ? "cancelled" : status}`, phase: status === "canceled" ? "cancelled" : status });
        }
        for (const event of events) {
            const identity = { kind, internal_id: row.internal_id, delivery_key: event.key };
            if (this.get("gateway_async_webhook_deliveries", identity)) continue;
            this.put("gateway_async_webhook_deliveries", { ...identity, workspace_id: row.workspace_id, status: "pending",
                event_type: `${kind}.${event.phase}`, phase: event.phase, previous_status: oldStatus || null, current_status: status || null,
                progress: null, next_attempt_at: new Date().toISOString(), claim_token: null, claimed_at: null });
        }
    }
    patch(table: RowTable, identity: LifecycleRow, patch: LifecycleRow, expectedRevision?: number, mergeMeta = false): RowVersion | null {
        const previous = this.get(table, identity);
        if (!previous) return null;
        if (this.identity(table, { ...identity, ...patch }) !== this.identity(table, identity)) throw new Error("lifecycle_identity_immutable");
        if (mergeMeta) patch = { ...patch, meta: { ...(previous.row.meta as LifecycleRow ?? {}), ...(patch.meta as LifecycleRow ?? {}) } };
        return this.put(table, { ...previous.row, ...patch }, expectedRevision ?? previous.revision);
    }
    list(table: RowTable, filter: RowFilter = {}): RowVersion[] {
        this.table(table);
        const predicates = ["collection=?"];
        const params: (string | number | null)[] = [table];
        for (const [field, value] of Object.entries(filter.equals ?? {})) {
            if (!/^[a-z_]+$/.test(field)) throw new Error("invalid_lifecycle_filter");
            predicates.push("json_extract(value,?) IS ?"); params.push(`$.${field}`, value);
        }
        if (filter.statuses?.length) {
            if (filter.statuses.length > 32) throw new Error("invalid_lifecycle_filter");
            predicates.push(`(${filter.statuses.map(() => "json_extract(value,'$.status') IS ?").join(" OR ")})`);
            params.push(...filter.statuses);
        }
        const field = filter.order ?? "updated_at";
        if (!["created_at", "updated_at", "request_index", "next_attempt_at"].includes(field)) throw new Error("invalid_lifecycle_order");
        const limit = Math.max(1, Math.min(1000, Math.trunc(filter.limit ?? 100)));
        const offset = Math.max(0, Math.min(100_000, Math.trunc(filter.offset ?? 0)));
        params.push(limit, offset);
        return this.sql.exec<{ revision: number; value: string }>(
            `SELECT revision,value FROM lifecycle_rows WHERE ${predicates.join(" AND ")} ORDER BY json_extract(value,'$.${field}') ${filter.ascending ? "ASC" : "DESC"},identity LIMIT ? OFFSET ?`,
            ...params).toArray().map(row => ({ revision: row.revision, row: JSON.parse(row.value) }));
    }
    pending(): RowProjection[] {
        return this.sql.exec<{ collection: RowTable; identity: string; revision: number; value: string }>(
            "SELECT collection,identity,revision,value FROM lifecycle_rows WHERE pending=1 ORDER BY collection,identity LIMIT 100").toArray()
            .map(row => ({ table: row.collection, identity: row.identity, revision: row.revision, row: JSON.parse(row.value) }));
    }
    acknowledge(event: RowProjection): void {
        // Do not clear a newer mutation that committed during network I/O.
        this.sql.exec("UPDATE lifecycle_rows SET pending=0 WHERE collection=? AND identity=? AND revision=?", event.table, event.identity, event.revision);
    }
}

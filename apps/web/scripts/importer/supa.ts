import * as path from "path";
import * as dotenv from "dotenv";
import { createAdminClient } from "../../src/utils/supabase/admin";
import { chunk } from "./util";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

export function isDryRun() { return DRY_RUN; }

export function client() {
    const c = createAdminClient();
    return c;
}

export function logWrite(table: string, op: string, payload: unknown, extra?: Record<string, any>) {
    if (!DRY_RUN) return;
    const one = JSON.stringify(payload, null, 2);
    console.log(`ðŸ”Ž DRY-RUN ${op} -> ${table}`);
    console.log(one);
    if (extra) console.log("  extra:", extra);
}

function formatSupabaseError(error: any): string {
    if (!error) return "unknown_error";
    const parts: string[] = [];
    const message =
        typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : String(error);
    parts.push(message);

    if (typeof error?.details === "string" && error.details.trim()) {
        parts.push(`details=${error.details.trim()}`);
    }
    if (typeof error?.hint === "string" && error.hint.trim()) {
        parts.push(`hint=${error.hint.trim()}`);
    }
    if (typeof error?.code === "string" && error.code.trim()) {
        parts.push(`code=${error.code.trim()}`);
    }

    const causeCode = error?.cause && typeof error.cause.code === "string"
        ? error.cause.code
        : null;
    if (causeCode) {
        parts.push(`cause_code=${causeCode}`);
    }

    const normalized = parts.join(" | ");
    if (/fetch failed|network|timed out|timeout/i.test(normalized)) {
        return `${normalized} | network_hint=check Supabase reachability and NEXT_PUBLIC_SUPABASE_URL`;
    }
    if (/ux_model_links_model_platform/i.test(normalized)) {
        return `${normalized} | schema_hint=production is missing migration 20260708110000_add_model_link_titles.sql`;
    }
    return normalized;
}

export class ImporterDatabaseError extends Error {
    readonly code: string | null;
    readonly status: number | null;

    constructor(ctx: string, error: any) {
        super(`${ctx}: ${formatSupabaseError(error)}`);
        this.name = "ImporterDatabaseError";
        this.code = typeof error?.code === "string" ? error.code : null;
        this.status = typeof error?.status === "number" ? error.status : null;
        this.cause = error;
    }
}

export function isTransientImporterError(error: unknown): boolean {
    const value = error as { code?: unknown; status?: unknown; message?: unknown; cause?: any };
    const code = typeof value?.code === "string"
        ? value.code
        : typeof value?.cause?.code === "string"
            ? value.cause.code
            : "";
    const status = typeof value?.status === "number"
        ? value.status
        : typeof value?.cause?.status === "number"
            ? value.cause.status
            : null;
    const message = typeof value?.message === "string" ? value.message : String(error);

    return (
        /^(08|40P01|40001|53|57P0)/.test(code) ||
        status === 408 ||
        status === 429 ||
        (status !== null && status >= 500) ||
        /fetch failed|network|timed out|timeout|connection reset|socket hang up/i.test(message)
    );
}

/** Small helper to throw on Supabase errors with context */
export function assertOk<T>(res: { data: T | null, error: any }, ctx: string) {
    if (res.error) {
        throw new ImporterDatabaseError(ctx, res.error);
    }
    return res.data as T;
}

export async function pruneRowsByColumn(
    supa: ReturnType<typeof createAdminClient>,
    table: string,
    column: string,
    keep: Set<string>,
    ctx: string
) {
    if (isDryRun()) {
        logWrite(table, "PRUNE", { column, keep: Array.from(keep) });
        return;
    }

    const existing: string[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const res = await supa.from(table).select(column).range(offset, offset + pageSize - 1);
        const rows = assertOk(res, `${ctx} (select ${column})`) as Record<string, any>[];
        if (!rows.length) break;
        for (const row of rows) {
            const value = row?.[column];
            if (typeof value === "string") existing.push(value);
        }
        if (rows.length < pageSize) break;
    }

    const toDelete =
        keep.size === 0
            ? existing
            : existing.filter((value) => !keep.has(value));
    if (toDelete.length === 0) return;

    for (const group of chunk(toDelete, 500)) {
        const res = await supa.from(table).delete().in(column, group);
        assertOk(res, `${ctx} (prune by ${column})`);
    }
}

export async function touchModelTimestamps(
    supa: ReturnType<typeof createAdminClient>,
    modelIds: Iterable<string>,
    updatedAt: string = new Date().toISOString()
) {
    const normalizedModelIds = Array.from(
        new Set(
            Array.from(modelIds)
                .map((value) => value.trim())
                .filter(Boolean)
        )
    );

    if (normalizedModelIds.length === 0) return;

    if (isDryRun()) {
        logWrite("public.data_models", "TOUCH_UPDATED_AT", {
            model_ids: normalizedModelIds,
            updated_at: updatedAt,
        });
        return;
    }

    for (const group of chunk(normalizedModelIds, 500)) {
        const res = await supa
            .from("data_models")
            .update({ updated_at: updatedAt })
            .in("model_id", group);
        assertOk(res, "touch data_models.updated_at");
    }
}

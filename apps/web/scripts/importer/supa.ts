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
    return normalized;
}

/** Small helper to throw on Supabase errors with context */
export function assertOk<T>(res: { data: T | null, error: any }, ctx: string) {
    if (res.error) {
        throw new Error(`${ctx}: ${formatSupabaseError(res.error)}`);
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

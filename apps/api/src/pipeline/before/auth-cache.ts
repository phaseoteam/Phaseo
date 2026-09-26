import { L1Cache } from "@/runtime/cache/l1";
import type { AuthSuccess, KeyRow } from "./auth";

export const AUTH_SOURCE_LEASE_MS = 60_000;
const L1_TTL_MS = 30_000;
const MAX_ROW_CHARS = 16_384;
const keyRows = new L1Cache<string | null>({ namespace: "auth-key-rows", maxEntries: 2000,
    maxBytes: 4 * 1024 * 1024, maxEntryBytes: 34 * 1024, maxPending: 32,
    sizeOf: (value, key) => 128 + 2 * (key.length + (value?.length ?? 0)) });
const validated = new L1Cache<Readonly<AuthSuccess>>({ namespace: "auth-validation", maxEntries: 2000,
    maxBytes: 1024 * 1024, maxEntryBytes: 4096, maxPending: 32,
    sizeOf: (value, key) => 128 + 2 * (key.length + JSON.stringify(value).length) });
const sourceReads = new L1Cache<KeyRow | "db_error" | null>({ namespace: "auth-source-refill", maxEntries: 1,
    maxBytes: 1, maxEntryBytes: 1, maxPending: 32, sizeOf: () => 1 });

export function authSourceDeadline(row: KeyRow): number {
    const observed = row.auth_source_at_ms;
    const now = Date.now();
    if (typeof observed !== "number" || !Number.isFinite(observed) || observed > now) return 0;
    const expiry = row.expires_at == null ? Infinity : Date.parse(row.expires_at);
    if (Number.isNaN(expiry)) return 0;
    return Math.min(observed + AUTH_SOURCE_LEASE_MS, expiry);
}

/** Positive metadata only; no raw credential, public cache, or sliding source deadline. */
function serialise(row: KeyRow): string | null {
    if (!row || typeof row !== "object" || ![row.id, row.workspace_id, row.status, row.hash].every(value => typeof value === "string" && value.length > 0)) return null;
    if (authSourceDeadline(row) <= Date.now()) return null;
    const compact: KeyRow = {
        id: row.id, workspace_id: row.workspace_id, status: row.status, hash: row.hash,
        expires_at: row.expires_at, soft_blocked: row.soft_blocked, scopes: row.scopes,
        created_by: row.created_by, key_kind: row.key_kind, oauth_client_id: row.oauth_client_id,
        oauth_user_id: row.oauth_user_id, oauth_scopes: row.oauth_scopes, oauth_resource: row.oauth_resource,
        auth_source_at_ms: row.auth_source_at_ms,
    };
    const text = JSON.stringify(compact);
    return text.length <= MAX_ROW_CHARS ? text : null;
}

export async function readAuthKey(kid: string, version: string, load: () => Promise<unknown>): Promise<KeyRow | null> {
    const raw = await keyRows.getOrLoad(`${kid}:${version}`, async () => {
        const candidate = await load();
        // Require source timestamps even from KV: legacy/expired rows must be revalidated.
        const text = typeof candidate === "string" && candidate.length <= MAX_ROW_CHARS
            ? serialise(JSON.parse(candidate)) : null;
        return { value: text, expiresAtMs: text ? Math.min(Date.now() + L1_TTL_MS, authSourceDeadline(JSON.parse(text))) : 0 };
    });
    return raw ? JSON.parse(raw) : null;
}

export function rememberAuthKey(kid: string, version: string, row: KeyRow): string | null {
    const text = serialise(row);
    if (text && keyRows.get(`${kid}:${version}`) === text) return null;
    if (text) keyRows.set(`${kid}:${version}`, { value: text,
        expiresAtMs: Math.min(Date.now() + L1_TTL_MS, authSourceDeadline(row)) });
    return text;
}

/** Coalesce authoritative refills only under the already-observed version fence. */
export function readAuthKeySource(kid: string, version: string, load: () => Promise<KeyRow | "db_error" | null>) {
    return sourceReads.getOrLoad(`${kid}:${version}`, async () => ({ value: await load(), expiresAtMs: 0 }));
}

export function readValidatedAuth(digest: string, version: string): Readonly<AuthSuccess> | undefined {
    return validated.get(`${version}:${digest}`);
}

export function rememberValidatedAuth(digest: string, version: string, row: KeyRow, result: AuthSuccess): void {
    validated.set(`${version}:${digest}`, { value: Object.freeze({ ...result, internal: false }),
        expiresAtMs: Math.min(Date.now() + L1_TTL_MS, authSourceDeadline(row)) });
}

export function resetAuthServingCaches(): void { keyRows.clear(); validated.clear(); sourceReads.clear(); }
export function authServingCacheStats() { return { rows: keyRows.stats(), validated: validated.stats(), source: sourceReads.stats() }; }

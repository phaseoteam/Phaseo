import { L1Cache } from "@/runtime/cache/l1";
import { readStreamTextWithLimit } from "@/core/bounded-stream";
import {
    decodeWorkspaceRuntimeCache, isWorkspaceRuntimeFresh, workspaceRuntimeSchema,
    WORKSPACE_RUNTIME_MAX_CACHE_BYTES, type WorkspaceRuntimeSnapshot,
} from "./workspaceRuntimeSnapshot";

export const WORKSPACE_RUNTIME_L1_MS = 30_000;
type Store = Pick<KVNamespace, "get" | "put">;

/** Private metadata only. A caller supplies the already-read workspace version:
 * this cache never polls a marker, lists keys, refreshes on a timer or reads DB. */
export class WorkspaceRuntimeCache {
    private readonly writes = new Map<string, Promise<boolean>>();
    private readonly local = new L1Cache<string | null>({
        namespace: "workspace-runtime-v1", maxEntries: 128, maxBytes: 4 * 1024 * 1024,
        maxEntryBytes: WORKSPACE_RUNTIME_MAX_CACHE_BYTES + 512, maxPending: 32,
        sizeOf: (raw, key) => 2 * ((raw?.length ?? 0) + key.length) + 64,
    });

    constructor(private readonly store: () => Store) {}

    private key(workspaceId: string, version: string | null): string | null {
        if (!/^[0-9a-f-]{36}$/i.test(workspaceId) || !version || !/^v\d{1,16}$/.test(version)) return null;
        return `gateway:workspace-runtime:v1:${workspaceId}:${version}`;
    }

    private remember(key: string, raw: string, snapshot: WorkspaceRuntimeSnapshot): void {
        this.local.set(key, { value: raw, expiresAtMs: Math.min(snapshot.expiresAtMs, Date.now() + WORKSPACE_RUNTIME_L1_MS) });
    }

    async read(workspaceId: string, version: string | null): Promise<WorkspaceRuntimeSnapshot | null> {
        const key = this.key(workspaceId, version);
        if (!key) return null;
        try {
            const raw = await this.local.getOrLoad(key, async () => {
                // Bound transport buffering too: a corrupt KV value may be much
                // larger than the entry size we accept into L1.
                const stream = await this.store().get(key, "stream");
                const raw = stream ? await readStreamTextWithLimit(stream, WORKSPACE_RUNTIME_MAX_CACHE_BYTES) : null;
                const snapshot = raw ? decodeWorkspaceRuntimeCache(raw, workspaceId) : null;
                return { value: snapshot ? raw : null,
                    expiresAtMs: snapshot ? Math.min(snapshot.expiresAtMs, Date.now() + WORKSPACE_RUNTIME_L1_MS) : 0 };
            });
            // Reparse into request-owned data; never share mutable BYOK/settings.
            return raw ? decodeWorkspaceRuntimeCache(raw, workspaceId) : null;
        } catch { return null; }
    }

    async publish(input: unknown, workspaceId: string, version: string | null): Promise<boolean> {
        const key = this.key(workspaceId, version);
        if (!key) return false;
        const parsed = workspaceRuntimeSchema.safeParse(input);
        if (!parsed.success || !isWorkspaceRuntimeFresh(parsed.data, workspaceId)) return false;
        const raw = JSON.stringify(parsed.data);
        if (raw.length * 2 > WORKSPACE_RUNTIME_MAX_CACHE_BYTES) return false;
        // Bound active writes independently from read single-flight. Competing
        // fills are advisory; a required publication must not acknowledge a skip.
        if (this.writes.has(key) || this.writes.size >= 32) return false;
        const old = this.local.get(key);
        if (old && (decodeWorkspaceRuntimeCache(old, workspaceId)?.checkedAtMs ?? 0) > parsed.data.checkedAtMs) return false;
        this.remember(key, raw, parsed.data);
        const write = Promise.resolve().then(async () => {
            if (!isWorkspaceRuntimeFresh(parsed.data, workspaceId)) return false;
            // KV's minimum TTL is 60 seconds. Logical source expiry is embedded
            // and enforced even if KV retains a stale value beyond that deadline.
            await this.store().put(key, raw, { expirationTtl: 60 });
            return true;
        }).finally(() => { if (this.writes.get(key) === write) this.writes.delete(key); });
        this.writes.set(key, write);
        return write;
    }

    stats() { return { ...this.local.stats(), writes: this.writes.size }; }
}

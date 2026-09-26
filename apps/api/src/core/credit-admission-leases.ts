import { LRUCache } from "lru-cache";
import { L1Cache } from "@/runtime/cache/l1";

const MAX_SOURCE_MS = 7_200_000;
const MAX_CHARS = 16_384;
const HIGH_BALANCE_NANOS = 10_000_000_000;

/** Admission hint only: never a wallet, reservation, debit or spending counter. */
export class CreditAdmissionLeases {
    private readonly values = new L1Cache<string | null>({ namespace: "credit-admission", maxEntries: 512,
        maxBytes: 2 * 1024 * 1024, maxEntryBytes: 34 * 1024, maxPending: 32,
        sizeOf: (value, key) => 128 + 2 * (key.length + (value?.length ?? 0)) });
    private evictedFloor = 0;
    private readonly invalidatedAt = new LRUCache<string, number>({ max: 512,
        // Conservatively reject older source snapshots for unknown workspaces if
        // a fence is evicted. No unbounded tombstone registry or expiration race.
        dispose: (floor, _key, reason) => { if (reason === "evict") this.evictedFloor = Math.max(this.evictedFloor, floor); } });

    canPublish(workspaceId: string, checkedAtMs: number): boolean {
        return checkedAtMs > (this.invalidatedAt.get(workspaceId) ?? this.evictedFloor);
    }

    private entry(workspaceId: string, raw: string | null) {
        const none = { value: null, expiresAtMs: 0 };
        if (!raw || raw.length > MAX_CHARS) return none;
        try {
            const value = JSON.parse(raw);
            if (value?.workspaceId !== workspaceId || !value.credit) return none;
            const lease = value.cacheLease;
            // Legacy data can follow its existing KV path but never enters L1.
            if (lease === undefined) return !(this.invalidatedAt.get(workspaceId) ?? this.evictedFloor)
                ? { value: raw, expiresAtMs: 0 } : none;
            const now = Date.now();
            if (!Number.isSafeInteger(lease?.checkedAtMs) || !Number.isSafeInteger(lease?.expiresAtMs)
                || lease.checkedAtMs > now || lease.expiresAtMs <= now
                || lease.expiresAtMs <= lease.checkedAtMs || lease.expiresAtMs - lease.checkedAtMs > MAX_SOURCE_MS
                || !this.canPublish(workspaceId, lease.checkedAtMs)) return none;
            const balance = value.credit.balanceNanos;
            const eligible = value.credit.ok === true && Number.isSafeInteger(balance) && balance >= HIGH_BALANCE_NANOS;
            return { value: raw, expiresAtMs: eligible ? Math.min(now + 5000, lease.expiresAtMs) : 0 };
        } catch { return none; }
    }

    read(workspaceId: string, load: () => Promise<string | null>): Promise<string | null> {
        return this.values.getOrLoad(workspaceId, async () => this.entry(workspaceId, await load()));
    }

    remember(workspaceId: string, raw: string): void { this.values.set(workspaceId, this.entry(workspaceId, raw)); }

    invalidate(workspaceId: string): void {
        this.invalidatedAt.set(workspaceId, Math.max(Date.now(), this.invalidatedAt.get(workspaceId) ?? 0));
        this.values.invalidate(workspaceId);
    }

    stats() { return { ...this.values.stats(), fences: this.invalidatedAt.size }; }
}

export const creditAdmissionLeases = new CreditAdmissionLeases();

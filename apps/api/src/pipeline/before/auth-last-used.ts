import { L1Cache } from "@/runtime/cache/l1";

const recent = new L1Cache<Readonly<{ id: number }>>({ namespace: "auth-last-used", maxEntries: 2000,
    maxBytes: 512 * 1024, maxEntryBytes: 1024, maxPending: 1, sizeOf: (_value, key) => 96 + key.length * 2 });
let active = 0;
let nextId = 0;

/** Advisory display timestamp only. Never coalesce credential mutations or ledger writes. */
export function coalesceKeyLastUsed(keyId: string, write: () => Promise<void>): Promise<void> | null {
    if (recent.get(keyId) || active >= 32) return null;
    const marker = Object.freeze({ id: ++nextId });
    recent.set(keyId, { value: marker, expiresAtMs: Date.now() + 60_000 });
    active++;
    return Promise.resolve().then(write).catch(() => {
        if (recent.get(keyId) === marker) recent.invalidate(keyId);
    }).finally(() => { active--; });
}

export function resetKeyLastUsedForTests(): void { recent.clear(); }
export function keyLastUsedStats() { return { ...recent.stats(), active }; }

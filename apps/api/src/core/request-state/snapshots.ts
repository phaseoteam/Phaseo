import type { CompiledRequestSnapshot, SealedSnapshot, SnapshotReference } from "./contracts";

const encoder = new TextEncoder();
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_BYTES = 8 * 1024 * 1024;
// Store sealed immutable bytes only. A local hit never bypasses the DO's active
// publication reference or the snapshot's absolute validity deadline.
const memory = new Map<string, string>();
let memoryBytes = 0;

function encode(bytes: Uint8Array): string {
    let text = "";
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
}
function decode(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function encryptionKey(secret: string): Promise<CryptoKey> {
    if (!secret) throw new Error("request_state_encryption_key_missing");
    const bytes = decode(secret);
    if (bytes.length !== 32) throw new Error("request_state_encryption_key_invalid");
    return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function digest(value: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export async function sealSnapshot(value: CompiledRequestSnapshot, secret: string): Promise<string> {
    const bytes = encoder.encode(JSON.stringify(value));
    if (bytes.length > MAX_BYTES) throw new Error("request_snapshot_too_large");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
        additionalData: encoder.encode("phaseo-request-state-v1") }, await encryptionKey(secret), bytes);
    return JSON.stringify({ version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) } satisfies SealedSnapshot);
}
export async function openSnapshot(raw: string, secret: string): Promise<CompiledRequestSnapshot> {
    if (raw.length > MAX_BYTES * 2) throw new Error("request_snapshot_too_large");
    const sealed = JSON.parse(raw) as SealedSnapshot;
    if (sealed.version !== 1) throw new Error("request_snapshot_version_invalid");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(sealed.iv),
        additionalData: encoder.encode("phaseo-request-state-v1") }, await encryptionKey(secret), decode(sealed.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as CompiledRequestSnapshot;
}
function remember(key: string, raw: string): void {
    const previous = memory.get(key);
    if (previous) memoryBytes -= previous.length * 2;
    memory.delete(key);
    while (memory.size && memoryBytes + raw.length * 2 > MAX_MEMORY_BYTES) {
        const oldest = memory.keys().next().value!;
        memoryBytes -= memory.get(oldest)!.length * 2;
        memory.delete(oldest);
    }
    if (raw.length * 2 <= MAX_MEMORY_BYTES) {
        memory.set(key, raw);
        memoryBytes += raw.length * 2;
    }
}
export function resetSnapshotMemoryForTests(): void { memory.clear(); memoryBytes = 0; }

export async function loadSnapshot(args: {
    reference: SnapshotReference; kv: KVNamespace; secret: string;
    durableFallback: () => Promise<string>;
    waitUntil: (promise: Promise<unknown>) => void;
    cache?: Cache;
}): Promise<{ snapshot: CompiledRequestSnapshot; source: "memory" | "cache" | "kv" | "durable" }> {
    const ref = args.reference;
    if (ref.validUntil <= Date.now()) throw new Error("request_snapshot_expired");
    const cacheKey = new Request(`https://request-state.internal/${ref.digest}`);
    let source: "memory" | "cache" | "kv" | "durable" = "memory";
    let raw = memory.get(ref.digest);
    if (!raw && args.cache) {
        source = "cache";
        raw = await args.cache.match(cacheKey).then(r => r?.text()).catch(() => undefined);
    }
    if (!raw) {
        source = "kv";
        raw = await args.kv.get(ref.key, "text").catch(() => null) ?? undefined;
    }
    // A verified local write does not imply that all KV replicas have the blob.
    // Keep a durable copy next to the active pointer to cover propagation/eviction.
    if (!raw || await digest(raw) !== ref.digest) {
        source = "durable";
        raw = await args.durableFallback();
    }
    if (await digest(raw) !== ref.digest) throw new Error("request_snapshot_digest_mismatch");
    const snapshot = await openSnapshot(raw, args.secret);
    if (snapshot.validUntil !== ref.validUntil) throw new Error("request_snapshot_deadline_mismatch");
    remember(ref.digest, raw);
    if (args.cache && (source === "kv" || source === "durable")) {
        args.waitUntil(args.cache.put(cacheKey, new Response(raw, {
            headers: { "Cache-Control": "public, max-age=86400", "Content-Type": "application/json" },
        })).catch(() => undefined));
    }
    return { snapshot, source };
}

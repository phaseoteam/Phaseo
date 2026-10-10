// Purpose: Tiered read-through cache for request-path lookups.
// Why: Keep Postgres off the request path by serving data from isolate memory,
//      the colo-local Workers Cache, and KV, refreshing in the background.
// How: L1 (isolate Map) -> L2 (caches.default) -> L3 (KV) -> loader. Every layer
//      serves stale values immediately and revalidates from the layer below it.
//
// Rules:
// - Shared layers (L2/L3) are never deleted per colo. A value must become
//   invalid either through its key (an embedded version token) or through an
//   `isFreshInL3`/`isUsable` check against a published revision or deadline.
// - Secrets, credentials and wallet balances must use `l2: false, l3: false`.

import { dispatchBackground, getBindingsIfConfigured, getCache } from "@/runtime/env";
import { awaitShared } from "@core/shared-wait";

type Envelope<T> = {
	/** Cached value; `null` is a negative-cache entry. */
	v: T | null;
	/** Epoch ms when the value was produced by the loader. */
	at: number;
};

type L1Entry = {
	envelope: Envelope<unknown>;
	/** Epoch ms of the last successful read from a lower layer. */
	checkedAt: number;
	bytes: number;
};

export type TieredCacheOptions<T> = {
	/** Fully qualified cache key, including any version or revision tokens. */
	key: string;
	/** Authoritative source, normally Postgres. Return `null` for "not found". */
	loader: () => Promise<T | null>;
	/** How long an L1 entry is served without revalidation. */
	l1FreshMs: number;
	/** Oldest data (by production time) that may be served without awaiting. Defaults to forever. */
	maxStaleMs?: number;
	/** Workers Cache layer; `false` disables it. */
	l2?: { freshS: number; storeS: number } | false;
	/** KV layer; `false` disables it. `expirationS` omitted means the key never expires. */
	l3?: { freshS: number; expirationS?: number } | false;
	/** Freshness for negative entries in every layer. Defaults to `l1FreshMs`. */
	negativeFreshMs?: number;
	/**
	 * Whether a loaded value may be stored in the shared L2/L3 layers. Defaults
	 * to sharing everything. Restrict it when a "not found" result could reveal
	 * a private identifier (for example workspace-private model names).
	 */
	isShareable?: (value: T | null) => boolean;
	/** Rejects malformed values read from L2/L3. */
	validate?: (value: unknown) => value is T;
	/** A cached value that fails this check is treated as a miss and awaited. */
	isUsable?: (value: T) => boolean;
	/**
	 * Overrides age-based freshness for a value read from L3. Return `undefined`
	 * to fall back to `l3.freshS`.
	 */
	isFreshInL3?: (value: T) => boolean | undefined;
	/**
	 * Revalidates an isolate copy before `l1FreshMs` elapses (at most once per
	 * `L1_STALE_RECHECK_MS`), for example when a newer revision has been published.
	 */
	isStaleInL1?: (value: T) => boolean;
};

const L1_MAX_ENTRIES = 10_000;
const L1_MAX_BYTES = 32 * 1024 * 1024;
const L2_KEY_ORIGIN = "https://gateway-cache.internal/v1/";
// A concurrent miss joins another request's load for at most this long, then loads itself.
const SHARED_LOAD_WAIT_MS = 1_500;
// Bounds lower-layer reads (and loads, if the loader keeps failing) while an isolate copy
// reported by `isStaleInL1` is being replaced. Matches the catalogue revision refresh interval.
const L1_STALE_RECHECK_MS = 15_000;

const l1 = new Map<string, L1Entry>();
let l1Bytes = 0;
const inflight = new Map<string, Promise<unknown>>();
// Refresh key -> start time. A refresh whose request was cancelled never settles, so
// entries older than the waitUntil budget no longer block new refreshes.
const refreshing = new Map<string, number>();
const STALE_REFRESH_MS = 30_000;
const epochs = new Map<string, number>();

export function __resetTieredCacheForTests(): void {
	l1.clear();
	l1Bytes = 0;
	inflight.clear();
	refreshing.clear();
	epochs.clear();
}

function epochOf(key: string): number {
	return epochs.get(key) ?? 0;
}

function l1Get(key: string): L1Entry | undefined {
	const entry = l1.get(key);
	if (!entry) return undefined;
	// Refresh recency for LRU eviction.
	l1.delete(key);
	l1.set(key, entry);
	return entry;
}

function l1Set(key: string, envelope: Envelope<unknown>, bytes: number, checkedAt = Date.now()): void {
	const previous = l1.get(key);
	if (previous) {
		l1Bytes -= previous.bytes;
		l1.delete(key);
	}
	l1.set(key, { envelope, checkedAt, bytes });
	l1Bytes += bytes;
	while (l1.size > L1_MAX_ENTRIES || l1Bytes > L1_MAX_BYTES) {
		const oldest = l1.keys().next();
		if (oldest.done) break;
		l1Bytes -= l1.get(oldest.value)?.bytes ?? 0;
		l1.delete(oldest.value);
	}
}

function l2Enabled<T>(options: TieredCacheOptions<T>): options is TieredCacheOptions<T> & { l2: { freshS: number; storeS: number } } {
	if (!options.l2) return false;
	if (typeof caches === "undefined") return false;
	return getBindingsIfConfigured()?.GATEWAY_TIERED_CACHE_L2_ENABLED !== "false";
}

async function l2Request(key: string): Promise<Request> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return new Request(`${L2_KEY_ORIGIN}${hex}`);
}

async function l2Read(key: string): Promise<string | null> {
	try {
		const cache = (caches as unknown as { default: Cache }).default;
		const hit = await cache.match(await l2Request(key));
		return hit ? await hit.text() : null;
	} catch {
		return null;
	}
}

async function l2Write(key: string, raw: string, storeS: number): Promise<void> {
	try {
		const cache = (caches as unknown as { default: Cache }).default;
		await cache.put(await l2Request(key), new Response(raw, {
			headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${Math.max(1, Math.floor(storeS))}` },
		}));
	} catch {
		// The Workers Cache is best effort.
	}
}

function locationCacheEnabled(): boolean {
	return typeof caches !== "undefined" && getBindingsIfConfigured()?.GATEWAY_TIERED_CACHE_L2_ENABLED !== "false";
}

/**
 * Reads a raw value from this location's Workers Cache (L2) for callers that manage
 * their own isolate and KV layers. Other locations cannot be purged, so the key must
 * embed a version token or the value must carry its own short absolute age bound.
 */
export async function readLocationCache(key: string): Promise<string | null> {
	return locationCacheEnabled() ? l2Read(key) : null;
}

/**
 * Stores a raw value in this location's Workers Cache (L2) in the background. The
 * returned promise settles when the write does, so a later delete can follow it.
 */
export function writeLocationCache(key: string, raw: string, storeS: number): Promise<void> {
	if (!locationCacheEnabled()) return Promise.resolve();
	const write = l2Write(key, raw, storeS);
	dispatchBackground(write);
	return write;
}

/** Removes a value from this location's Workers Cache (L2). Other locations keep theirs. */
export async function deleteLocationCache(key: string): Promise<void> {
	if (typeof caches === "undefined") return;
	try {
		await (caches as unknown as { default: Cache }).default.delete(await l2Request(key));
	} catch {
		// The Workers Cache is best effort.
	}
}

async function l3Read(key: string): Promise<string | null> {
	try {
		return await getCache().get(key, "text");
	} catch {
		return null;
	}
}

async function l3Write(key: string, raw: string, expirationS?: number): Promise<void> {
	await getCache().put(key, raw, expirationS ? { expirationTtl: Math.max(60, Math.floor(expirationS)) } : undefined);
}

function parseEnvelope<T>(raw: string | null, options: TieredCacheOptions<T>): Envelope<T> | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Envelope<unknown>;
		if (!parsed || typeof parsed !== "object" || typeof parsed.at !== "number") return null;
		if (parsed.v !== null && options.validate && !options.validate(parsed.v)) return null;
		return parsed as Envelope<T>;
	} catch {
		return null;
	}
}

function ageMs(envelope: Envelope<unknown>, now = Date.now()): number {
	return Math.max(0, now - envelope.at);
}

function layerFreshMs<T>(options: TieredCacheOptions<T>, envelope: Envelope<unknown>, layerFreshMs: number): number {
	return envelope.v === null ? (options.negativeFreshMs ?? options.l1FreshMs) : layerFreshMs;
}

function servable<T>(options: TieredCacheOptions<T>, envelope: Envelope<unknown>): boolean {
	if (options.maxStaleMs !== undefined && ageMs(envelope) > options.maxStaleMs) return false;
	if (envelope.v !== null && options.isUsable && !options.isUsable(envelope.v as T)) return false;
	return true;
}

function staleInL3<T>(options: TieredCacheOptions<T> & { l3: { freshS: number } }, envelope: Envelope<unknown>): boolean {
	if (envelope.v !== null && options.isFreshInL3) {
		const fresh = options.isFreshInL3(envelope.v as T);
		if (fresh !== undefined) return !fresh;
	}
	return ageMs(envelope) >= layerFreshMs(options, envelope, options.l3.freshS * 1000);
}

type Level = 2 | 3 | 4;
export type TieredSource = "memory" | "workers-cache" | "kv" | "loader";
export type TieredResult<T> = { value: T | null; source: TieredSource };

/** Reads from `level` downwards, filling the layers above on the way back. */
async function readFrom<T>(options: TieredCacheOptions<T>, level: Level): Promise<TieredResult<T>> {
	const { key } = options;
	const epoch = epochOf(key);
	// A load superseded by invalidation or by a replacement load must not write any layer,
	// or a slow, older result could overwrite the newer one.
	const current = () => epochOf(key) === epoch;
	const fill = (envelope: Envelope<unknown>, raw: string) => {
		if (current()) l1Set(key, envelope, raw.length);
	};

	if (level <= 2 && l2Enabled(options)) {
		const raw = await l2Read(key);
		const envelope = parseEnvelope(raw, options);
		if (raw && envelope && servable(options, envelope)) {
			fill(envelope, raw);
			if (ageMs(envelope) >= layerFreshMs(options, envelope, options.l2.freshS * 1000)) {
				scheduleRefresh(options, options.l3 ? 3 : 4);
			}
			return { value: envelope.v, source: "workers-cache" };
		}
	}

	if (level <= 3 && options.l3) {
		const raw = await l3Read(key);
		const envelope = parseEnvelope(raw, options);
		if (raw && envelope && servable(options, envelope)) {
			fill(envelope, raw);
			if (current() && l2Enabled(options)) dispatchBackground(l2Write(key, raw, options.l2.storeS));
			if (staleInL3({ ...options, l3: options.l3 }, envelope)) {
				scheduleRefresh(options, 4);
			}
			return { value: envelope.v, source: "kv" };
		}
	}

	const value = await options.loader();
	const envelope: Envelope<T> = { v: value ?? null, at: Date.now() };
	const raw = JSON.stringify(envelope);
	fill(envelope, raw);
	const shared = current() && (options.isShareable ? options.isShareable(envelope.v) : true);
	if (shared && l2Enabled(options)) dispatchBackground(l2Write(key, raw, options.l2.storeS));
	if (shared && options.l3) {
		const expirationS = envelope.v === null
			? Math.ceil((options.negativeFreshMs ?? options.l1FreshMs) / 1000)
			: options.l3.expirationS;
		dispatchBackground(l3Write(key, raw, expirationS));
	}
	return { value: envelope.v, source: "loader" };
}

function scheduleRefresh<T>(options: TieredCacheOptions<T>, level: Level): void {
	const refreshKey = `${level}:${options.key}`;
	const startedAt = refreshing.get(refreshKey);
	if (startedAt !== undefined && Date.now() - startedAt < STALE_REFRESH_MS) return;
	const marker = Date.now();
	refreshing.set(refreshKey, marker);
	dispatchBackground(
		readFrom(options, level)
			.catch((error) => {
				console.warn("tiered_cache_refresh_failed", {
					key: options.key,
					level,
					error: error instanceof Error ? error.message : String(error),
				});
			})
			.finally(() => { if (refreshing.get(refreshKey) === marker) refreshing.delete(refreshKey); }),
	);
}

/**
 * Returns the cached value for `options.key`, serving stale data immediately
 * and revalidating in the background. Only a miss in every layer (or data older
 * than `maxStaleMs`) awaits the loader; concurrent misses share one load.
 */
export async function tieredRead<T>(options: TieredCacheOptions<T>): Promise<T | null> {
	return (await tieredReadDetailed(options)).value;
}

/** Like {@link tieredRead}, also reporting which layer served the value. */
export async function tieredReadDetailed<T>(options: TieredCacheOptions<T>): Promise<TieredResult<T>> {
	const entry = l1Get(options.key);
	if (entry && servable(options, entry.envelope)) {
		const freshMs = layerFreshMs(options, entry.envelope, options.l1FreshMs);
		const sinceCheckMs = Date.now() - entry.checkedAt;
		if (sinceCheckMs >= freshMs || (sinceCheckMs >= L1_STALE_RECHECK_MS && entry.envelope.v !== null
			&& options.isStaleInL1?.(entry.envelope.v as T) === true)) {
			// Mark as checked so concurrent requests do not queue more refreshes.
			entry.checkedAt = Date.now();
			scheduleRefresh(options, options.l2 ? 2 : options.l3 ? 3 : 4);
		}
		return { value: entry.envelope.v as T | null, source: "memory" };
	}

	const pending = inflight.get(options.key) as Promise<TieredResult<T>> | undefined;
	if (pending) {
		// The load may belong to another request; never wait on it unboundedly.
		const shared = await awaitShared(pending, SHARED_LOAD_WAIT_MS);
		if (shared.settled) return shared.value;
		// Supersede the unsettled load so it cannot overwrite this one if it finishes later.
		epochs.set(options.key, epochOf(options.key) + 1);
	}
	const load = readFrom(options, 2).finally(() => {
		if (inflight.get(options.key) === load) inflight.delete(options.key);
	});
	inflight.set(options.key, load);
	return load;
}

/** Drops the isolate copy of `key` and stops in-flight loads from repopulating it. */
export function invalidateTieredL1(key: string): void {
	epochs.set(key, epochOf(key) + 1);
	const entry = l1.get(key);
	if (entry) {
		l1Bytes -= entry.bytes;
		l1.delete(key);
	}
	inflight.delete(key);
}

/** Writes a freshly produced value through every enabled layer (used by publishers). */
export async function writeTiered<T>(options: Pick<TieredCacheOptions<T>, "key" | "l2" | "l3">, value: T): Promise<void> {
	const envelope: Envelope<T> = { v: value, at: Date.now() };
	const raw = JSON.stringify(envelope);
	l1Set(options.key, envelope, raw.length);
	const writes: Promise<void>[] = [];
	if (options.l3) writes.push(l3Write(options.key, raw, options.l3.expirationS));
	if (options.l2 && typeof caches !== "undefined") writes.push(l2Write(options.key, raw, options.l2.storeS));
	await Promise.all(writes);
}

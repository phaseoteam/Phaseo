// Purpose: Location-wide cache for the version counters that gate cached auth, context and policy.
// Why: Isolates cached these counters for 5 s, and low-traffic requests land on many isolates,
//      so most requests paid one KV read (billed, 10-40 ms) per counter before going upstream.
// How: The Workers Cache (per location, no per-operation charge) holds {value, expiresAt}. The
//      expiry is absolute, set when KV was read, so neither the location nor an isolate can serve
//      a counter longer than SHARED_VERSION_TTL_MS. KV is read with its 30 s minimum edge cache,
//      so a bump (key revocation, policy change) is seen everywhere within about a minute; the
//      previous bound was a 5 s isolate cache on top of KV's default 60 s edge cache.

import { dispatchBackground, getBindingsIfConfigured, getCache } from "@/runtime/env";

export const SHARED_VERSION_TTL_MS = 30_000;
const KV_MIN_EDGE_CACHE_TTL_S = 30;
const ORIGIN = "https://gateway-cache.internal/version/v1/";

export type SharedVersion = { value: number; expiresAt: number };

export function normalizeVersion(raw: unknown): number {
	const parsed = raw === null || raw === undefined || raw === "" ? 0 : Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function sharedCache(): Cache | null {
	if (typeof caches === "undefined") return null;
	if (getBindingsIfConfigured()?.GATEWAY_TIERED_CACHE_L2_ENABLED === "false") return null;
	return (caches as unknown as { default: Cache }).default;
}

async function cacheRequest(kvKey: string): Promise<Request> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kvKey));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return new Request(`${ORIGIN}${hex}`);
}

async function readLocation(cache: Cache, kvKey: string, now: number): Promise<SharedVersion | null> {
	try {
		const hit = await cache.match(await cacheRequest(kvKey));
		if (!hit) return null;
		const body = await hit.json() as Partial<SharedVersion>;
		if (typeof body.value !== "number" || typeof body.expiresAt !== "number") return null;
		if (body.expiresAt <= now || body.expiresAt > now + SHARED_VERSION_TTL_MS) return null;
		return { value: normalizeVersion(body.value), expiresAt: body.expiresAt };
	} catch {
		return null;
	}
}

async function writeLocation(cache: Cache, kvKey: string, version: SharedVersion): Promise<void> {
	const maxAgeS = Math.max(1, Math.floor((version.expiresAt - Date.now()) / 1000));
	try {
		await cache.put(await cacheRequest(kvKey), new Response(JSON.stringify(version), {
			headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${maxAgeS}` },
		}));
	} catch {
		// The Workers Cache is best effort.
	}
}

/** Reads a version counter through the location cache, falling back to KV. Throws if KV fails. */
export async function readSharedVersion(kvKey: string): Promise<SharedVersion> {
	const now = Date.now();
	const cache = sharedCache();
	const located = cache ? await readLocation(cache, kvKey, now) : null;
	if (located) return located;
	const raw = await getCache().get(kvKey, { type: "text", cacheTtl: KV_MIN_EDGE_CACHE_TTL_S });
	const version = { value: normalizeVersion(raw), expiresAt: now + SHARED_VERSION_TTL_MS };
	if (cache) dispatchBackground(writeLocation(cache, kvKey, version));
	return version;
}

/** Publishes a just-written counter to this location so its isolates see the bump at once. */
export function rememberSharedVersion(kvKey: string, value: number): void {
	const cache = sharedCache();
	if (!cache) return;
	dispatchBackground(writeLocation(cache, kvKey, { value: normalizeVersion(value), expiresAt: Date.now() + SHARED_VERSION_TTL_MS }));
}

// Purpose: Shared catalogue revision for cache freshness.
// Why: Catalogue snapshots are served stale-while-revalidate; the revision tells
//      background revalidation whether a cached snapshot is still current
//      without querying Postgres.
// How: The scheduled publisher copies `gateway_catalogue_revision()` into KV.
//      Requests read an isolate copy synchronously and refresh it in the
//      background.

import { dispatchBackground, getCache, getSupabaseAdmin } from "@/runtime/env";

export const CATALOGUE_REVISION_KEY = "gateway:catalogue:revision:v1";
const REFRESH_INTERVAL_MS = 15_000;

let known: { revision: string | null; checkedAt: number } | null = null;
let refreshing: Promise<void> | null = null;

export function __resetCatalogueRevisionForTests(): void {
	known = null;
	refreshing = null;
}

function refresh(): void {
	if (refreshing) return;
	refreshing = (async () => {
		try {
			const raw = await getCache().get(CATALOGUE_REVISION_KEY, "text");
			known = { revision: raw?.trim() || null, checkedAt: Date.now() };
		} catch {
			// Keep the previous value; freshness falls back to age when unknown.
			known = { revision: known?.revision ?? null, checkedAt: Date.now() };
		} finally {
			refreshing = null;
		}
	})();
	dispatchBackground(refreshing);
}

/**
 * Last published catalogue revision seen by this isolate, or `null` when none
 * has been published (for example on staging, which runs no scheduled jobs).
 * Never blocks; schedules a background refresh when the copy is old.
 */
export function knownCatalogueRevision(): string | null {
	if (!known || Date.now() - known.checkedAt >= REFRESH_INTERVAL_MS) refresh();
	return known?.revision ?? null;
}

/** Publishes the database catalogue revision to KV when it changed. */
export async function publishCatalogueRevision(): Promise<{ revision: string; changed: boolean }> {
	const { data, error } = await getSupabaseAdmin()
		.rpc("gateway_catalogue_revision")
		.abortSignal(AbortSignal.timeout(10_000));
	if (error || data === null || data === undefined) throw new Error("gateway_catalogue_revision_failed");
	const revision = String(data);
	const cache = getCache();
	const current = await cache.get(CATALOGUE_REVISION_KEY, "text");
	if (current === revision) return { revision, changed: false };
	await cache.put(CATALOGUE_REVISION_KEY, revision);
	known = { revision, checkedAt: Date.now() };
	return { revision, changed: true };
}

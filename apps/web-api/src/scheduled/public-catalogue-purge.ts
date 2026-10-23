import type { Env } from "@/env";
import { resolveCacheScope } from "@/cache/scopes";
import { getDataClient } from "@/data/supabase";
import { purgeWorkerCacheTags } from "@/http/invalidation";

// Wait until catalogue writes have been quiet this long, so one migration or
// sync run purges once instead of on every tick while it is still writing.
const QUIET_MS = 30_000;
// A writer that never goes quiet must not hold back purges forever.
const MAX_DELAY_MS = 5 * 60_000;
const DEFAULT_WEB_REVALIDATE_URL = "https://phaseo.app/api/cache/revalidate";

export type PublicCataloguePurgeState = {
	revision: number | string;
	changed_at: string;
	purged_revision: number | string;
	pending_since: string | null;
};

export function shouldPurgeCatalogue(state: PublicCataloguePurgeState, now: number) {
	if (Number(state.revision) <= Number(state.purged_revision)) return false;
	if (now - Date.parse(state.changed_at) >= QUIET_MS) return true;
	return state.pending_since !== null && now - Date.parse(state.pending_since) >= MAX_DELAY_MS;
}

async function revalidateWebsite(env: Env) {
	const secret = env.REVALIDATION_SECRET?.trim();
	if (!secret) return { ok: false, error: "revalidation_secret_missing" };
	try {
		const response = await fetch(env.WEB_REVALIDATE_URL?.trim() || DEFAULT_WEB_REVALIDATE_URL, {
			method: "POST",
			headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
			body: JSON.stringify({ scope: "catalogue" }),
			signal: AbortSignal.timeout(10_000),
		});
		return response.ok ? { ok: true } : { ok: false, error: `http_${response.status}` };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Purges the Cloudflare catalogue tags and then the website's page cache once
 * the database reports a catalogue change. Cloudflare goes first so the
 * website's re-render reads fresh data rather than the old cached responses.
 */
export async function handlePublicCataloguePurgeScheduledEvent(
	event: ScheduledController,
	env: Env,
	ctx: object,
): Promise<void> {
	const db = getDataClient(env);
	const stateResult = await db.rpc("get_public_catalogue_purge_state").maybeSingle<PublicCataloguePurgeState>();
	if (stateResult.error || !stateResult.data) {
		if (stateResult.error) console.error("public_catalogue_purge_state_failed", stateResult.error.message);
		return;
	}
	const state = stateResult.data;
	if (!shouldPurgeCatalogue(state, event.scheduledTime)) return;

	const revision = Number(state.revision);
	const { tags } = resolveCacheScope("catalogue", null);
	let purge: Awaited<ReturnType<typeof purgeWorkerCacheTags>>;
	try {
		purge = await purgeWorkerCacheTags(ctx, [...tags]);
	} catch (error) {
		purge = { success: false, errors: error instanceof Error ? error.message : String(error), unavailable: false, tags: [...tags] };
	}
	// Leave the revision pending so the next tick retries; the cache lifetimes
	// still bound how stale anything can get.
	if (!purge.success) {
		console.error("public_catalogue_purge_failed", { revision, unavailable: purge.unavailable, errors: purge.errors });
		return;
	}

	const website = await revalidateWebsite(env);
	if (!website.ok) console.error("public_catalogue_website_revalidate_failed", { revision, error: website.error });

	const marked = await db.rpc("mark_public_catalogue_purged", { p_revision: revision });
	if (marked.error) console.error("public_catalogue_purge_mark_failed", marked.error.message);
	const audit = await db.from("web_cache_purge_events").insert({
		scope: "catalogue-auto",
		target_id: String(revision),
		tags: [...tags],
		actor_user_id: null,
		purge_succeeded: true,
		purge_error: website.ok ? null : { website: website.error },
	});
	if (audit.error) console.error("public_catalogue_purge_audit_failed", audit.error.message);
	console.log("public_catalogue_purged", { revision, website: website.ok });
}

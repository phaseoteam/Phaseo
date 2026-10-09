// Purpose: Publish and read per-workspace customer rate-limit tiers.
// Why: The request path must learn a workspace's limit without Postgres.
// How: A scheduled publisher pages every workspace through
//      gateway_customer_rate_limit_inputs, classifies it with the trust ladder
//      and writes `customer-quota:v2:{workspace}` to KV only when the value
//      changed (KV writes are the dominant cost). What was last published is
//      remembered in 16 manifest shards keyed by the workspace id's first hex
//      digit, so an unchanged run costs 16 KV reads and no writes. The plain
//      `new` tier is the meaning of a missing key and is never written. The
//      request path reads the key through the tiered cache (isolate L1 + KV).
import { getCache, getSupabaseAdmin } from "@/runtime/env";
import { tieredRead } from "@core/tiered-cache";
import {
	customerRateLimitLadder, customerTierKey, isPublishedCustomerTier, parseCustomerRateLimitLadder,
	publishedCustomerTier, resolveCustomerLimits,
	type CustomerRateLimitInputs, type PublishedCustomerTier, type ResolvedCustomerLimits,
} from "@core/customer-rate-limit-ladder";

const MANIFEST_VERSION = 1;
const MANIFEST_SHARDS = "0123456789abcdef".split("");
const PAGE_SIZE = 1000;
const WRITE_CONCURRENCY = 25;
/**
 * KV writes/deletes per run. Workers KV allows 1,000 operations per invocation,
 * shared with the other scheduled jobs; with the manifest reads and writes a run
 * uses at most 432. A large backfill continues over several runs.
 */
export const MAX_TIER_WRITES_PER_RUN = 400;
/** Workers KV operations allowed per invocation. */
export const KV_OPERATIONS_PER_INVOCATION = 1000;
export const TIER_MANIFEST_SHARD_COUNT = MANIFEST_SHARDS.length;

export const customerTierManifestKey = (shard: string) => `customer-quota:v2-manifest:${shard}`;

type Manifest = { v: number; w: Record<string, string> };

/**
 * Reads the workspace's published tier: isolate memory for 60 s, then KV.
 * The publisher is the only writer; the loader never consults Postgres, so a
 * missing key resolves to the `new` tier and is cached in this isolate only.
 */
export async function readCustomerLimits(workspaceId: string, ladderRaw: string | undefined): Promise<ResolvedCustomerLimits> {
	const published = await tieredRead<PublishedCustomerTier>({
		key: customerTierKey(workspaceId),
		loader: async () => null,
		l1FreshMs: 60_000,
		// Pick up a workspace's first publication (or a KV blip) sooner.
		negativeFreshMs: 30_000,
		l2: false,
		l3: { freshS: 60 },
		// Never write the loader's "not published" result back to KV.
		isShareable: () => false,
		// Published values change only when rewritten; never re-load them.
		isFreshInL3: () => true,
		validate: isPublishedCustomerTier,
	});
	return resolveCustomerLimits(published, customerRateLimitLadder(ladderRaw), Date.now());
}

/** Same envelope as the tiered cache's KV layer (`{ v, at }`), without its isolate fill. */
async function putPublished(kv: KVNamespace, workspaceId: string, value: PublishedCustomerTier): Promise<void> {
	await kv.put(customerTierKey(workspaceId), JSON.stringify({ v: value, at: Date.now() }));
}

function shardOf(workspaceId: string): string {
	const shard = workspaceId.charAt(0).toLowerCase();
	return MANIFEST_SHARDS.includes(shard) ? shard : "0";
}

async function readManifest(kv: KVNamespace, shard: string): Promise<Manifest> {
	// Fail the run rather than treat an unreadable manifest as empty and rewrite every key.
	const raw = await kv.get(customerTierManifestKey(shard), "text");
	if (!raw) return { v: MANIFEST_VERSION, w: {} };
	const parsed = JSON.parse(raw) as Manifest;
	if (parsed?.v !== MANIFEST_VERSION || typeof parsed.w !== "object" || parsed.w === null) return { v: MANIFEST_VERSION, w: {} };
	return parsed;
}

export type CustomerTierPublishSummary = {
	workspaces: number;
	written: number;
	unchanged: number;
	deleted: number;
	deferred: number;
	failed: number;
	/** True once every workspace's current tier is in KV. */
	complete: boolean;
	tiers: Record<string, number>;
};

export async function publishCustomerRateLimitTiers(options: {
	ladderRaw: string | undefined;
	now?: number;
	maxWrites?: number;
}): Promise<CustomerTierPublishSummary> {
	const kv = getCache();
	const supabase = getSupabaseAdmin();
	const now = options.now ?? Date.now();
	const maxWrites = options.maxWrites ?? MAX_TIER_WRITES_PER_RUN;
	// Unlike the request path, refuse to publish with invalid tuning.
	const ladder = parseCustomerRateLimitLadder(options.ladderRaw);
	const manifests = new Map(await Promise.all(MANIFEST_SHARDS.map(async shard => [shard, await readManifest(kv, shard)] as const)));
	const changedShards = new Set<string>();
	const seen = new Set<string>();
	const summary: CustomerTierPublishSummary = {
		workspaces: 0, written: 0, unchanged: 0, deleted: 0, deferred: 0, failed: 0, complete: false, tiers: {},
	};
	let budget = maxWrites;
	let scanned = false;

	const run = async (tasks: Array<() => Promise<void>>) => {
		for (let index = 0; index < tasks.length; index += WRITE_CONCURRENCY) {
			await Promise.all(tasks.slice(index, index + WRITE_CONCURRENCY).map(task => task()));
		}
	};

	try {
		let after: string | null = null;
		for (;;) {
			const { data, error } = await supabase.rpc("gateway_customer_rate_limit_inputs", { p_after: after, p_limit: PAGE_SIZE });
			if (error) throw new Error(error.message || "Failed to load customer rate-limit inputs");
			const rows = (data ?? []) as CustomerRateLimitInputs[];
			const writes: Array<() => Promise<void>> = [];
			for (const row of rows) {
				const workspaceId = row.workspace_id;
				seen.add(workspaceId);
				summary.workspaces++;
				const published = publishedCustomerTier(row, ladder, now);
				const label = published.override?.requestsPerMinute !== undefined ? "override" : published.tier;
				summary.tiers[label] = (summary.tiers[label] ?? 0) + 1;
				const fingerprint = label === "new" && !published.override ? undefined : JSON.stringify(published);
				const shard = shardOf(workspaceId);
				const manifest = manifests.get(shard)!;
				if (manifest.w[workspaceId] === fingerprint) {
					summary.unchanged++;
					continue;
				}
				if (budget <= 0) {
					summary.deferred++;
					continue;
				}
				budget--;
				writes.push(async () => {
					try {
						if (fingerprint === undefined) {
							await kv.delete(customerTierKey(workspaceId));
							delete manifest.w[workspaceId];
							summary.deleted++;
						} else {
							await putPublished(kv, workspaceId, published);
							manifest.w[workspaceId] = fingerprint;
							summary.written++;
						}
						changedShards.add(shard);
					} catch {
						summary.failed++;
					}
				});
			}
			await run(writes);
			if (rows.length < PAGE_SIZE) break;
			after = rows[rows.length - 1].workspace_id;
		}
		scanned = true;

		// Deleted workspaces: only after a complete scan proved they are gone.
		const deletions: Array<() => Promise<void>> = [];
		for (const [shard, manifest] of manifests) {
			for (const workspaceId of Object.keys(manifest.w)) {
				if (seen.has(workspaceId)) continue;
				if (budget <= 0) {
					summary.deferred++;
					continue;
				}
				budget--;
				deletions.push(async () => {
					try {
						await kv.delete(customerTierKey(workspaceId));
						delete manifest.w[workspaceId];
						changedShards.add(shard);
						summary.deleted++;
					} catch {
						summary.failed++;
					}
				});
			}
		}
		await run(deletions);
	} finally {
		// Record what was written even if a later page failed, so it is not rewritten.
		await Promise.all([...changedShards].map(shard =>
			kv.put(customerTierManifestKey(shard), JSON.stringify(manifests.get(shard)))));
	}
	summary.complete = scanned && summary.deferred === 0 && summary.failed === 0;
	return summary;
}

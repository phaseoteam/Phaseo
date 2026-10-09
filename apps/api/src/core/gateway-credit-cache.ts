// Purpose: Workspace credit snapshot cache helpers.
// Why: Credit reads can be cached for fast gateway context lookup, but wallet mutations must invalidate them.

import { getBindingsIfConfigured, getCache } from "@/runtime/env";
import { computeCreditSnapshotTtlSeconds } from "@pipeline/before/context.shared";

const CREDIT_CACHE_PREFIX = "gateway:credit";
// Below this available balance the next request re-reads the wallet exactly,
// so admission near zero never relies on a write-back snapshot.
const CREDIT_WRITEBACK_FLOOR_NANOS = 1_000_000_000;
// KV accepts about one write per second per key.
const CREDIT_WRITEBACK_MIN_INTERVAL_MS = 2_000;
const MAX_TRACKED_WORKSPACES = 20_000;
const lastWriteBack = new Map<string, number>();

export function gatewayCreditCacheKey(workspaceId: string): string {
	return `${CREDIT_CACHE_PREFIX}:${workspaceId}`;
}

export function __resetCreditWriteBackForTests(): void {
	lastWriteBack.clear();
}

export async function invalidateGatewayCreditCache(workspaceId: string): Promise<void> {
	try {
		await getCache().delete(gatewayCreditCacheKey(workspaceId));
	} catch {
		// Credit cache is an acceleration layer only; DB/RPC remains authoritative.
	}
}

export function creditWriteBackEnabled(): boolean {
	return getBindingsIfConfigured()?.GATEWAY_CREDIT_WRITEBACK_ENABLED === "true";
}

/**
 * Replaces the cached credit snapshot with the exact post-charge balance
 * instead of deleting it, so the next request does not re-read the wallet.
 * Falls back to invalidation near zero, when throttled, or when no snapshot is
 * cached. Admission still applies each endpoint's minimum to `balanceNanos`.
 */
export async function writeBackGatewayCreditCache(workspaceId: string, availableNanos: number): Promise<"written" | "invalidated"> {
	const now = Date.now();
	const previous = lastWriteBack.get(workspaceId);
	if (!Number.isSafeInteger(availableNanos) || availableNanos < CREDIT_WRITEBACK_FLOOR_NANOS ||
		(previous !== undefined && now - previous < CREDIT_WRITEBACK_MIN_INTERVAL_MS)) {
		await invalidateGatewayCreditCache(workspaceId);
		return "invalidated";
	}
	const key = gatewayCreditCacheKey(workspaceId);
	try {
		const cache = getCache();
		const raw = await cache.get(key, "text");
		const current = raw ? JSON.parse(raw) as Record<string, any> : null;
		// KV has no compare-and-set, so charges finishing out of order across
		// isolates could otherwise put an older, higher balance over a newer one.
		// A charge only ever lowers the balance and top-ups go through
		// invalidation, so a write-back never raises the cached value.
		const cachedNanos = Number(current?.credit?.balanceNanos);
		if (!current || current.workspaceId !== workspaceId || !current.credit ||
			!Number.isFinite(cachedNanos) || availableNanos > cachedNanos) {
			await invalidateGatewayCreditCache(workspaceId);
			return "invalidated";
		}
		const balanceUsd = Math.round((availableNanos / 1_000_000_000) * 100) / 100;
		const next = {
			...current,
			credit: { ...current.credit, ok: true, reason: null, resetAt: null, balanceNanos: availableNanos },
			teamEnrichment: current.teamEnrichment
				? { ...current.teamEnrichment, balance_nanos: availableNanos, balance_usd: balanceUsd, balance_is_low: false }
				: null,
		};
		lastWriteBack.delete(workspaceId);
		lastWriteBack.set(workspaceId, now);
		while (lastWriteBack.size > MAX_TRACKED_WORKSPACES) {
			const oldest = lastWriteBack.keys().next();
			if (oldest.done) break;
			lastWriteBack.delete(oldest.value);
		}
		await cache.put(key, JSON.stringify(next), {
			expirationTtl: Math.max(60, computeCreditSnapshotTtlSeconds(balanceUsd)),
		});
		return "written";
	} catch {
		await invalidateGatewayCreditCache(workspaceId);
		return "invalidated";
	}
}

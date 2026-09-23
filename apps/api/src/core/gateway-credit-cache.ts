// Purpose: Workspace credit snapshot cache helpers.
// Why: Credit reads can be cached for fast gateway context lookup, but wallet mutations must invalidate them.

import { getCache } from "@/runtime/env";
import { creditAdmissionLeases } from "./credit-admission-leases";

const CREDIT_CACHE_PREFIX = "gateway:credit";

export function gatewayCreditCacheKey(workspaceId: string): string {
	return `${CREDIT_CACHE_PREFIX}:${workspaceId}`;
}

export async function invalidateGatewayCreditCache(workspaceId: string): Promise<void> {
	// Fence before network I/O, including failed deletes and in-flight refills.
	creditAdmissionLeases.invalidate(workspaceId);
	try {
		await getCache().delete(gatewayCreditCacheKey(workspaceId));
	} catch {
		// Credit cache is an acceleration layer only; DB/RPC remains authoritative.
	}
}

// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs } from "./types";
import type { ByokKeyMeta } from "@pipeline/before/types";

export type ResolvedKey = {
    key: string;
    source: "gateway" | "byok";
    byokId: string | null;
};

function orderedMetas(metaList: ByokKeyMeta[]): ByokKeyMeta[] {
    return [...metaList].sort((a, b) => {
        if (a.alwaysUse === b.alwaysUse) return 0;
        return a.alwaysUse ? -1 : 1;
    });
}

function resolveByokKey(metaList: ByokKeyMeta[]): { key: string; byokId: string | null } | null {
    for (const meta of orderedMetas(metaList)) {
        const key = meta.key;
        if (typeof key === "string" && key.trim().length > 0) {
            return { key, byokId: meta.id ?? null };
        }
    }
    return null;
}

export function resolveProviderKey(
    args: Pick<ProviderExecuteArgs, "providerId" | "byokMeta"> & { forceGatewayKey?: boolean },
    fallbackKey: () => string | undefined,
    options?: { allowEmptyFallback?: boolean }
): ResolvedKey {
    if (!args.forceGatewayKey) {
        const byok = resolveByokKey(args.byokMeta ?? []);
        if (byok) {
            return { key: byok.key, source: "byok", byokId: byok.byokId };
        }
    }

    const fallback = fallbackKey();
    if (fallback) {
        return { key: fallback, source: "gateway", byokId: null };
    }

    if (options?.allowEmptyFallback) {
        return { key: "", source: "gateway", byokId: null };
    }

    throw new Error(`${args.providerId}_key_missing`);
}


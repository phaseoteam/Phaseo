import { getSupabaseAdmin } from "@/runtime/env";
import { keyVersionToken } from "@/core/kv";

// Metadata only. Never retain credentials or private endpoint routing settings.
const TTL_MS = 5_000;
const MAX_ENTRIES = 2_000;
const MAX_MODELS = 1_000;
const entries = new Map<string, { models: Set<string>; expiresAt: number }>();
const inflight = new Map<string, Promise<Set<string> | null>>();

export async function mayHavePrivateModel(args: {
    workspaceId: string;
    apiKeyId: string;
    model: string;
}): Promise<boolean> {
    const version = await keyVersionToken("id", args.apiKeyId, { useL1Cache: true, l1TtlMs: 5_000 });
    const key = JSON.stringify([args.workspaceId, args.apiKeyId, version]);
    const cached = entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.models.has(args.model);
    let pending = inflight.get(key);
    if (!pending) {
        const startedAt = Date.now();
        pending = (async () => {
            try {
                const { data, error, count } = await getSupabaseAdmin()
                    .from("workspace_private_models")
                    .select("model_id", { count: "exact" })
                    .eq("workspace_id", args.workspaceId)
                    .eq("enabled", true)
                    .limit(MAX_MODELS);
                // A partial result must never masquerade as an absent private model.
                if (error || !data || count !== data.length) return null;
                const models = new Set(data.map((row) => String(row.model_id)));
                if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
                entries.set(key, { models, expiresAt: startedAt + TTL_MS });
                return models;
            } catch {
                return null;
            }
        })();
        inflight.set(key, pending);
        void pending.finally(() => inflight.delete(key));
    }
    const models = await pending;
    // Errors use the existing fresh lookup, which retains its fail-closed behavior.
    return models === null || models.has(args.model);
}

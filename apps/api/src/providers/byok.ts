// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { dispatchBackground, getSupabaseAdmin, getBindings, configureRuntime, clearRuntime } from "@/runtime/env";
import { decryptBYOK, bytesToString } from "@pipeline/byok/decrypt";
import type { ByokKeyMeta } from "@pipeline/before/types";

export type ByokResolution = {
    key: string;
    keyId: string;
    meta: ByokKeyMeta;
};

function orderedMetas(meta: ByokKeyMeta[]): ByokKeyMeta[] {
    return [...meta].sort((a, b) => {
        if (a.alwaysUse === b.alwaysUse) return 0;
        return a.alwaysUse ? -1 : 1;
    });
}

export async function loadByokKey(options: {
    teamId: string;
    providerId: string;
    metaList: ByokKeyMeta[];
}): Promise<ByokResolution | null> {
    const { teamId, providerId, metaList } = options;
    if (!metaList.length) {
        // console.log(`[DEBUG BYOK] No byokMeta provided for team ${teamId}, provider ${providerId}`);
        return null;
    }

    // console.log(`[DEBUG BYOK] Loading BYOK for team ${teamId}, provider ${providerId}, meta count: ${metaList.length}`);

    const supabase = getSupabaseAdmin();
    const ordered = orderedMetas(metaList);

    for (const meta of ordered) {
        try {
            // console.log(`[DEBUG BYOK] Trying meta ID ${meta.id}, alwaysUse: ${meta.alwaysUse}`);
            const { data, error } = await supabase
                .from("byok_keys")
                .select("id, key_version, enc_iv, enc_value, enc_tag, enc_iv_b64, enc_ct_b64, enc_tag_b64, enc_b64")
                .eq("id", meta.id)
                .eq("team_id", teamId)
                .eq("provider_id", providerId)
                .eq("enabled", true)
                .maybeSingle();

            if (error || !data) {
                // console.log(`[DEBUG BYOK] No key found for meta ID ${meta.id}: ${error?.message || 'not found'}`);
                continue;
            }

            // console.log(`[DEBUG BYOK] Found and decrypting key for meta ID ${meta.id}`);
            const decrypted = await decryptBYOK({
                key_version: data.key_version,
                enc_iv: data.enc_iv,
                enc_value: data.enc_value,
                enc_tag: data.enc_tag,
                enc_iv_b64: (data as any).enc_iv_b64,
                enc_ct_b64: (data as any).enc_ct_b64,
                enc_tag_b64: (data as any).enc_tag_b64,
                enc_b64: (data as any).enc_b64,
                team_id: teamId,
                provider_id: providerId,
            });

            const key = bytesToString(decrypted);
            decrypted.fill(0);

            dispatchBackground(
                (async () => {
                    configureRuntime(getBindings());
                    try {
                        await supabase
                            .from("byok_keys")
                            .update({ last_used_at: new Date().toISOString() })
                            .eq("id", data.id);
                    } finally {
                        clearRuntime();
                    }
                })()
            );

            // console.log(`[DEBUG BYOK] Successfully loaded BYOK for meta ID ${meta.id}`);
            return { key, keyId: data.id, meta };
        } catch (err) {
            console.error(`[DEBUG BYOK] Failed to load BYOK key for meta ID ${meta.id}:`, err);
        }
    }

    // console.log(`[DEBUG BYOK] No BYOK keys found for team ${teamId}, provider ${providerId}`);
    return null;
}


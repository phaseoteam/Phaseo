import { z } from "zod";
import { getSupabaseAdmin } from "@/runtime/env";
import { publicCatalogEndpoints, publicCatalogKey, publishPublicCatalogFromControlPlane } from "@/pipeline/before/contextBundle";

// Snapshot count, not model count: each wire endpoint has a separate key.
export const PUBLIC_CATALOG_TARGET_LIMIT = 20;
const targetsSchema = z.array(z.object({
    model: z.string().trim().min(1).max(512).refine(value => !value.startsWith("@")),
    endpoint: z.enum(["text.generate", "responses", "chat.completions", "messages"]),
}).strict()).max(PUBLIC_CATALOG_TARGET_LIMIT);

export async function publishConfiguredPublicCatalog(rawTargets: string) {
    // Validate the whole configuration before doing any I/O. No silent truncation.
    const targets = [...new Map(targetsSchema.parse(JSON.parse(rawTargets)).map(target =>
        [publicCatalogKey(target.model, publicCatalogEndpoints(target.endpoint)), target],
    )).values()];
    const supabase = getSupabaseAdmin();
    const summary = { targets: targets.length, published: 0, skipped: 0, failed: 0 };
    let next = 0;
    async function consume() {
        while (next < targets.length) {
            const target = targets[next++];
            const endpoints = publicCatalogEndpoints(target.endpoint);
            try {
                const { data, error } = await supabase.rpc("gateway_fetch_public_catalog", {
                    p_model: target.model, p_endpoints: endpoints,
                }).abortSignal(AbortSignal.timeout(10_000));
                if (error) throw new Error("public_catalog_query_failed");
                if (await publishPublicCatalogFromControlPlane(data, { model: target.model, endpoints })) summary.published++;
                else summary.skipped++;
            } catch {
                // Do not log database payloads or arbitrary configured names.
                summary.failed++;
            }
        }
    }
    await Promise.all([consume(), consume()]);
    return summary;
}

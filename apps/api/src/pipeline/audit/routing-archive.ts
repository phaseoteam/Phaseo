import { getBindings } from "@/runtime/env";
import { buildRoutingObservability } from "./routing-observability";

const MAX_ARCHIVE_BYTES = 1024 * 1024;

export async function writeRoutingArchive(
    bucket: R2Bucket,
    workspaceId: string,
    requestId: string,
    routing: Record<string, unknown>,
) {
    const bytes = new TextEncoder().encode(JSON.stringify({
        ...routing, version: 1, workspace_id: workspaceId, request_id: requestId,
    }));
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("routing_archive_too_large");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const key = `workspaces/${workspaceId}/routing/v1/${encodeURIComponent(requestId)}/${sha256}.json`;
    const stored = await bucket.put(key, bytes, { httpMetadata: { contentType: "application/json" } });
    if (!stored) throw new Error("routing_archive_write_failed");
    return { version: 1, key, sha256, bytes: bytes.byteLength };
}

export async function archiveRoutingMetadata(args: {
    workspaceId?: string | null;
    requestId: string;
    endpoint: string;
    model?: string | null;
    requestedModel?: string | null;
    provider?: string | null;
    providerApiModelId?: string | null;
    providerModelSlug?: string | null;
    providerAttempts?: Array<Record<string, unknown>> | null;
    detailMetadata?: Record<string, unknown> | null;
}): Promise<Record<string, unknown>> {
    // Only gateway-created references are trusted; caller metadata cannot suppress persistence.
    const { routing_archive: _untrusted, ...metadata } = args.detailMetadata ?? {};
    if (!args.workspaceId || !Array.isArray(metadata.routing_snapshot)) return metadata;
    try {
        const bucket = getBindings().GATEWAY_IO_LOGS_BUCKET;
        if (!bucket) return metadata;
        const routing = buildRoutingObservability({
            ...args,
            requestedModel: args.requestedModel ?? args.model ?? "unknown",
            routingSnapshot: metadata.routing_snapshot,
            routingDiagnostics: metadata.routing_diagnostics as Record<string, unknown> | null,
        });
        const pointer = await writeRoutingArchive(bucket, args.workspaceId, args.requestId, {
            routing_trace: {
                algorithm_version: routing.routingTrace.algorithm.version ?? null,
                random_seed: routing.routingTrace.algorithm.seed ?? null,
                selection_method: routing.routingTrace.algorithm.selectionMethod ?? null,
                routing_mode: routing.routingTrace.routing_mode,
                priority: routing.routingTrace.priority,
                requested_model: routing.routingTrace.model,
                endpoint: routing.routingTrace.endpoint,
                final_candidate_count: routing.routingTrace.final_candidate_count,
                pool_bounds: routing.routingTrace.algorithm.poolBounds,
                requested_routing: routing.routingTrace.requested_routing,
                sticky_routing: routing.routingTrace.sticky_routing,
            },
            routing_decisions: [...routing.rankedDecisions, ...routing.excludedDecisions].map(entry => {
                const { provider, ...decision } = entry;
                return { ...decision, routing_decision_id: `archive-${decision.decision_order}`, provider_slug: provider };
            }),
            metadata: {
                routing_snapshot: metadata.routing_snapshot,
                routing_diagnostics: metadata.routing_diagnostics ?? null,
            },
        });
        const { routing_snapshot: _snapshot, routing_diagnostics: _diagnostics, ...compact } = metadata;
        return { ...compact, routing_archive: pointer };
    } catch {
        console.warn("routing_archive_failed", { requestId: args.requestId });
        // Preserve full database diagnostics if object storage is unavailable.
        return metadata;
    }
}

import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { compileGatewayContext } from "@/pipeline/before/context";
import { compileWorkspacePolicy } from "@/pipeline/before/workspacePolicy";
import { computeStaticTtl } from "@/pipeline/before/context.shared";
import { escrowWorkspace, workspaceState } from "./client";
import { sealSnapshot, digest } from "./snapshots";
import type { PublishedKey, CompiledRequestSnapshot } from "./contracts";

export type PublicationTarget = { model: string; endpoint: string };
// Full rebuild is deliberately bounded to the opted-in test workspace. The
// database outbox coalesces mutations; a failed build leaves admission fenced.
export async function publishEscrowWorkspace(targets: PublicationTarget[]): Promise<void> {
    const workspaceId = escrowWorkspace();
    if (!workspaceId || targets.length < 1 || targets.length > 32) throw new Error("invalid_publication_targets");
    const env = getBindings();
    if (!env.GATEWAY_REQUEST_STATE_KV || !env.GATEWAY_REQUEST_STATE_ENCRYPTION_KEY) throw new Error("publication_bindings_missing");
    const db = getSupabaseAdmin();
    const stub = workspaceState(workspaceId);
    const revision = await stub.beginPublication();
    const change = await db.from("gateway_request_state_changes").select("revision").eq("workspace_id", workspaceId).single();
    if (change.error) throw new Error("publication_revision_unavailable");
    const keys = await db.from("keys").select("id,kid,hash,status,expires_at,soft_blocked,oauth_client_id,scopes").eq("workspace_id", workspaceId).limit(101);
    if (keys.error || !keys.data || keys.data.length > 100) throw new Error("publication_keys_unavailable");
    let validUntil = Date.now() + 120_000;
    const previousKeys = new Map((await stub.publicationKeys()).map(key => [key.kid, key]));
    for (const row of keys.data) {
        const previous = previousKeys.get(row.kid);
        previousKeys.delete(row.kid);
        const revoked = row.status === "deleted" || row.status === "revoked";
        const published: PublishedKey = { id: row.id, kid: row.kid, workspace_id: workspaceId,
            hash: revoked ? previous?.hash ?? "0".repeat(64) : row.hash,
            status: revoked ? "revoked" : "active", expires_at: row.expires_at, revision,
            soft_blocked: Boolean(row.soft_blocked) || row.status !== "active" || Boolean(row.oauth_client_id) };
        // OAuth requires its additional membership/authorization contract; never
        // turn an OAuth-derived key into a plain API key in this rollout.
        await stub.publishKey(published);
        await env.GATEWAY_REQUEST_STATE_KV.put(`directory:${row.kid}`, workspaceId);
        if (published.status !== "active" || published.soft_blocked) continue;
        const policy = await compileWorkspacePolicy({ workspaceId, apiKeyId: row.id }, true);
        for (const target of targets) {
            const context = await compileGatewayContext({ workspaceId, apiKeyId: row.id, ...target, disableCache: true });
            const ttl = computeStaticTtl(context);
            if (ttl === null) throw new Error("pricing_boundary_requires_republication");
            const deadline = Math.min(Date.now() + ttl * 1000, context.publicCatalogExpiresAt ?? Number.MAX_SAFE_INTEGER, validUntil);
            validUntil = Math.min(validUntil, deadline);
            const compiled: CompiledRequestSnapshot = { version: 1, workspaceId, apiKeyId: row.id, ...target,
                testingMode: false, validUntil: deadline, context: { ...context, contextTelemetry: undefined }, policy };
            const sealed = await sealSnapshot(compiled, env.GATEWAY_REQUEST_STATE_ENCRYPTION_KEY);
            const hash = await digest(sealed);
            const reference = { key: `snapshot:v1:${workspaceId}:${hash}`, digest: hash, validUntil: deadline, revision };
            await env.GATEWAY_REQUEST_STATE_KV.put(reference.key, sealed);
            await stub.publishSnapshot({ apiKeyId: row.id, ...target, testingMode: false, reference, sealed });
        }
    }
    for (const missing of previousKeys.values()) await stub.publishKey({ ...missing, status: "revoked", revision });
    const after = await db.from("gateway_request_state_changes").select("revision").eq("workspace_id", workspaceId).single();
    if (after.error || after.data.revision !== change.data.revision) throw new Error("publication_source_changed");
    await stub.commitPublication(revision, validUntil);
    const ack = await db.rpc("gateway_request_state_ack_changes", { p_workspace_id: workspaceId, p_revision: change.data.revision });
    if (ack.error) throw new Error("publication_ack_failed");
}

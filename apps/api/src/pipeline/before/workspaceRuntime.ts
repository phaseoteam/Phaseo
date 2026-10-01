import { getBindingsIfConfigured, getCache, getSupabaseAdmin } from "@/runtime/env";
import { WorkspaceRuntimeCache } from "./workspaceRuntimeCache";
import { isWorkspaceRuntimeFresh, workspaceRuntimeSchema, type WorkspaceRuntimeSnapshot } from "./workspaceRuntimeSnapshot";

export const workspaceRuntimeCache = new WorkspaceRuntimeCache(() => getCache());

// Read-through only: mutation publication must always fetch its own post-commit
// source, never join an older reader. No resolved snapshots live in this map.
const sourceRefills = new Map<string, Promise<WorkspaceRuntimeSnapshot>>();

export async function refillWorkspaceRuntime(workspaceId: string, version: string): Promise<WorkspaceRuntimeSnapshot> {
    const key = `${workspaceId}:${version}`;
    let pending = sourceRefills.get(key);
    if (!pending) {
        if (sourceRefills.size >= 32) throw new Error("workspace_runtime_refill_capacity");
        pending = fetchWorkspaceRuntime(workspaceId).finally(() => {
            if (sourceRefills.get(key) === pending) sourceRefills.delete(key);
        });
        sourceRefills.set(key, pending);
    }
    // Each caller owns its settings and credential-reference objects.
    return structuredClone(await pending);
}

/** Rollout gate: install and validate the additive RPCs before enabling. */
export function workspaceRuntimeEnabled(): boolean {
    return getBindingsIfConfigured()?.GATEWAY_WORKSPACE_RUNTIME_ENABLED === "true";
}

export async function fetchWorkspaceRuntime(workspaceId: string): Promise<WorkspaceRuntimeSnapshot> {
    const { data, error } = await getSupabaseAdmin().rpc("gateway_fetch_workspace_runtime", { p_workspace_id: workspaceId });
    if (error) throw new Error("workspace_runtime_source_failed");
    const parsed = workspaceRuntimeSchema.safeParse(data);
    if (!parsed.success || !isWorkspaceRuntimeFresh(parsed.data, workspaceId)) throw new Error("workspace_runtime_source_invalid");
    return parsed.data;
}

/** Invoked before advertising a new workspace version, after the DB commit. */
export async function publishWorkspaceRuntime(workspaceId: string, version: string): Promise<void> {
    const snapshot = await fetchWorkspaceRuntime(workspaceId);
    if (!await workspaceRuntimeCache.publish(snapshot, workspaceId, version)) throw new Error("workspace_runtime_publication_failed");
}

import { getBindingsIfConfigured, getCache, getSupabaseAdmin } from "@/runtime/env";
import { WorkspaceRuntimeCache } from "./workspaceRuntimeCache";
import { isWorkspaceRuntimeFresh, workspaceRuntimeSchema, type WorkspaceRuntimeSnapshot } from "./workspaceRuntimeSnapshot";

export const workspaceRuntimeCache = new WorkspaceRuntimeCache(() => getCache());

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

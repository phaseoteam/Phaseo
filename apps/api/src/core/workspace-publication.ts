import { bumpWorkspacePolicyVersion } from "@/pipeline/before/workspacePolicy";
import { invalidatePrivateRoutes } from "@/pipeline/before/privateModelCache";
import { publishWorkspaceRuntime, workspaceRuntimeEnabled } from "@/pipeline/before/workspaceRuntime";
import { getBindingsIfConfigured } from "@/runtime/env";
import { publishDurableWorkspaceMutation } from "./workspace-publication-outbox";

/** Call after committing a workspace mutation. Work is constant in API-key
 * count; it neither lists keys nor writes a marker for each key. Credit and
 * key-auth authority remain independently invalidated. */
export async function publishWorkspaceMutation(workspaceId: string) {
    if (getBindingsIfConfigured()?.GATEWAY_WORKSPACE_PUBLICATION_ENABLED === "true") {
        return publishDurableWorkspaceMutation(workspaceId, publishWorkspaceMutationNow);
    }
    return publishWorkspaceMutationNow(workspaceId);
}

/** Used only by the lease-owning durable publisher or the legacy gated-off path. */
export async function publishWorkspaceMutationNow(workspaceId: string) {
    const [version, privateRoutes] = await Promise.allSettled([
        workspaceRuntimeEnabled()
            ? bumpWorkspacePolicyVersion(workspaceId, version => publishWorkspaceRuntime(workspaceId, version))
            : bumpWorkspacePolicyVersion(workspaceId),
        invalidatePrivateRoutes(workspaceId, { requirePublication: true }),
    ]);
    if (version.status === "rejected" || privateRoutes.status === "rejected") {
        throw new Error("workspace_publication_failed");
    }
    const policyVersion = version.value;
    // Policy and context share the same generation, read and local lease.
    return { contextVersion: policyVersion, policyVersion };
}

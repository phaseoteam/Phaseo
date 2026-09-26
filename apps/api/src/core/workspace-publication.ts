import { bumpWorkspacePolicyVersion } from "@/pipeline/before/workspacePolicy";
import { invalidatePrivateRoutes } from "@/pipeline/before/privateModelCache";

/** Call after committing a workspace mutation. Work is constant in API-key
 * count; it neither lists keys nor writes a marker for each key. Credit and
 * key-auth authority remain independently invalidated. */
export async function publishWorkspaceMutation(workspaceId: string) {
    const [version, privateRoutes] = await Promise.allSettled([
        bumpWorkspacePolicyVersion(workspaceId),
        invalidatePrivateRoutes(workspaceId, { requirePublication: true }),
    ]);
    if (version.status === "rejected" || privateRoutes.status === "rejected") {
        throw new Error("workspace_publication_failed");
    }
    const policyVersion = version.value;
    // Policy and context share the same generation, read and local lease.
    return { contextVersion: policyVersion, policyVersion };
}

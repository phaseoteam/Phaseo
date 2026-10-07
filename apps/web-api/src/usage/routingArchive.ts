import type { Env } from "@/env";

export async function readRoutingArchive(
    env: Env,
    workspaceId: string,
    requestId: string,
    pointer: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
    const prefix = `workspaces/${workspaceId}/routing/v1/${encodeURIComponent(requestId)}/`;
    if (pointer.version !== 1 || typeof pointer.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(pointer.sha256)
        || pointer.key !== `${prefix}${pointer.sha256}.json`
        || typeof pointer.bytes !== "number" || pointer.bytes <= 0 || pointer.bytes > 1024 * 1024) return null;
    try {
        const object = await env.GATEWAY_IO_LOGS_BUCKET?.get(pointer.key as string);
        if (!object || object.size !== pointer.bytes) return null;
        const bytes = await object.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (sha256 !== pointer.sha256) return null;
        const archive = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
        if (archive.version !== 1 || archive.workspace_id !== workspaceId || archive.request_id !== requestId
            || !Array.isArray(archive.routing_decisions)) return null;
        return archive;
    } catch {
        console.warn("routing_archive_read_failed", { requestId });
        return null;
    }
}

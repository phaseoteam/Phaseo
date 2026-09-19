import type { GatewayContextData, WorkspacePolicy } from "@/pipeline/before/types";

export type PublishedKey = {
    id: string;
    kid: string;
    workspace_id: string;
    status: "active" | "revoked";
    hash: string;
    expires_at: string | null;
    soft_blocked: boolean;
    revision: number;
};
export type CompiledRequestSnapshot = {
    version: 1;
    workspaceId: string;
    apiKeyId: string;
    model: string;
    endpoint: string;
    testingMode: boolean;
    // Absolute deadline derived from pricing/configuration effective windows.
    // KV retention never extends the validity of a compiled snapshot.
    validUntil: number;
    context: GatewayContextData;
    policy: WorkspacePolicy;
};
export type SnapshotReference = {
    key: string;
    digest: string;
    validUntil: number;
    revision: number;
};
export type SealedSnapshot = { version: 1; iv: string; ciphertext: string };

export function snapshotSlot(keyId: string, model: string, endpoint: string, testingMode: boolean): string {
    return JSON.stringify([keyId, model, endpoint, testingMode]);
}

export function validatePublishedKey(key: PublishedKey, workspaceId: string): void {
    if (!key || key.workspace_id !== workspaceId || !key.id ||
        !/^[A-Za-z0-9]{6,64}$/.test(key.kid) || !/^[a-f0-9]{64}$/.test(key.hash) ||
        !Number.isSafeInteger(key.revision) || key.revision < 1 ||
        (key.status !== "active" && key.status !== "revoked") ||
        typeof key.soft_blocked !== "boolean" ||
        (key.expires_at !== null && !Number.isFinite(Date.parse(key.expires_at)))) {
        throw new Error("invalid_published_key");
    }
}

export function validateSnapshot(value: CompiledRequestSnapshot, expected: {
    workspaceId: string; apiKeyId: string; model: string; endpoint: string; testingMode: boolean;
}): void {
    if (!value || value.version !== 1 || value.workspaceId !== expected.workspaceId ||
        value.apiKeyId !== expected.apiKeyId || value.model !== expected.model ||
        value.endpoint !== expected.endpoint || value.testingMode !== expected.testingMode ||
        !Number.isSafeInteger(value.validUntil) || value.validUntil <= Date.now() ||
        value.context?.workspaceId !== expected.workspaceId ||
        !Array.isArray(value.context?.providers) || !value.context?.pricing || !value.policy) {
        throw new Error("invalid_request_snapshot");
    }
}

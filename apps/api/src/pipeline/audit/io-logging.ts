import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { isGatewayIoLoggingFeatureEnabled } from "@/core/feature-flags";

export type GatewayIoLogStatus = "not_enabled" | "stored" | "missing_bucket" | "too_large" | "error" | "deleted";

export type GatewayIoLogColumns = {
    io_log_status: GatewayIoLogStatus;
    io_log_storage_provider?: string | null;
    io_log_bucket?: string | null;
    io_log_object_key?: string | null;
    io_log_bytes?: number | null;
    io_log_sha256?: string | null;
    io_log_content_type?: string | null;
    io_log_retention_until?: string | null;
    io_log_error?: string | null;
};

type GatewayIoLogInput = {
    requestId: string;
    workspaceId: string;
    appId?: string | null;
    keyId?: string | null;
    endpoint?: string | null;
    modelId?: string | null;
    provider?: string | null;
    statusCode?: number | null;
    success: boolean;
    requestPayload?: unknown;
    gatewayResponse?: unknown;
    providerRequest?: unknown;
    providerResponse?: unknown;
    metadata?: unknown;
};

type GatewayIoLogMetadataRow = GatewayIoLogColumns & {
    workspace_id: string;
    request_id: string;
};

export type WorkspaceIoLoggingSettings = {
    enabled: boolean;
    retentionDays: number;
    includeProviderPayloads: boolean;
    billingStatus: "active" | "grace" | "suspended";
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 90;
const settingsCache = new Map<string, { value: WorkspaceIoLoggingSettings; expiresAt: number }>();

function normalizeRetentionDays(value: unknown): number {
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(numeric)) return DEFAULT_RETENTION_DAYS;
    return Math.max(DEFAULT_RETENTION_DAYS, Math.min(365, Math.trunc(numeric)));
}

function normalizeMaxBytes(value: unknown): number {
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_MAX_BYTES;
    return Math.max(64 * 1024, Math.min(100 * 1024 * 1024, Math.trunc(numeric)));
}

function isMissingColumnError(error: unknown, column: string): boolean {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const code = String(record?.code ?? "");
    const message = String(record?.message ?? "").toLowerCase();
    return (code === "PGRST204" || code === "42703") && message.includes(column.toLowerCase());
}

function sanitizeJsonValue(value: unknown): unknown {
    if (value === undefined) return null;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
}

function isoDatePath(date: Date): string {
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const input = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function getWorkspaceIoLoggingSettings(workspaceId: string): Promise<WorkspaceIoLoggingSettings> {
    const now = Date.now();
    const cached = settingsCache.get(workspaceId);
    if (cached && cached.expiresAt > now) return cached.value;

    const disabled = {
        enabled: false,
        retentionDays: DEFAULT_RETENTION_DAYS,
        includeProviderPayloads: true,
        billingStatus: "active" as const,
    };

    try {
        const client = getSupabaseAdmin();
        const primary = await client
            .from("workspace_settings")
            .select("io_logging_enabled,io_logging_retention_days,io_logging_include_provider_payloads,io_logging_billing_status")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
        let data: Record<string, any> | null = primary.data as Record<string, any> | null;
        let error = primary.error;

        if (error && isMissingColumnError(error, "io_logging_billing_status")) {
            const fallback = await client
                .from("workspace_settings")
                .select("io_logging_enabled,io_logging_retention_days,io_logging_include_provider_payloads")
                .eq("workspace_id", workspaceId)
                .maybeSingle();
            data = fallback.data as Record<string, any> | null;
            error = fallback.error;
        }

        if (error || !data) {
            settingsCache.set(workspaceId, { value: disabled, expiresAt: now + 60_000 });
            return disabled;
        }

        const row = data;
        const billingStatus =
            row.io_logging_billing_status === "grace" || row.io_logging_billing_status === "suspended"
                ? row.io_logging_billing_status
                : "active";
        const value = {
            enabled: row.io_logging_enabled === true,
            retentionDays: billingStatus === "suspended"
                ? DEFAULT_RETENTION_DAYS
                : normalizeRetentionDays(row.io_logging_retention_days),
            includeProviderPayloads: row.io_logging_include_provider_payloads !== false,
            billingStatus,
        };
        settingsCache.set(workspaceId, { value, expiresAt: now + 60_000 });
        return value;
    } catch {
        settingsCache.set(workspaceId, { value: disabled, expiresAt: now + 60_000 });
        return disabled;
    }
}

export type GatewayIoLoggingPolicy = WorkspaceIoLoggingSettings & {
    featureEnabled: boolean;
    captureEnabled: boolean;
};

export async function resolveGatewayIoLoggingPolicy(input: {
    workspaceId: string;
    keyId?: string | null;
}): Promise<GatewayIoLoggingPolicy> {
    const bindings = getBindings();
    const [featureEnabled, settings] = await Promise.all([
        isGatewayIoLoggingFeatureEnabled({
            workspaceId: input.workspaceId,
            apiKeyId: input.keyId ?? null,
        }, bindings),
        getWorkspaceIoLoggingSettings(input.workspaceId),
    ]);
    return {
        ...settings,
        featureEnabled,
        captureEnabled: featureEnabled && settings.enabled,
    };
}

async function persistGatewayIoLogMetadata(
    input: GatewayIoLogInput,
    columns: GatewayIoLogColumns,
): Promise<void> {
    const row: GatewayIoLogMetadataRow = {
        workspace_id: input.workspaceId,
        request_id: input.requestId,
        ...columns,
    };
    const { error } = await getSupabaseAdmin()
        .from("gateway_io_logs")
        .upsert(row, { onConflict: "workspace_id,request_id" });
    if (error) {
        throw new Error(`gateway_io_log_metadata_upsert_error:${error.message ?? "unknown"}`);
    }
}

async function finalizeGatewayIoLog(
    input: GatewayIoLogInput,
    columns: GatewayIoLogColumns,
): Promise<GatewayIoLogColumns> {
    try {
        await persistGatewayIoLogMetadata(input, columns);
        return columns;
    } catch (error) {
        console.error("[io-logging] failed to persist R2 metadata", {
            workspaceId: input.workspaceId,
            requestId: input.requestId,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            ...columns,
            io_log_status: "error",
            io_log_error: "Failed to persist I/O log metadata",
        };
    }
}

export async function persistGatewayIoLog(
    input: GatewayIoLogInput,
    resolvedPolicy?: GatewayIoLoggingPolicy,
): Promise<GatewayIoLogColumns> {
	const bindings = getBindings();
    const policy = resolvedPolicy ?? await resolveGatewayIoLoggingPolicy({
        workspaceId: input.workspaceId,
        keyId: input.keyId ?? null,
    });
    if (!policy.captureEnabled) {
        return finalizeGatewayIoLog(input, { io_log_status: "not_enabled" });
    }

    const bucket = bindings.GATEWAY_IO_LOGS_BUCKET;
    const bucketName = bindings.GATEWAY_IO_LOGS_BUCKET_NAME ?? "gateway-io-logs";
    if (!bucket) {
        return finalizeGatewayIoLog(input, {
            io_log_status: "missing_bucket",
            io_log_storage_provider: "cloudflare_r2",
            io_log_bucket: bucketName,
            io_log_error: "GATEWAY_IO_LOGS_BUCKET binding is not configured",
        });
    }

    const now = new Date();
    const retentionUntil = addDays(now, policy.retentionDays);
    const body = {
        schema_version: 1,
        captured_at: now.toISOString(),
        request_id: input.requestId,
        workspace_id: input.workspaceId,
        app_id: input.appId ?? null,
        key_id: input.keyId ?? null,
        endpoint: input.endpoint ?? null,
        model_id: input.modelId ?? null,
        provider: input.provider ?? null,
        status_code: input.statusCode ?? null,
        success: input.success,
        retention_until: retentionUntil.toISOString(),
        request_payload: sanitizeJsonValue(input.requestPayload),
        gateway_response: sanitizeJsonValue(input.gatewayResponse),
        provider_request: policy.includeProviderPayloads ? sanitizeJsonValue(input.providerRequest) : null,
        provider_response: policy.includeProviderPayloads ? sanitizeJsonValue(input.providerResponse) : null,
        metadata: sanitizeJsonValue(input.metadata),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const maxBytes = normalizeMaxBytes(bindings.GATEWAY_IO_LOGGING_MAX_BYTES);
    if (bytes.byteLength > maxBytes) {
        return finalizeGatewayIoLog(input, {
            io_log_status: "too_large",
            io_log_storage_provider: "cloudflare_r2",
            io_log_bucket: bucketName,
            io_log_bytes: bytes.byteLength,
            io_log_content_type: "application/json",
            io_log_retention_until: retentionUntil.toISOString(),
            io_log_error: `I/O log exceeded ${maxBytes} bytes`,
        });
    }

    const hash = await sha256Hex(bytes);
    const objectKey = `workspaces/${input.workspaceId}/${isoDatePath(now)}/${input.requestId}.json`;

    try {
        await bucket.put(objectKey, bytes, {
            httpMetadata: { contentType: "application/json" },
            customMetadata: {
                request_id: input.requestId,
                workspace_id: input.workspaceId,
                retention_until: retentionUntil.toISOString(),
                sha256: hash,
            },
        });
        return finalizeGatewayIoLog(input, {
            io_log_status: "stored",
            io_log_storage_provider: "cloudflare_r2",
            io_log_bucket: bucketName,
            io_log_object_key: objectKey,
            io_log_bytes: bytes.byteLength,
            io_log_sha256: hash,
            io_log_content_type: "application/json",
            io_log_retention_until: retentionUntil.toISOString(),
        });
    } catch (error) {
        return finalizeGatewayIoLog(input, {
            io_log_status: "error",
            io_log_storage_provider: "cloudflare_r2",
            io_log_bucket: bucketName,
            io_log_bytes: bytes.byteLength,
            io_log_sha256: hash,
            io_log_content_type: "application/json",
            io_log_retention_until: retentionUntil.toISOString(),
            io_log_error: error instanceof Error ? error.message : String(error),
        });
    }
}

export async function readGatewayIoLogObject(key: string): Promise<Record<string, unknown> | null> {
    const bucket = getBindings().GATEWAY_IO_LOGS_BUCKET;
    if (!bucket || !key.trim()) return null;
    const object = await bucket.get(key);
    if (!object) return null;
    const text = await object.text();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
}

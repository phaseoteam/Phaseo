export type ProviderModel = {
    id: string;
    payload: unknown;
};

export type ProviderDefinition = {
    id: string;
    name: string;
    requiredEnv?: string[];
    fetchModels: () => Promise<ProviderModel[]>;
};

type FetchJsonOptions = {
    url: string;
    init?: RequestInit;
    timeoutMs?: number;
};

export function defineProvider(provider: ProviderDefinition): ProviderDefinition {
    return provider;
}

function isPlaceholderValue(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return true;

    const exactPlaceholders = new Set([
        "your-api-key",
        "your-openai-key",
        "your-anthropic-key",
        "your-google-api-key",
        "your-xai-key",
        "your-deepseek-key",
        "your-minimax-key",
        "your-zai-key",
        "your-mistral-key",
        "your-moonshot-key",
        "your-webhook-url",
        "your-discord-webhook-url",
        "your-discord-user-id",
        "changeme",
        "replace-me",
        "todo",
    ]);

    if (exactPlaceholders.has(normalized)) return true;
    if (normalized.startsWith("your-")) return true;
    if (normalized.startsWith("example-")) return true;
    if (normalized === "your-resource.openai.azure.com") return true;

    try {
        const parsed = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
        if (parsed.hostname.toLowerCase() === "your-resource.openai.azure.com") {
            return true;
        }
    } catch {
        // Not a URL-like value; continue with non-URL placeholder checks.
    }

    return false;
}

export function getMissingEnvVars(requiredEnv: string[] = []): string[] {
    return requiredEnv.filter((name) => {
        const value = process.env[name];
        if (value === undefined) return true;
        return isPlaceholderValue(value);
    });
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function normalizeResponseErrorDetail(value: unknown): string | null {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
        return String(value);
    }
    const record = asRecord(value);
    if (!record) return null;
    const errorCode = toNullableInteger(
        record.code ?? record.status_code ?? record.statusCode
    );
    if (errorCode === 0) return null;

    for (const key of ["message", "msg", "detail", "error"]) {
        const nested = record[key];
        if (typeof nested === "string") {
            const trimmed = nested.trim();
            if (trimmed) return trimmed;
        }
        if (typeof nested === "number" && Number.isFinite(nested) && nested !== 0) {
            return String(nested);
        }
    }

    return errorCode === null ? null : `code ${errorCode}`;
}

function toNullableInteger(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? Math.trunc(value) : null;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    }
    return null;
}

function extractResponseErrorMessage(payload: unknown): string | null {
    const root = asRecord(payload);
    if (!root) return null;

    const directError = normalizeResponseErrorDetail(root.error);
    if (directError) return directError;

    const baseResp = asRecord(root.base_resp) ?? asRecord(root.baseResp);
    const statusCode = toNullableInteger(
        root.status_code ?? root.statusCode ?? baseResp?.status_code ?? baseResp?.statusCode
    );
    if (statusCode === null || statusCode === 0) return null;

    const message =
        normalizeResponseErrorDetail(root.message) ??
        normalizeResponseErrorDetail(root.msg) ??
        normalizeResponseErrorDetail(root.detail) ??
        normalizeResponseErrorDetail(baseResp?.message) ??
        normalizeResponseErrorDetail(baseResp?.msg) ??
        normalizeResponseErrorDetail(baseResp?.detail);

    return message ? `status_code ${statusCode}: ${message}` : `status_code ${statusCode}`;
}

export async function fetchJson({ url, init, timeoutMs = 30_000 }: FetchJsonOptions): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...init,
            signal: controller.signal,
        });

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`HTTP ${response.status} from ${url}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`);
        }

        const payload = await response.json();
        const providerErrorMessage = extractResponseErrorMessage(payload);
        if (providerErrorMessage) {
            throw new Error(`Provider response error from ${url}: ${providerErrorMessage}`);
        }

        return payload;
    } finally {
        clearTimeout(timer);
    }
}

export function normalizeModelEntries(
    values: unknown[],
    getId: (value: Record<string, unknown>) => string | null
): ProviderModel[] {
    const deduped = new Map<string, ProviderModel>();

    for (const value of values) {
        const model = asRecord(value);
        if (!model) continue;
        const id = getId(model);
        if (!id) continue;
        deduped.set(id, { id, payload: sortKeysDeep(model) });
    }

    return Array.from(deduped.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sortKeysDeep(item));
    }

    if (value && typeof value === "object") {
        const input = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        for (const key of Object.keys(input).sort()) {
            output[key] = sortKeysDeep(input[key]);
        }
        return output;
    }

    return value;
}

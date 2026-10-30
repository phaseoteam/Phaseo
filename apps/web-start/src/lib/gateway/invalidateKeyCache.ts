"use server";

const DEFAULT_API_URL = "http://localhost:8787";

function firstConfiguredEnv(names: string[]): string | null {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return null;
}

function getControlKey(): string | null {
    return firstConfiguredEnv([
        "PHASEO_MANAGEMENT_KEY",
        "PHASEO_CONTROL_KEY",
        "GATEWAY_MANAGEMENT_KEY",
        "AI_STATS_MANAGEMENT_KEY",
        "GATEWAY_CONTROL_KEY",
        "AI_STATS_GATEWAY_KEY",
    ]);
}

function getControlSecret(): string | null {
    return firstConfiguredEnv(["PHASEO_CONTROL_SECRET", "GATEWAY_CONTROL_SECRET"]);
}

export async function invalidateGatewayKeyCache(keyId: string): Promise<void> {
    const controlKey = getControlKey();
    const controlSecret = getControlSecret();
    if (!controlKey) {
        console.warn("[invalidateGatewayKeyCache] Missing management/control key; skipping invalidation");
        return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
    const url = `${baseUrl}/v1/keys/${encodeURIComponent(keyId)}/invalidate`;

    try {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${controlKey}`,
        };
        if (controlSecret) headers["x-control-secret"] = controlSecret;

        const res = await fetch(url, {
            method: "POST",
            headers,
            cache: "no-store",
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("[invalidateGatewayKeyCache] Invalidation failed", res.status, text);
        }
    } catch (err) {
        console.error("[invalidateGatewayKeyCache] Request failed", err);
    }
}

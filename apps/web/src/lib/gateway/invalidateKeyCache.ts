"use server";

const DEFAULT_API_URL = "http://localhost:8787";

function getControlKey(): string | null {
    return process.env.GATEWAY_CONTROL_KEY ?? process.env.AI_STATS_GATEWAY_KEY ?? null;
}

function getControlSecret(): string | null {
    return process.env.GATEWAY_CONTROL_SECRET ?? null;
}

export async function invalidateGatewayKeyCache(keyId: string): Promise<void> {
    const controlKey = getControlKey();
    const controlSecret = getControlSecret();
    if (!controlKey || !controlSecret) {
        console.warn("[invalidateGatewayKeyCache] Missing control credentials; skipping invalidation");
        return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
    const url = `${baseUrl}/api/v1/control/keys/${encodeURIComponent(keyId)}/invalidate`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${controlKey}`,
                "x-control-secret": controlSecret,
            },
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

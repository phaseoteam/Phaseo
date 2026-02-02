// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderAdapter, ProviderExecuteArgs, AdapterResult } from "../types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey, type ResolvedKey } from "../keys";

const BASE_URL = "https://api.openai.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().OPENAI_API_KEY);
}

function proxyHeaders(key: string, extra?: Record<string, string>) {
    return {
        "Authorization": `Bearer ${key}`,
        ...(extra ?? {}),
    };
}

async function streamClone(res: Response) {
    const buffer = await res.arrayBuffer();
    return new Response(buffer, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export const FilesAdapter: ProviderAdapter = {
    name: "openai-files",
    async execute(args: ProviderExecuteArgs): Promise<AdapterResult> {
        const keyInfo = await resolveApiKey(args);
        const headers = proxyHeaders(keyInfo.key);
        const url = args.meta?.requestId && (args as any).endpointPath
            ? `${BASE_URL}${(args as any).endpointPath}`
            : `${BASE_URL}/v1/files`;

        const upstream = await fetch(url, {
            method: (args as any).method ?? "GET",
            headers,
            body: (args as any).body ?? undefined,
        });

        const bill = {
            cost_cents: 0,
            currency: "USD" as const,
            usage: undefined as any,
            upstream_id: upstream.headers.get("x-request-id"),
            finish_reason: null,
        };

        return {
            kind: "completed",
            upstream: await streamClone(upstream),
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    },
};


// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey, type ResolvedKey } from "../../keys";

const BASE_URL = "https://api.openai.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().OPENAI_API_KEY);
}

function makeUrl(path: string) {
    return `${BASE_URL}${path}`;
}

// We treat files endpoints as passthrough: body and headers are raw from incoming request.
export async function exec(args: ProviderExecuteArgs & { endpointPath: string; method: string; body?: BodyInit | null; headers?: HeadersInit }): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const upstream = await fetch(makeUrl(args.endpointPath), {
        method: args.method,
        headers: {
            "Authorization": `Bearer ${keyInfo.key}`,
            ...(args.headers || {}),
        },
        body: args.body,
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: upstream.headers.get("x-request-id"),
        finish_reason: null,
    };

    const clone = upstream.clone();

    return {
        kind: "completed",
        upstream: clone,
        bill,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}


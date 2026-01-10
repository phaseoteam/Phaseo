// apps/api/src/lib/gateway/kv.ts
// Single source of truth for Redis in the Worker.
// - No process.env
// - No c.env at module scope
// - Uses the Cloudflare Upstash client created in runtime/env.ts

import { getRedis } from "@/runtime/env";

// If you prefer explicit usage:
// export function useRedis() { return getRedis(); }

// Backwards-compatible shim so existing `redis.hset(...)` calls keep working:
export const redis = new Proxy({} as any, {
    get(_t, prop: PropertyKey) {
        const client: any = getRedis();
        const val = client[prop];
        return typeof val === "function" ? val.bind(client) : val;
    },
});

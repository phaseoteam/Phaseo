import { Hono, type Context, type Handler } from "hono";
import type { Env } from "@/runtime/types";

/** Defer route/schema initialization until that surface is used. Only the
 * initialized router is retained beyond each request. */
export function lazyRouter(prefix: string | null, load: () => Promise<Hono<Env>>): Handler<Env> {
    let initialized: Promise<Hono<Env>> | undefined;
    const mounts = new Map<string, Hono<Env>>();
    const parents = new WeakMap<Request, Context<Env>>();
    const unmatched = new Response(null, { status: 404 });
    return async (c, next) => {
        initialized ??= load().catch(error => { initialized = undefined; throw error; });
        const router = await initialized;
        const base = prefix ?? (c.req.routePath.replace(/\/?\*$/, "") || "/");
        let mounted = mounts.get(base);
        if (!mounted) {
            mounted = new Hono<Env>();
            mounted.use("*", async (child, next) => {
                const parent = parents.get(child.req.raw);
                if (parent) {
                    child.set("requestId", parent.get("requestId"));
                    child.set("ctx", parent.get("ctx"));
                }
                await next();
                if (parent) {
                    parent.set("requestId", child.get("requestId"));
                    parent.set("ctx", child.get("ctx"));
                }
            });
            mounted.route(base, router);
            mounted.notFound(() => unmatched);
            mounted.onError(error => { throw error; });
            mounts.set(base, mounted);
        }
        let execution: typeof c.executionCtx | undefined;
        try { execution = c.executionCtx; } catch { /* Unit tests may have no Worker context. */ }
        parents.set(c.req.raw, c);
        let response: Response;
        try { response = await mounted.fetch(c.req.raw, c.env, execution); }
        finally { parents.delete(c.req.raw); }
        if (response !== unmatched) return response;
        await next();
        return c.res;
    };
}

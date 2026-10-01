import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.fn();
const source = vi.fn();
const writes: Promise<unknown>[] = [];
vi.mock("@pipeline/before/guards", () => ({ guardAuth: (...args: unknown[]) => auth(...args) }));
vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => source(),
    getBindingsIfConfigured: () => ({ GATEWAY_PUBLIC_BASE_URL: "https://staging.example" }),
    dispatchBackground: (work: Promise<unknown>) => { writes.push(work); },
}));
vi.mock("@/routes/utils", () => ({
    withRuntime: (handler: (request: Request) => Promise<Response>) => (c: { req: { raw: Request } }) => handler(c.req.raw),
    json: (body: unknown, status = 200, headers = {}) => Response.json(body, { status, headers }),
}));

import { providersRoutes } from "./providers";
import { pricingRoutes } from "./pricing";
import { sharedDiscoveryCache } from "./shared-discovery-cache";

function query() {
    const result = { data: [], count: 0, error: null };
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "order", "range", "eq", "in", "lte", "or"]) builder[name] = () => builder;
    builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return builder;
}

beforeEach(() => {
    sharedDiscoveryCache.clearMemory();
    source.mockReset(); auth.mockReset(); writes.length = 0;
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => undefined), put: vi.fn(async (_key: string, response: Response) => { await response.text(); }) } });
    source.mockReturnValue({ from: vi.fn(query) });
    auth.mockResolvedValue({ ok: true, value: { workspaceId: "workspace-a", authMethod: "oauth", oauthScopes: ["providers:read", "pricing:read"] } });
});
afterEach(async () => { await Promise.all(writes); vi.unstubAllGlobals(); });

for (const [name, routes, path] of [["providers", providersRoutes, "/"], ["pricing", pricingRoutes, "/models"]] as const) {
    it(`${name}: shares only public data across authenticated workspaces`, async () => {
        const first = await routes.request(`https://hostile.example${path}`, { headers: { Authorization: "Bearer secret-a", "x-request-id": "request-a" } });
        const body = await first.json();
        auth.mockResolvedValue({ ok: true, value: { workspaceId: "workspace-b", authMethod: "oauth", oauthScopes: ["providers:read", "pricing:read"] } });
        const second = await routes.request(`https://another-host.example${path}`, { headers: { Authorization: "Bearer secret-b", "x-request-id": "request-b" } });
        expect(first.status).toBe(200); expect(second.status).toBe(200);
        expect(await second.json()).toEqual(body);
        expect(source).toHaveBeenCalledTimes(1);
        expect(auth).toHaveBeenCalledTimes(2);
        expect(second.headers.get("Vary")).toBe("Authorization");
        expect(second.headers.get("x-request-id")).toBeNull();
        expect(caches.default.match).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/staging\.example\/__gateway-cache\/discovery\/v1\//));
    });

    it(`${name}: a warmed cache cannot bypass revocation or insufficient scope`, async () => {
        expect((await routes.request(`https://example.com${path}`)).status).toBe(200);
        auth.mockResolvedValueOnce({ ok: false, response: new Response("revoked", { status: 401 }) });
        expect((await routes.request(`https://example.com${path}`)).status).toBe(401);
        auth.mockResolvedValueOnce({ ok: true, value: { workspaceId: "workspace-a", authMethod: "oauth", oauthScopes: [] } });
        expect((await routes.request(`https://example.com${path}`)).status).toBe(403);
        expect(source).toHaveBeenCalledTimes(1);
        expect(caches.default.match).toHaveBeenCalledTimes(1);
    });
}

it("provider pagination uses separate canonical entries, not raw request queries", async () => {
    await providersRoutes.request("https://example.com/?limit=2&offset=0&ignored=one");
    await providersRoutes.request("https://example.com/?offset=0&limit=2&ignored=two");
    await providersRoutes.request("https://example.com/?limit=2&offset=2");
    expect(source).toHaveBeenCalledTimes(2);
});
